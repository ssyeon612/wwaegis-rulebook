// 원격/로컬 LLM 어댑터 (local · gemini · claude 공용)
// 실제 호출부는 provider별 엔드포인트만 다르고, 프롬프트·후처리는 공통.
// ※ 폐쇄망 정책(F1-6): gemini/claude는 데이터가 외부로 나가므로 준법 승인 후에만 사용.
import { detectDomain, mapConcepts, buildKnowledge, deriveActionTags, PACKS, cleanKnowledge } from '../knowledge/index.js';

const ENDPOINTS = {
  local: () => ({
    url: (process.env.LOCAL_LLM_URL || 'http://localhost:11434') + '/api/chat',
    model: process.env.LOCAL_LLM_MODEL || 'gemma2',
    kind: 'ollama',
  }),
  gemini: () => ({
    url: `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || 'gemini-2.0-flash'}:generateContent?key=${process.env.GEMINI_API_KEY || ''}`,
    kind: 'gemini',
  }),
  claude: () => ({
    url: 'https://api.anthropic.com/v1/messages',
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-5',
    kind: 'claude',
  }),
};

// Gemini 구조화 출력 스키마 — 응답 형식을 강제해 JSON 파싱 실패를 막는다.
// (판단근거의 "이해하셨죠?" 같은 인용부호가 이스케이프되지 않아 간헐적으로 깨지던 문제)
const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    rules: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          tag: { type: 'STRING' },
          action_tags: { type: 'ARRAY', items: { type: 'STRING' } },
          severity: { type: 'STRING', enum: ['HIGH', 'MEDIUM', 'LOW'] },
          internal_source: { type: 'STRING' },
          law_basis: { type: 'STRING' },
          // 판단근거는 6개 항목으로 나눠 받고 서버에서 조립한다.
          // 한 문자열로 받으면 모델이 줄바꿈을 자주 빠뜨려 편집창에서 한 줄로 뭉친다.
          knowledge: {
            type: 'OBJECT',
            properties: {
              definition: { type: 'STRING' },
              basis: { type: 'STRING' },
              comply: { type: 'STRING' },
              violate: { type: 'STRING' },
              ok_example: { type: 'STRING' },
              bad_example: { type: 'STRING' },
            },
            required: ['definition', 'basis', 'comply', 'violate', 'ok_example', 'bad_example'],
          },
        },
        required: ['title', 'tag', 'severity', 'internal_source', 'law_basis', 'knowledge'],
      },
    },
  },
  required: ['rules'],
};

const SYSTEM = `당신은 금융/자동차 등 상품 판매 컴플라이언스 전문가다.
입력된 회사 내규(줄 단위)를 읽고, 각 항목을 하나의 준수 규칙(rule)으로 변환하라.
각 rule은 JSON 객체로: {"title","tag","action_tags","severity"(HIGH|MEDIUM|LOW),"internal_source"(내규 원문),"law_basis"(적용 법령 조항),"knowledge"}.
tag는 의미태그 — 영문 대문자와 언더스코어만 쓴 개념 코드다 (예: RSK_LOSS, FEE_BASE, CUST_TYPE). 한글·공백 금지.
action_tags는 행위태그 배열 — 판매직원이 "무엇을 하는가"를 나타내는 코드다. 다음 중에서만 고른다: EXPLAIN(설명) NOTIFY(고지·안내) PROVIDE(교부·제공) CONFIRM(확인·징구·기록) RECOMMEND(권유) COMPARE(비교) CLASSIFY(구분·진단) RECORD(녹취) RESTRICT(금지·제한) CONSENT(동의). 해당 없으면 빈 배열.
knowledge는 [정의] [근거] [준수] [위반] [준수 예시] [위반 예시] 여섯 항목을 이 순서로 쓰되, 각 항목을 반드시 줄바꿈 문자로 구분한다. 슬래시로 이어붙이지 마라.
반드시 JSON 배열만 출력하라.`;

// 사용자가 준 보조 설명(선택) — 내규만으로는 알기 어려운 배경·용어·판단 기준을 담는다.
// 내규 본문과 섞이지 않도록 별도 블록으로 넣는다.
function buildPrompt(doc, hint) {
  const guide = hint?.trim()
    ? `\n--- 담당자 보충 설명 (해석 지침) ---\n${hint.trim()}\n--- 끝 ---\n`
    : '';
  return `${SYSTEM}\n${guide}\n--- 내규 ---\n${doc}\n--- 끝 ---`;
}

