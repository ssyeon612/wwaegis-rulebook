// AI 스키마 제안 (AutoSchemaKG 방법론 · 저작 보조 · "제안까지만")
// 내규 원문을 자유 스캔해 개념을 뽑고, 현재 룰셋과 DIFF 해서
// "내규에 있으나 룰이 없는" 개념을 룰 초안으로 제안한다.
// ※ 운영 스키마는 건드리지 않는다. 채택은 사람이 하며, 채택 시에만 draft 룰이 생긴다.
import db from '../../db.js';
import { PACKS, buildKnowledge } from '../../knowledge/index.js';
import { conceptOf } from './taxonomy.js';
import { logChange } from '../history.js';
import { linkRuleToLaw } from '../lawLink.js';

// 이 룰셋이 참조하는 문서들의 청크(원본 내규 조항)
function rulesetChunks(rulesetId) {
  return db.prepare(`
    SELECT DISTINCT c.* FROM doc_chunks c
    WHERE c.document_id IN (
      SELECT document_id FROM rulesets WHERE id=@id AND document_id IS NOT NULL
      UNION
      SELECT dc.document_id FROM rules r JOIN doc_chunks dc ON dc.id = r.chunk_id WHERE r.ruleset_id=@id
    ) ORDER BY c.id`).all({ id: rulesetId });
}

function firstKeyword(pack, tag, text) {
  for (const [kw, t] of pack.kw) if (t === tag && text.includes(kw)) return kw;
  return tag;
}

export function buildProposals(rulesetId) {
  const rs = db.prepare('SELECT * FROM rulesets WHERE id=?').get(rulesetId);
  if (!rs) return null;
  const pack = PACKS[rs.domain];
  if (!pack) return { proposals: [], covered: 0, scanned_chunks: 0 };

  // 기존 룰 — 태그명이 팩/LLM마다 달라(예: TAX_BNFT vs TAX_BENEFIT) 정확 일치로는 커버 판정 불가.
  // 개념(conceptOf) + 제목 키워드 포함으로 "같은 의무가 이미 있나"를 본다.
  const rules = db.prepare('SELECT tag, title FROM rules WHERE ruleset_id=?').all(rulesetId);
  const isCovered = (tag, kw) => {
    const cpt = conceptOf(tag);
    return rules.some((r) => conceptOf(r) === cpt && (r.tag === tag || (r.title || '').includes(kw)));
  };
  const dis = new Set(db.prepare('SELECT tag FROM kg_dismissed WHERE ruleset_id=?').all(rulesetId).map((r) => r.tag));
  const chunks = rulesetChunks(rulesetId);

  // 자유 스캔: 청크 텍스트에서 개념(tag) 발견 → 태그별 근거 청크 1개
  const evidence = new Map();
  for (const c of chunks) {
    for (const [kw, tag] of pack.kw) {
      if (c.text.includes(kw) && !evidence.has(tag)) evidence.set(tag, c);
    }
  }

  const proposals = [];
  for (const [tag, chunk] of evidence) {
    if (dis.has(tag)) continue; // 무시함
    const kw = firstKeyword(pack, tag, chunk.text);
    if (isCovered(tag, kw)) continue; // 같은 개념+키워드의 룰이 이미 있음
    const k = buildKnowledge(rs.domain, tag);
    proposals.push({
      tag,
      concept: conceptOf(tag),
      title: k.title,
      severity: k.severity,
      knowledge: k.knowledge,
      law_basis: k.law,
      evidence_chunk_id: chunk.id,
      evidence_text: chunk.text,
      rationale: `내규에 '${kw}' 개념이 있으나 대응 룰이 없습니다.`,
    });
  }
  return { proposals, covered: rules.length, scanned_chunks: chunks.length, domain: rs.domain };
}

// 채택 → draft 룰 생성 (일반 룰과 동일하게 검토·승인·게시 흐름으로)
export function acceptProposal(rulesetId, tag, chunkId) {
  const rs = db.prepare('SELECT * FROM rulesets WHERE id=?').get(rulesetId);
  if (!rs) throw new Error('룰셋 없음');
  if (db.prepare('SELECT 1 FROM rules WHERE ruleset_id=? AND tag=?').get(rulesetId, tag))
    throw new Error('이미 이 개념의 룰이 있습니다');
  const k = buildKnowledge(rs.domain, tag);
  const chunk = chunkId ? db.prepare('SELECT * FROM doc_chunks WHERE id=?').get(chunkId) : null;
  const cat = (PACKS[rs.domain]?.cat || 'rule').toUpperCase();
  const idx = db.prepare('SELECT COALESCE(MAX(order_idx),-1) m FROM rules WHERE ruleset_id=?').get(rulesetId).m + 1;
  const sid = `${cat}-${String(idx + 1).padStart(2, '0')}`;

  const ruleId = db.prepare(
    `INSERT INTO rules (ruleset_id, order_idx, tag, title, severity, speaker, source_rule_id, internal_source, law_basis, knowledge, chunk_id, status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?, 'draft')`
  ).run(rulesetId, idx, tag, k.title, k.severity, 'advisor', sid, chunk?.text || null, k.law, k.knowledge, chunkId || null).lastInsertRowid;

  logChange({ rule_id: ruleId, ruleset_id: rulesetId, field: 'created', new_value: k.title, source: 'ai_proposal', actor: 'AutoSchemaKG 제안' });
  linkRuleToLaw(ruleId, k.law, 'ai');
  return { ok: true, rule_id: ruleId };
}

export function dismissProposal(rulesetId, tag) {
  db.prepare('INSERT OR IGNORE INTO kg_dismissed (ruleset_id, tag) VALUES (?,?)').run(rulesetId, tag);
  return { ok: true };
}
