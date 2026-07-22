// 개념화(conceptualization) 규칙 — 태그·제목에서 상위 개념(스키마 타입)과 의무 유형을 유도한다.
// AutoSchemaKG의 "conceptualization → schema induction"을 도메인 지식 기반 결정적 규칙으로 구현.

// 태그 prefix → 상위 개념(유도 스키마의 node type)
const PREFIX_CONCEPT = {
  RSK: '위험고지', FEE: '비용', SUIT: '적합성', CUST: '적합성', TAX: '세제',
  CTRT: '계약·권리', DISC: '고지', MIS: '부당영업', PROD: '상품설명', CNST: '동의',
  CONF: '확인', PROC: '절차', DOC: '문서교부', RGHT: '권리', COND: '행태', PRIV: '개인정보',
  VEH: '차량정보', FUEL: '차량정보', EV: '차량정보', WRNT: '보증', RECALL: '안전',
  PRICE: '거래조건', FIN: '거래조건', COOL: '계약·권리', DELIV: '거래조건',
  SELLER: '주체', PII: '개인정보', TRADE: '거래조건',
};

// 제목 키워드 → 개념 (태그 명명이 팩·LLM마다 달라도 동작하도록 폴백)
const KEYWORD_CONCEPT = [
  [/손실|원금|위험|변동|예금자보호|배리어|녹인|신용|환율/, '위험고지'],
  [/수수료|보수|비용|환매|총보수|중도상환/, '비용'],
  [/부당|유도|강매|과장|허위|끼워|회피|오인/, '부당영업'],
  [/성향|적합|부적합|소비자\s?구분|투자자정보|권유/, '적합성'],
  [/세제|비과세|추징|세금/, '세제'],
  [/청약철회|위법계약|해지|계약\s?조건|의무.?기간|한도|보상판매/, '계약·권리'],
  [/이해상충|계열|신분|소속/, '고지'],
  [/구조|운용|손익|제원|성능|연비|전비|사고|주행거리|리콜|보증/, '상품설명'],
  [/동의|녹취/, '동의'],
  [/이해\s?여부|확인/, '확인'],
  [/가격|할부|리스|인도|출고|옵션/, '거래조건'],
  [/개인정보/, '개인정보'],
];

// tag 또는 rule 객체 어느 쪽이든 받아 상위 개념을 유도
export function conceptOf(tagOrRule) {
  const tag = typeof tagOrRule === 'string' ? tagOrRule : tagOrRule?.tag;
  const p = String(tag || '').split('_')[0];
  if (PREFIX_CONCEPT[p]) return PREFIX_CONCEPT[p];
  const text = typeof tagOrRule === 'string' ? tag : `${tagOrRule?.title || ''} ${tag || ''}`;
  for (const [re, c] of KEYWORD_CONCEPT) if (re.test(text)) return c;
  return '일반';
}

// 의무 유형(deontic) — 금지 / 확인 / 설명의무 / 고지의무
export function deonticOf(rule) {
  const t = `${rule.title || ''} ${rule.tag || ''}`;
  if (/^MIS/.test(rule.tag || '') || /금지|하지 않는다|유도|강매|과장|허위|회피|끼워/.test(t))
    return { type: '금지', label: '금지' };
  if (/확인/.test(t)) return { type: '확인', label: '확인' };
  if (/설명/.test(t)) return { type: '설명의무', label: '설명' };
  return { type: '고지의무', label: '고지' };
}

// 도메인 주체(Actor)
export function actorOf(domain) {
  // 도메인마다 의무 주체를 부르는 말이 다르다 — 온톨로지의 '주체' 노드 이름이 된다
  return domain === 'auto' ? '판매원' : domain === 'insurance' ? '모집종사자' : '상담원';
}

// 제목에서 행위 접미사를 떼어 "대상 개념"만 남긴다 (엔티티명 정규화)
export function subjectOf(rule) {
  const s = String(rule.title || '').replace(/\s*(고지|설명|확인|안내|금지|점검)\s*(의무|여부|사항)?\s*$/,'').trim();
  return s || rule.title || rule.tag;
}