async function callLLM(provider, doc, hint) {
  const ep = ENDPOINTS[provider]();
  const prompt = buildPrompt(doc, hint);
  let body, headers = { 'Content-Type': 'application/json' };
  if (ep.kind === 'ollama') {
    body = { model: ep.model, messages: [{ role: 'user', content: prompt }], stream: false, format: 'json' };
  } else if (ep.kind === 'gemini') {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY 미설정');
    body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: GEMINI_SCHEMA,
        maxOutputTokens: 32768, // 조문이 많은 내규는 출력이 길다 — 잘리면 파싱 실패
      },
    };
  } else if (ep.kind === 'claude') {
    if (!process.env.CLAUDE_API_KEY) throw new Error('CLAUDE_API_KEY 미설정');
    headers['x-api-key'] = process.env.CLAUDE_API_KEY;
    headers['anthropic-version'] = '2023-06-01';
    body = { model: ep.model, max_tokens: 4096, messages: [{ role: 'user', content: prompt }] };
  }
  const res = await fetch(ep.url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${provider} HTTP ${res.status}`);
  const data = await res.json();
  // 잘린 응답은 "파싱 실패"로만 보이면 원인을 알 수 없다 — 따로 구분한다.
  const finish = data.candidates?.[0]?.finishReason;
  if (ep.kind === 'gemini' && finish && finish !== 'STOP') {
    throw new Error(`gemini 응답 중단(${finish}) — 내규를 나눠서 올리세요`);
  }
  const text =
    ep.kind === 'ollama' ? data.message?.content :
    ep.kind === 'gemini' ? data.candidates?.[0]?.content?.parts?.[0]?.text :
    data.content?.[0]?.text;
  return text || '';
}

// 판단근거 조립 — gemini는 6개 필드 객체로, 나머지 provider는 문자열로 온다.
const K_LABELS = [
  ['definition', '정의'], ['basis', '근거'], ['comply', '준수'],
  ['violate', '위반'], ['ok_example', '준수 예시'], ['bad_example', '위반 예시'],
];
function composeKnowledge(k) {
  if (!k) return '';
  if (typeof k === 'string') return cleanKnowledge(k);
  return cleanKnowledge(K_LABELS.filter(([f]) => k[f]).map(([f, label]) => `[${label}] ${k[f]}`).join('\n'));
}

export async function llmAnalyze(provider, doc, productName, hint) {
  // 도메인 감지는 규칙기반과 동일 기준으로(감지는 결정적이라 로컬 판별)
  const det = detectDomain(doc);
  let rules;
  try {
    const text = await callLLM(provider, doc, hint);
    const json = JSON.parse(text.replace(/^```json?|```$/g, '').trim());
    rules = (Array.isArray(json) ? json : json.rules || []).map((r, i) => ({
      tag: r.tag || 'GEN',
      title: r.title || '(제목 없음)',
      // 모델이 action_tags 를 빠뜨리면 내규 원문+제목에서 유도해 보완한다.
      action_tags: (Array.isArray(r.action_tags) && r.action_tags.length)
        ? r.action_tags.map((t) => String(t).toUpperCase()).slice(0, 4)
        : deriveActionTags(`${r.internal_source || ''} ${r.title || ''}`),
      severity: ['HIGH', 'MEDIUM', 'LOW'].includes(r.severity) ? r.severity : 'MEDIUM',
      speaker: 'advisor',
      source_rule_id: `${PACKS[det.domain].cat.toUpperCase()}-${String(i + 1).padStart(2, '0')}`,
      internal_source: r.internal_source || '',
      law_basis: r.law_basis || '',
      knowledge: composeKnowledge(r.knowledge),
    }));
  } catch (err) {
    throw new Error(`LLM 응답 파싱 실패: ${err.message}`);
  }
  const { log, unmatched } = mapConcepts(det.domain, doc);
  return { domain: det.domain, detection: det, rules, log, unmatched, engine: `${provider} (LLM)` };
}
