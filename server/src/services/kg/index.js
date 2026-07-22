// 지식그래프 오케스트레이터 (AutoSchemaKG 방법론) — 유도·저장·조회.
//  ruleBased : 오프라인 결정적 트리플/개념 유도 (기본·폐쇄망)
//  LLM 슬롯  : provider!=ruleBased 시 LLM 유도로 교체 가능 (현재는 ruleBased 폴백)
import db from '../../db.js';
import { activeProvider } from '../../llm/index.js';
import { ensureChunks, linkRulesToChunks } from '../graph.js';
import { induceRuleBased } from './ruleBasedKG.js';

const delEnt = db.prepare('DELETE FROM kg_entities WHERE ruleset_id=?');
const delTri = db.prepare('DELETE FROM kg_triples WHERE ruleset_id=?');
const delSch = db.prepare('DELETE FROM kg_schema WHERE ruleset_id=?');
const insEnt = db.prepare('INSERT INTO kg_entities (ruleset_id,name,etype,concept,chunk_id,rule_id) VALUES (@ruleset_id,@name,@etype,@concept,@chunk_id,@rule_id)');
const insTri = db.prepare('INSERT INTO kg_triples (ruleset_id,subject,relation,object,deontic,severity,rule_id,chunk_id) VALUES (@ruleset_id,@subject,@relation,@object,@deontic,@severity,@rule_id,@chunk_id)');
const insSch = db.prepare('INSERT OR IGNORE INTO kg_schema (ruleset_id,kind,name) VALUES (?,?,?)');

function store(rulesetId, result) {
  db.transaction(() => {
    delEnt.run(rulesetId); delTri.run(rulesetId); delSch.run(rulesetId);
    for (const e of result.entities)
      insEnt.run({ ruleset_id: rulesetId, name: e.name, etype: e.etype, concept: e.concept, chunk_id: e.chunk_id ?? null, rule_id: e.rule_id ?? null });
    for (const t of result.triples)
      insTri.run({ ruleset_id: rulesetId, subject: t.s, relation: t.rel, object: t.o, deontic: t.deontic ?? null, severity: t.severity ?? null, rule_id: t.rule_id ?? null, chunk_id: t.chunk_id ?? null });
    for (const n of result.schema.node_types) insSch.run(rulesetId, 'node', n);
    for (const r of result.schema.relation_types) insSch.run(rulesetId, 'relation', r);
  })();
}

// 지식그래프 (재)생성 — 트리플 추출 + 개념화로 스키마 유도 후 저장
export function buildKG(rulesetId) {
  const rs = db.prepare('SELECT * FROM rulesets WHERE id=?').get(rulesetId);
  if (!rs) return null;
  if (rs.document_id) { ensureChunks(rs.document_id); linkRulesToChunks(rulesetId, rs.document_id); }
  const rules = db.prepare('SELECT * FROM rules WHERE ruleset_id=? ORDER BY order_idx').all(rulesetId);

  // 현재는 ruleBased(결정적) 유도. provider가 LLM이면 이 자리에 LLM 유도를 꽂는다.
  const result = induceRuleBased(rs, rules);
  store(rulesetId, result);
  return {
    engine: result.engine,
    provider: activeProvider(),
    counts: {
      entities: result.entities.length,
      triples: result.triples.length,
      node_types: result.schema.node_types.length,
      relation_types: result.schema.relation_types.length,
    },
    schema: result.schema,
  };
}

// 저장된 지식그래프 조회 (없으면 즉석 생성)
export function getKG(rulesetId) {
  let ents = db.prepare('SELECT * FROM kg_entities WHERE ruleset_id=?').all(rulesetId);
  if (ents.length === 0) {
    const built = buildKG(rulesetId);
    if (!built) return null;
    ents = db.prepare('SELECT * FROM kg_entities WHERE ruleset_id=?').all(rulesetId);
  }
  const triples = db.prepare('SELECT * FROM kg_triples WHERE ruleset_id=?').all(rulesetId);
  const schemaRows = db.prepare('SELECT kind,name FROM kg_schema WHERE ruleset_id=?').all(rulesetId);
  const rs = db.prepare('SELECT id,name,domain,status FROM rulesets WHERE id=?').get(rulesetId);
  return {
    ruleset: rs,
    entities: ents,
    triples,
    schema: {
      node_types: schemaRows.filter((r) => r.kind === 'node').map((r) => r.name),
      relation_types: schemaRows.filter((r) => r.kind === 'relation').map((r) => r.name),
    },
    stats: { entities: ents.length, triples: triples.length },
  };
}
