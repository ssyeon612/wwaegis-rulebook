// 규칙기반 스키마 유도 (오프라인·폐쇄망) — 룰+청크+법령에서 트리플과 개념을 유도.
// AutoSchemaKG의 2단계(트리플 추출 → 개념화)를 도메인 지식으로 결정적 구현.
import db from '../../db.js';
import { conceptOf, deonticOf, actorOf, subjectOf } from './taxonomy.js';

export function induceRuleBased(rs, rules) {
  const actor = actorOf(rs.domain);
  const entities = new Map();
  const triples = [];
  const nodeTypes = new Set(['주체']);
  const relTypes = new Set();

  const ent = (name, etype, concept, chunk_id = null, rule_id = null) => {
    if (name && !entities.has(name)) entities.set(name, { name, etype, concept, chunk_id, rule_id });
    return name;
  };
  ent(actor, '주체', '주체');

  for (const r of rules) {
    const concept = conceptOf(r);
    nodeTypes.add(concept);
    const subject = subjectOf(r);
    ent(subject, '개념', concept, r.chunk_id, r.id);

    // ① 의무 트리플: (주체) —[고지/설명/금지/확인]→ (대상 개념)
    const d = deonticOf(r);
    relTypes.add(d.label);
    triples.push({ s: actor, rel: d.label, o: subject, deontic: d.type, severity: r.severity, rule_id: r.id, chunk_id: r.chunk_id });

    // ② 개념화 트리플: (대상 개념) —[유형]→ (상위 개념)  ← 스키마 유도의 핵심
    relTypes.add('유형');
    triples.push({ s: subject, rel: '유형', o: concept, deontic: null, severity: null, rule_id: r.id, chunk_id: r.chunk_id });
    ent(concept, '개념타입', concept);

    // ③ 근거 트리플: (대상 개념) —[근거]→ (법령 조문)
    const laws = db.prepare('SELECT l.law_name, l.article_no FROM rule_laws rl JOIN laws l ON l.id=rl.law_id WHERE rl.rule_id=?').all(r.id);
    for (const l of laws) {
      const ln = `${l.law_name} ${l.article_no}`;
      ent(ln, '법령', '법령', null, r.id);
      nodeTypes.add('법령');
      relTypes.add('근거');
      triples.push({ s: subject, rel: '근거', o: ln, deontic: null, severity: null, rule_id: r.id, chunk_id: null });
    }
  }

  return {
    entities: [...entities.values()],
    triples,
    schema: { node_types: [...nodeTypes], relation_types: [...relTypes] },
    engine: 'ruleBased (오프라인)',
  };
}
