// 근거 경로(Trust Path) + 근거 신뢰도 — TrustGraph 개념 채택 (저작·감사 층)
// 흩어진 provenance 조각(청크·법령·이력·출처)을 하나의 감사 가능한 경로로 통합한다.
// ※ 서빙 RS-2 계약은 건드리지 않는다.
import db from '../db.js';

const METHOD_LABEL = { ai_extract: 'AI 추출', ai_proposal: 'AI 제안', user_edit: '사람 작성', manual: '사람 작성' };

const lawCount = db.prepare('SELECT COUNT(*) c FROM rule_laws WHERE rule_id=?');
const createdSrc = db.prepare("SELECT source FROM rule_history WHERE rule_id=? AND field='created' ORDER BY id LIMIT 1");
const humanTouched = db.prepare("SELECT 1 FROM rule_history WHERE rule_id=? AND source='user_edit' LIMIT 1");

// 룰의 근거 플래그 + 등급
export function ruleFlags(r) {
  const has_chunk = !!r.chunk_id;
  const law_linked = lawCount.get(r.id).c > 0;   // 실제 수집 조문에 연결
  const law_cited = !!r.law_basis;               // AI가 조항 명시(약한 근거)
  const has_law = law_linked || law_cited;
  const approved = r.status === 'approved';
  const published = !!r.rule_uid;
  const grounded = has_chunk && has_law;
  const grade = grounded && approved ? 'strong' : (has_chunk || has_law) ? 'medium' : 'weak';
  return { has_chunk, law_linked, law_cited, has_law, approved, published, grade };
}

// 룰셋 근거 신뢰도 — 커버리지 + 룰별 플래그
export function rulesetTrust(rulesetId) {
  const rules = db.prepare('SELECT * FROM rules WHERE ruleset_id=? ORDER BY order_idx').all(rulesetId);
  const per = rules.map((r) => ({ id: r.id, tag: r.tag, title: r.title, ...ruleFlags(r) }));
  const cov = {
    total: per.length,
    has_chunk: per.filter((x) => x.has_chunk).length,
    has_law: per.filter((x) => x.has_law).length,
    law_linked: per.filter((x) => x.law_linked).length,
    approved: per.filter((x) => x.approved).length,
    published: per.filter((x) => x.published).length,
    // 등급은 셋이다 — medium 을 빼면 강+약이 total 과 안 맞아 화면 숫자가 모순된다.
    strong: per.filter((x) => x.grade === 'strong').length,
    medium: per.filter((x) => x.grade === 'medium').length,
    weak: per.filter((x) => x.grade === 'weak').length,
  };
  return { coverage: cov, rules: per };
}

// 한 룰의 근거 경로 — 내규 문서 → 조항 → 추출 방법 → 룰 → 법령 → 서빙
export function trustPath(ruleId) {
  const r = db.prepare('SELECT * FROM rules WHERE id=?').get(ruleId);
  if (!r) return null;
  const rs = db.prepare('SELECT * FROM rulesets WHERE id=?').get(r.ruleset_id);
  const chunk = r.chunk_id ? db.prepare('SELECT * FROM doc_chunks WHERE id=?').get(r.chunk_id) : null;
  const docId = chunk?.document_id || rs?.document_id;
  const doc = docId ? db.prepare('SELECT id, name FROM documents WHERE id=?').get(docId) : null;
  const laws = db.prepare('SELECT l.law_name, l.article_no, l.article_title FROM rule_laws rl JOIN laws l ON l.id=rl.law_id WHERE rl.rule_id=?').all(ruleId);
  const method = createdSrc.get(ruleId)?.source || null;
  const edited = !!humanTouched.get(ruleId);
  const flags = ruleFlags(r);

  const steps = [
    { kind: 'document', label: '내규 문서', detail: doc?.name || '(없음)', ok: !!doc },
    { kind: 'chunk', label: '조항(청크)', detail: chunk?.text || r.internal_source || '(근거 청크 없음)', ok: !!(chunk || r.internal_source), warn: !chunk },
    { kind: 'method', label: '추출 방법', detail: (METHOD_LABEL[method] || '미상') + (edited ? ' · 사람 편집' : ''), ok: !!method },
    { kind: 'rule', label: '룰', detail: `${r.title} · ${r.tag}` + (flags.approved ? ' · 승인' : ' · 검토중'), ok: true, warn: !flags.approved },
    { kind: 'law', label: '법령 조문', detail: laws.length ? laws.map((l) => `${l.law_name} ${l.article_no}${l.article_title ? `(${l.article_title})` : ''}`).join('; ') : (r.law_basis || '(연결 없음)'), ok: laws.length > 0 || !!r.law_basis, warn: laws.length === 0 },
    { kind: 'serve', label: '서빙', detail: r.rule_uid ? `게시됨 · ${r.rule_uid}` : '미게시(초안)', ok: !!r.rule_uid, warn: !r.rule_uid },
  ];
  return {
    rule: { id: r.id, title: r.title, tag: r.tag },
    grade: flags.grade,
    method: METHOD_LABEL[method] || null,
    flags,
    steps,
  };
}
