// 룰/룰셋 변경 이력 기록·조회 (요구사항 5)
// - 사용자 편집(user_edit) · AI 추출(ai_extract) · 법령 반영(law_update)을 한 테이블에 남긴다.
import db from '../db.js';

const ins = db.prepare(`
  INSERT INTO rule_history (rule_id, ruleset_id, field, old_value, new_value, source, actor)
  VALUES (@rule_id,@ruleset_id,@field,@old_value,@new_value,@source,@actor)`);

export function logChange({ rule_id, ruleset_id = null, field, old_value = null, new_value = null, source = 'user_edit', actor = 'admin' }) {
  ins.run({ rule_id, ruleset_id, field, old_value: str(old_value), new_value: str(new_value), source, actor });
}

// 룰 편집 시 바뀐 필드만 기록
export function logRuleEdit(ruleId, before, after, actor = 'admin') {
  for (const f of Object.keys(after)) {
    if (before[f] !== after[f]) {
      logChange({ rule_id: ruleId, ruleset_id: before.ruleset_id, field: f, old_value: before[f], new_value: after[f], source: 'user_edit', actor });
    }
  }
}

export function ruleHistory(ruleId) {
  return db.prepare('SELECT * FROM rule_history WHERE rule_id=? ORDER BY id DESC').all(ruleId);
}

export function rulesetHistory(rulesetId) {
  return db.prepare(`
    SELECT h.*, r.title AS rule_title, r.tag
    FROM rule_history h JOIN rules r ON r.id = h.rule_id
    WHERE r.ruleset_id = ? ORDER BY h.id DESC LIMIT 300`).all(rulesetId);
}

function str(v) { return v == null ? null : String(v); }
