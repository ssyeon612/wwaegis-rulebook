// 지식그래프 층 (요구사항 B) — 서빙 룰셋 위에 얹는 근거 추적 그래프.
// 노드: 문서 · 청크 · 룰 · 개념(태그) · 법령조문
// 엣지: 문서-HAS_CHUNK→청크 -DERIVES→룰 -ABOUT→개념 / -GROUNDED_IN→법령
// ※ RS-2 서빙 계약은 건드리지 않는다. 이 층은 "어디서 왔나"만 설명한다.
import db from '../db.js';

// 문서를 청크로 분할(줄 단위) — 없으면 생성
export function ensureChunks(documentId) {
  if (!documentId) return;
  const has = db.prepare('SELECT COUNT(*) c FROM doc_chunks WHERE document_id=?').get(documentId).c;
  if (has) return;
  const doc = db.prepare('SELECT content FROM documents WHERE id=?').get(documentId);
  if (!doc?.content) return;
  const lines = doc.content.split('\n').map((l) => l.trim()).filter((l) => l && !/^\[/.test(l));
  const ins = db.prepare('INSERT INTO doc_chunks (document_id, idx, text) VALUES (?,?,?)');
  db.transaction(() => lines.forEach((t, i) => ins.run(documentId, i, t)))();
}

// 룰의 internal_source(내규 원문)를 청크에 매칭해 chunk_id 연결
export function linkRulesToChunks(rulesetId, documentId) {
  if (!documentId) return;
  ensureChunks(documentId);
  const chunks = db.prepare('SELECT id, text FROM doc_chunks WHERE document_id=?').all(documentId);
  const rules = db.prepare('SELECT id, internal_source, chunk_id FROM rules WHERE ruleset_id=?').all(rulesetId);
  const upd = db.prepare('UPDATE rules SET chunk_id=? WHERE id=?');
  db.transaction(() => {
    for (const r of rules) {
      if (r.chunk_id || !r.internal_source) continue;
      const c = chunks.find((c) => c.text === r.internal_source) ||
                chunks.find((c) => c.text.includes(r.internal_source) || r.internal_source.includes(c.text));
      if (c) upd.run(c.id, r.id);
    }
  })();
}

export function buildGraph(rulesetId) {
  const rs = db.prepare('SELECT * FROM rulesets WHERE id=?').get(rulesetId);
  if (!rs) return null;
  if (rs.document_id) { ensureChunks(rs.document_id); linkRulesToChunks(rulesetId, rs.document_id); }

  const nodes = [], edges = [];
  const add = (id, type, label, extra = {}) => nodes.push({ id, type, label, ...extra });

  const usedChunks = new Set();
  const rules = db.prepare('SELECT * FROM rules WHERE ruleset_id=? ORDER BY order_idx').all(rulesetId);
  const concepts = new Set(), laws = new Map();
  for (const r of rules) {
    add('rule' + r.id, 'rule', r.title, { rule_id: r.id, tag: r.tag, severity: r.severity, status: r.status });
    if (r.chunk_id) {
      usedChunks.add(r.chunk_id);
      edges.push({ from: 'chunk' + r.chunk_id, to: 'rule' + r.id, type: 'DERIVES' });
    }
    if (r.tag) {
      const cid = 'concept' + r.tag;
      if (!concepts.has(r.tag)) { concepts.add(r.tag); add(cid, 'concept', r.tag); }
      edges.push({ from: 'rule' + r.id, to: cid, type: 'ABOUT' });
    }
    const rl = db.prepare('SELECT l.* FROM rule_laws rl JOIN laws l ON l.id=rl.law_id WHERE rl.rule_id=?').all(r.id);
    for (const l of rl) {
      const lid = 'law' + l.id;
      if (!laws.has(l.id)) { laws.set(l.id, l); add(lid, 'law', `${l.law_name} ${l.article_no}`, { article_title: l.article_title }); }
      edges.push({ from: 'rule' + r.id, to: lid, type: 'GROUNDED_IN' });
    }
  }

  // 근거 청크(룰이 참조하는 것)와 그 청크가 속한 문서들 — 추가(append)로 여러 문서일 수 있다
  let docCount = 0;
  if (usedChunks.size) {
    const ph = [...usedChunks].map(() => '?').join(',');
    const chunkRows = db.prepare(`SELECT * FROM doc_chunks WHERE id IN (${ph})`).all(...usedChunks);
    const docIds = [...new Set(chunkRows.map((c) => c.document_id))];
    docCount = docIds.length;
    for (const did of docIds) { const d = db.prepare('SELECT * FROM documents WHERE id=?').get(did); if (d) add('doc' + d.id, 'document', d.name, { format: d.format }); }
    for (const c of chunkRows) {
      add('chunk' + c.id, 'chunk', (c.text || '').slice(0, 40), { text: c.text });
      edges.push({ from: 'doc' + c.document_id, to: 'chunk' + c.id, type: 'HAS_CHUNK' });
    }
  }

  return {
    ruleset: { id: rs.id, name: rs.name, domain: rs.domain, status: rs.status },
    nodes, edges,
    stats: {
      documents: docCount,
      chunks: nodes.filter((n) => n.type === 'chunk').length,
      rules: rules.length,
      concepts: concepts.size,
      laws: laws.size,
      linked_chunks: usedChunks.size,
    },
  };
}

// 한 룰의 근거(문서·청크·개념·법령) — "답변별 근거"의 룰 버전
export function provenance(ruleId) {
  const r = db.prepare('SELECT * FROM rules WHERE id=?').get(ruleId);
  if (!r) return null;
  const rs = db.prepare('SELECT * FROM rulesets WHERE id=?').get(r.ruleset_id);
  const chunk = r.chunk_id ? db.prepare('SELECT * FROM doc_chunks WHERE id=?').get(r.chunk_id) : null;
  const docId = chunk?.document_id || rs?.document_id;   // 추가된 룰은 자기 청크의 문서를 따른다
  const doc = docId ? db.prepare('SELECT id, name, format FROM documents WHERE id=?').get(docId) : null;
  const laws = db.prepare(
    'SELECT l.id, l.law_name, l.article_no, l.article_title, l.content FROM rule_laws rl JOIN laws l ON l.id=rl.law_id WHERE rl.rule_id=?'
  ).all(ruleId);
  return {
    rule: { id: r.id, title: r.title, tag: r.tag, severity: r.severity },
    document: doc, chunk, concept: r.tag, laws, internal_source: r.internal_source,
  };
}
