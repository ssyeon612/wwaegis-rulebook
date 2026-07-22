// 표준태그사전 (SSOT) — 컴플라이언스_체크리스트_태깅_가이드.md 파트2 기준.
// 의미태그 82 (모델 출력 69 ● / 비출력 상위로직 13 ○) + 행위태그 10.
// ※ 제품 무관 공용 풀이다. 룰셋은 여기서 골라 쓰고, 없는 개념만 승인제로 신설한다.
// 각 항목: [code, 한글명, output(●=true)].

export const MEANING_GROUPS = [
  { key: 'customer', label: '고객/본인', tags: [
    ['CUST_IDEN', '본인 확인', true], ['CUST_PURP', '상담 목적·요청 확인', true],
    ['CUST_TYPE', '전문·일반 투자자 구분 확인', true], ['CUST_VULN', '취약·보호대상 지위 확인', true],
  ] },
  { key: 'suitability', label: '적합성', tags: [
    ['SUIT_BASE', '권유 근거·적합 사유 설명', true], ['SUIT_GOAL', '투자 목적·기간·자금성격 파악', true],
    ['SUIT_MISF', '가입목적-상품 적합성 불일치', true], ['SUIT_PROF', '투자성향·위험감수 파악', true],
    ['SUIT_RECO', '상품 권유·추천 행위', true], ['SUIT_RSLT', '투자성향 분석결과 설명', true],
    ['SUIT_WISH', '투자권유 희망 여부 확인', true],
  ] },
  { key: 'product', label: '상품설명', tags: [
    ['PROD_COMP', '유사상품·대안 비교 설명', true], ['PROD_PAYO', '수익구조·지급조건 설명', true],
    ['PROD_PROJ', '예상 수익·수익률 근거 설명', true], ['PROD_STRC', '상품 구조·운용방식 설명', true],
  ] },
  { key: 'risk', label: '위험고지', tags: [
    ['RSK_BARR', '조건부 손실 트리거(배리어·녹인) 위험', true], ['RSK_CPLX', '복잡·구조화 상품 위험', true],
    ['RSK_CRED', '신용·발행사 위험', true], ['RSK_DEFLT', '연체·채무불이행 불이익 위험', true],
    ['RSK_EXCL', '면책·부담보·지급제외 고지', true], ['RSK_FX', '환율 변동 위험', true],
    ['RSK_GEN', '핵심 위험사항 포괄 고지', true], ['RSK_LEV', '레버리지·파생 위험', true],
    ['RSK_LIQ', '유동성·환금성 제약 위험', true], ['RSK_LOSS', '원금 손실 가능성', true],
    ['RSK_NODEP', '예금자보호·보장 제외', true], ['RSK_OWNR', '투자 자기책임 원칙', true],
    ['RSK_PREMUP', '보험료·납입금 인상 위험', true], ['RSK_RATEUP', '금리 상승·이자부담 증가 위험', true],
    ['RSK_UNFIT', '부적합·부적정 권유불가 경고·고지', true], ['RSK_VOL', '시장 변동성·가격 변동 위험', true],
  ] },
  { key: 'fee', label: '수수료/비용', tags: [
    ['FEE_BASE', '수수료·보수·비용 설명', true], ['FEE_PNLT', '중도해지·위약 수수료 불이익', true],
    ['FEE_REDEM', '환매·중도해지 조건·비용', true],
  ] },
  { key: 'tax', label: '세제', tags: [
    ['TAX_BNFT', '세제 혜택 설명', true], ['TAX_CLAW', '세제 불이익·추징 고지', true],
    ['TAX_METH', '과세 방식·시기 설명', true],
  ] },
  { key: 'contract', label: '계약/권리', tags: [
    ['CTRT_CNCL', '해지·해약 절차 안내', true], ['CTRT_COOL', '청약철회·숙려 안내', true],
    ['CTRT_DISP', '민원·분쟁 구제 절차 안내', true], ['CTRT_TERM', '계약 조건·의무사항 설명', true],
    ['CTRT_VOID', '위법계약해지권 안내', true],
  ] },
  { key: 'document', label: '문서교부', tags: [
    ['DOC_APPR', '적정성 판단 보고서 교부', false], ['DOC_CTRT', '계약체결 서류 제공', false],
    ['DOC_ELIG', '가입자격·적격확인 서류 제공', false], ['DOC_EXPL', '설명자료·설명서 교부', false],
    ['DOC_MAND', '필수 고지·안내자료 제공', false], ['DOC_PROF', '투자성향 진단결과지 교부', false],
    ['DOC_SUIT', '적합성 보고서 교부', false],
  ] },
  { key: 'consent', label: '동의', tags: [
    ['CNST_3RD', '제3자 동석·조력 동의', true], ['CNST_DEAL', '계약·청약 동의', true],
    ['CNST_INSRD', '피보험자(제3자) 동의', true], ['CNST_REC', '녹취 동의', true],
  ] },
  { key: 'confirmation', label: '확인', tags: [
    ['CONF_CAP', '핵심 조건 재확인·요약', true], ['CONF_FIN', '최종 가입·계약 의사 확인', true],
    ['CONF_FORM', '거래확인서·절차이행 확인서 작성·서명', false], ['CONF_UND', '고객 이해 여부 확인', true],
  ] },
  { key: 'disclosure', label: '고지', tags: [
    ['DISC_BLST', '부적합상품목록 제시·미제시 절차 고지', true], ['DISC_COI', '이해상충·계열 관계 고지', true],
    ['DISC_MTCH', '설명자료-상품 일치 사실 고지', true], ['DISC_SELL', '판매자 신분·권한·소속 고지', true],
  ] },
  { key: 'rights', label: '권리', tags: [
    ['RGHT_ACC', '자료열람요구권 안내', true], ['RGHT_RCUT', '금리인하요구권 안내', true],
  ] },
  { key: 'privacy', label: '개인정보', tags: [
    ['PRIV_COL', '개인정보 수집·이용 동의', true], ['PRIV_SHR', '제3자 제공·마케팅 활용 동의', true],
  ] },
  { key: 'process', label: '절차', tags: [
    ['PROC_CHAN', '문의·연락 채널 안내', true], ['PROC_NEXT', '후속 절차·진행 안내', true],
    ['PROC_REC', '녹음·기록 고지', true],
  ] },
  { key: 'conduct', label: '행태', tags: [
    ['COND_AWAY', '상담 자리이탈·응대 집중 행태', false], ['COND_MGR', '관리직 사전·사후 확인·승인', false],
    ['COND_PLN', '쉬운 말 재설명·부연', true], ['COND_SIGN', '직원 본인 서명·날인 이행', false],
    ['COND_SYS', '시스템 입력·등록 처리', false], ['COND_TIME', '상담 소요시간·시간기준 준수', false],
  ] },
  { key: 'misconduct', label: '위반행위', tags: [
    ['MIS_CHANL', '규제회피 채널전환 유도 행위', true], ['MIS_EVADE', '절차 회피·응답 유도 행위', true],
    ['MIS_KYC', '신원확인 우회 유도 행위', true], ['MIS_MISREP', '상품성격 오인 유발 행위', true],
    ['MIS_REFUS', '부당한 상담·응대 거부 행위', true], ['MIS_TIE', '끼워팔기·꺾기(연계강요)', true],
    ['MIS_UNDUE', '부당권유 행위', true],
  ] },
  { key: 'none', label: '무관', tags: [
    ['NONE', '관련 업무 의미 없음', true],
  ] },
];

