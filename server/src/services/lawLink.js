// 룰 ↔ 수집된 법령 조문 연결
// AI가 만든 law_basis 자유문자열(예: "금융소비자보호법 제19조 설명의무 — …")을
// 실제 수집된 laws 레코드에 매칭해 rule_laws에 등재한다. (요구사항 3의 마무리)
import db from '../db.js';

// 지식 라이브러리의 약칭 ↔ 국가법령정보센터 정식명 매칭용 코어 토큰
const ALIAS = [
  ['금융소비자보호법', '금융소비자'],
  ['자본시장법', '자본시장'],
  ['예금자보호법', '예금자보호'],
  ['표시광고법', '표시·광고'],
  ['표시·광고의 공정화에 관한 법률', '표시·광고'],
  ['자동차관리법', '자동차관리'],
  ['할부거래법', '할부거래'],
  ['개인정보보호법', '개인정보 보호'],
  ['소비자기본법', '소비자기본'],
  ['조세특례제한법', '조세특례'],
];

// "금융소비자보호법 제19조 설명의무 — …" → { name, article }
export function parseLawBasis(text) {
  if (!text) return null;
  const m = text.match(/([가-힣·A-Za-z]+법(?:률)?)\s*(제\d+조(?:의\d+)?)/);
  if (!m) return null;
  return { name: m[1], article: m[2] };
}

function coreToken(name) {
  const hit = ALIAS.find(([k]) => name.includes(k) || k.includes(name));
  return hit ? hit[1] : name.replace(/법(률)?$/, '');
}

// 수집된 laws에서 (법령명 코어토큰 + 조문번호)로 조문 찾기
const findArticle = db.prepare(
  "SELECT * FROM laws WHERE status='active' AND article_no=? AND law_name LIKE ? LIMIT 1"
);
const linkExists = db.prepare('SELECT 1 FROM rule_laws WHERE rule_id=? AND law_id=?');
const insLink = db.prepare(
  "INSERT OR IGNORE INTO rule_laws (rule_id, law_id, cited_text, linked_by) VALUES (?,?,?,?)"
);

// 한 룰의 law_basis를 파싱해 연결 시도. 성공 시 rule_laws 등재하고 law_id 반환.
export function linkRuleToLaw(ruleId, lawBasis, by = 'ai') {
  const parsed = parseLawBasis(lawBasis);
  if (!parsed) return null;
  const token = coreToken(parsed.name);
  const art = findArticle.get(parsed.article, `%${token}%`);
  if (!art) return null; // 아직 수집 안 된 법령이면 나중에 재연결
  if (!linkExists.get(ruleId, art.id)) {
    insLink.run(ruleId, art.id, `${art.law_name} ${art.article_no}`, by);
  }
  return art.id;
}

// 룰셋 전체를 (재)연결 — 법령을 새로 수집한 뒤 호출하면 미연결분이 붙는다.
export function relinkRuleset(rulesetId) {
  const rules = db.prepare('SELECT id, law_basis FROM rules WHERE ruleset_id=?').all(rulesetId);
  let linked = 0;
  for (const r of rules) if (linkRuleToLaw(r.id, r.law_basis)) linked++;
  return { linked, total: rules.length };
}

// 한 룰에 연결된 법령 조문
export function lawsForRule(ruleId) {
  return db.prepare(`
    SELECT l.id, l.law_name, l.article_no, l.article_title, l.effective_date, rl.linked_by, rl.cited_text
    FROM rule_laws rl JOIN laws l ON l.id = rl.law_id
    WHERE rl.rule_id = ?`).all(ruleId);
}
