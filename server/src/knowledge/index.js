// 도메인 팩 레지스트리 + 도메인 자동 감지 + 지식/법령 조립
import { FIN_KLIB, FIN_KW, FIN_SAMPLE } from './finance.js';
import { AUTO_KLIB, AUTO_KW, AUTO_SAMPLE } from './auto.js';
import { SEC_KLIB, SEC_KW, SEC_DETECT, SEC_SAMPLE } from './securities.js';
import { EXAMPLES } from './examples.js';

export const PACKS = {
  finance: { id: 'finance', label: '금융상품', icon: '🏦', reg: '금융소비자보호법·자본시장법',
    cat: 'finance', kw: FIN_KW, klib: FIN_KLIB, sample: FIN_SAMPLE, prod: '이 금융상품' },
  securities: { id: 'securities', label: '증권(금융투자)', icon: '📈', reg: '금융소비자보호법·자본시장법·투자권유지침',
    cat: 'securities', kw: SEC_KW, detect: SEC_DETECT, klib: SEC_KLIB, sample: SEC_SAMPLE, prod: '이 금융투자상품' },
  auto: { id: 'auto', label: '자동차', icon: '🚗', reg: '표시광고법·자동차관리법·할부거래법',
    cat: 'auto', kw: AUTO_KW, klib: AUTO_KLIB, sample: AUTO_SAMPLE, prod: '이 차량' },
};

// 내규 텍스트를 읽어 어느 도메인인지 자동 판별 (팩별 고유 개념 일치 수)
export function detectDomain(doc) {
  const scores = {};
  for (const key of Object.keys(PACKS)) {
    const seen = new Set();
    // detect가 있으면 감지 전용 목록을 쓴다 — 팩 고유어만으로 판별해 오탐을 줄인다.
    for (const [k, t] of (PACKS[key].detect || PACKS[key].kw)) if (doc.includes(k)) seen.add(t);
    scores[key] = seen.size;
  }
  let best = 'finance', bestN = -1;
  for (const key of Object.keys(scores)) if (scores[key] > bestN) { bestN = scores[key]; best = key; }
  return { domain: best, scores, confidence: bestN };
}

// 행위태그(action tag) — 발화에서 "무엇을 하는가"(설명·고지·교부·확인·권유…)를 나타낸다.
// 의미태그(개념)와 직교하며, ST 매칭 계약의 required_action_tags 를 채운다.
// 도메인 무관 공통 사전 — 내규 문장·룰 제목을 스캔해 유도한다.
export const ACTION_KW = [
  ['설명', 'EXPLAIN'], ['안내', 'NOTIFY'], ['고지', 'NOTIFY'], ['통지', 'NOTIFY'], ['알림', 'NOTIFY'],
  ['교부', 'PROVIDE'], ['제공', 'PROVIDE'], ['발송', 'PROVIDE'], ['전달', 'PROVIDE'],
  ['확인', 'CONFIRM'], ['징구', 'CONFIRM'], ['점검', 'CONFIRM'], ['기록', 'CONFIRM'], ['등록', 'CONFIRM'],
  ['권유', 'RECOMMEND'], ['추천', 'RECOMMEND'],
  ['비교', 'COMPARE'],
  ['구분', 'CLASSIFY'], ['진단', 'CLASSIFY'], ['판정', 'CLASSIFY'], ['분류', 'CLASSIFY'],
  ['녹취', 'RECORD'], ['녹음', 'RECORD'],
  ['금지', 'RESTRICT'], ['제한', 'RESTRICT'], ['거절', 'RESTRICT'], ['거부', 'RESTRICT'],
  ['동의', 'CONSENT'],
];

// 텍스트(내규 원문 + 룰 제목)를 스캔해 행위태그 목록을 유도한다. (중복 제거, 최대 4개)
export function deriveActionTags(text) {
  if (!text) return [];
  const out = [];
  for (const [k, t] of ACTION_KW) if (text.includes(k) && !out.includes(t)) out.push(t);
  return out.slice(0, 4);
}

export function lawOf(domain, tag) {
  const k = PACKS[domain]?.klib[tag];
  if (!k) return '';
  const m = k.know.match(/\[근거\]([^\n]*)/);
  return m ? m[1].trim() : '';
}

// 규칙기반 개념 식별: 내규 각 줄 → 태그 매핑 (첫 등장 줄을 출처로)
export function mapConcepts(domain, doc) {
  const kw = PACKS[domain].kw;
  const lines = doc.split('\n').map((l) => l.trim()).filter((l) => l && !/^\[/.test(l));
  const seen = new Map();
  const log = [];
  const unmatched = [];
  for (const line of lines) {
    const tags = [];
    for (const [k, t] of kw) if (line.includes(k) && !tags.includes(t)) tags.push(t);
    if (tags.length === 0) unmatched.push(line);
    for (const t of tags) if (!seen.has(t)) seen.set(t, line);
    log.push({ line, tags });
  }
  return { seen, log, unmatched };
}

// 태그 → 판단근거(knowledge) 조립: [정의][근거][준수][위반] + 예시, {PRODUCT} 치환
export function buildKnowledge(domain, tag, productName) {
  const k = PACKS[domain].klib[tag];
  if (!k) return { title: tag, severity: 'MEDIUM', knowledge: '', law: '' };
  const ex = EXAMPLES[tag];
  let raw = k.know + (ex ? `\n[준수 예시] ${ex.ok}\n[위반 예시] ${ex.bad}` : '');
  const know = raw.split('{PRODUCT}').join(productName || PACKS[domain].prod);
  return { title: k.title, severity: k.sev || 'MEDIUM', knowledge: know, law: lawOf(domain, tag) };
}
