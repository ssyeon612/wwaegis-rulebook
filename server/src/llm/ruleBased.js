// 규칙기반 분석기 (기본·오프라인) — 도메인 자동 감지 → 개념 식별 → 지식/법령 조립
import { detectDomain, mapConcepts, buildKnowledge, deriveActionTags, PACKS } from '../knowledge/index.js';

export function ruleBasedAnalyze(doc, productName) {
  const det = detectDomain(doc);
  const domain = det.domain;
  const { seen, log, unmatched } = mapConcepts(domain, doc);
  const rules = [];
  let i = 0;
  for (const [tag, internal] of seen) {
    const k = buildKnowledge(domain, tag, productName);
    rules.push({
      tag,
      title: k.title,
      severity: k.severity,
      speaker: 'advisor',
      source_rule_id: `${PACKS[domain].cat.toUpperCase()}-${String(++i).padStart(2, '0')}`,
      internal_source: internal,
      law_basis: k.law,
      knowledge: k.knowledge,
      action_tags: deriveActionTags(`${internal} ${k.title}`),
    });
  }
  return {
    domain,
    detection: det,
    rules,
    log,
    unmatched,
    engine: 'ruleBased (오프라인)',
  };
}
