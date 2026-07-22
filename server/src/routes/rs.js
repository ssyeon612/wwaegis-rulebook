// RS API — ST·STT가 소비하는 엔드포인트. 게시된 룰셋만 노출.
// 실제 서빙 서버(/api/rs/loadRuleSet)와 동일한 응답 구조.
import express from 'express';
import crypto from 'crypto';
import db from '../db.js';

const router = express.Router();
const moduleId = 'IRST' + crypto.randomBytes(9).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 12).padEnd(12, '0');
const now = () => new Date().toISOString().replace('Z', '+00:00');

// 저장된 행위태그(JSON 문자열)를 배열로 — 파싱 실패 시 빈 배열
function parseTags(s) {
  if (!s) return [];
  try { const a = JSON.parse(s); return Array.isArray(a) ? a : []; } catch { return []; }
}

function metaOf(rs) {
  return {
    // product_id/product_name 은 STT 목록 표시·외부 상품마스터 참조용. 로드 매칭 키는 ruleset_id 다.
    product_id: rs.product_id || '(외부 상품 마스터)',
    product_name: rs.product_name || rs.name,
    ruleset_id: rs.ruleset_id,
    ruleset_name: rs.name,
    ruleset_version: rs.version,
    category: rs.domain,
    published_at: rs.published_at,
    description: `${rs.domain} 내규 기반 자동 생성`,
    matching_policy: { concurrent_hit_policy: 'allow', speech_act_gate_scope: 'turn', suppression_rules: [], candidate_buckets: ['TAGGING'] },
  };
}
const panelOf = (rs) => ({ panel_id: rs.panel_id, aggregate_method: rs.aggregate_method, block_threshold: rs.block_threshold });

// RS-1 listRuleSets — ST·STT
router.post('/listRuleSets', (req, res) => {
  const cat = req.body?.category;
  let q = "SELECT * FROM rulesets WHERE status='published'";
  const args = [];
  if (cat) { q += ' AND domain=?'; args.push(cat); }
  const rows = db.prepare(q).all(...args);
  res.json({
    responded_at: now(), module_id: moduleId, result: 'SUCCESS',
    rulesets: rows.map((rs) => ({
      meta: metaOf(rs), panel: panelOf(rs),
      rule_count: db.prepare("SELECT COUNT(*) c FROM rules WHERE ruleset_id=? AND status='approved'").get(rs.id).c,
    })),
  });
});

// RS-2 loadRuleSet — ST
router.post('/loadRuleSet', (req, res) => {
  const rid = req.body?.ruleset_id;
  if (!rid) return res.json({ responded_at: now(), module_id: moduleId, result: 'REJECTED', error_category: 'VALIDATION', error_message: 'ruleset_id 필요' });
  const rs = db.prepare("SELECT * FROM rulesets WHERE ruleset_id=? AND status='published'").get(rid);
  if (!rs) return res.json({ responded_at: now(), module_id: moduleId, result: 'FAILURE', error_category: 'NOT_FOUND', error_message: 'ruleset_id 없음' });
  const rules = db.prepare("SELECT * FROM rules WHERE ruleset_id=? AND status='approved' ORDER BY order_idx").all(rs.id);
  res.json({
    responded_at: now(), module_id: moduleId, result: 'SUCCESS',
    ruleset: {
      meta: metaOf(rs), panel: panelOf(rs),
      rules: rules.map((r) => ({
        rule_id: r.rule_uid,
        rule_version: '0.1.0',
        content: { knowledge: r.knowledge, title: r.title, severity: r.severity, references: r.law_basis ? [r.law_basis] : [] },
        source_rule_id: r.source_rule_id,
        matching: { bucket: 'TAGGING', required_speaker_role: r.speaker, required_meaning_tags: r.tag ? [r.tag] : [], required_action_tags: parseTags(r.action_tags) },
      })),
    },
  });
});

// ※ 태그 기준 호출(resolve) API는 두지 않는다.
// 태그 매칭은 ST 매칭엔진이 loadRuleSet 으로 받은 룰셋을 로컬에서 수행한다 —
// RuleSet 정본 엔드포인트는 RS-1 listRuleSets · RS-2 loadRuleSet · RS-3 health_check 뿐이다.

export default router;