// 행위태그 / speech_act (10) — 고정. '어떻게 말했나'.
export const ACTION_TAGS = [
  ['EX', '설명'], ['NT', '안내'], ['QT', '질문'], ['FT', '예고'], ['CF', '확인'],
  ['SM', '잡담'], ['AG', '동의'], ['BC', '맞장구'], ['RF', '거절'], ['NA', '해당없음'],
];

// 조회용 맵 — code → { name, output, group, groupLabel }
export const MEANING_MAP = {};
for (const g of MEANING_GROUPS) for (const [code, name, output] of g.tags)
  MEANING_MAP[code] = { name, output, group: g.key, groupLabel: g.label };

export const ACTION_MAP = Object.fromEntries(ACTION_TAGS);

export const MEANING_CODES = Object.keys(MEANING_MAP);           // 82
export const ACTION_CODES = ACTION_TAGS.map(([c]) => c);          // 10

export const isStandardMeaning = (code) => code != null && code !== '' && code in MEANING_MAP;
export const isStandardAction = (code) => code in ACTION_MAP;
export const meaningName = (code) => MEANING_MAP[code]?.name || null;
export const actionName = (code) => ACTION_MAP[code] || code;

// 저장된 행위태그(JSON 문자열 or 배열) → 배열
export function parseActionTags(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim()) { try { const a = JSON.parse(v); return Array.isArray(a) ? a : []; } catch { return []; } }
  return [];
}
