// 룰셋별 태그 사전 — 표준을 복제해와 룰셋 안에서 편집(옵션3).
// 처음 접근 시 표준 82+10을 복제하고, 룰이 이미 쓰는 비표준 코드는 custom 으로 함께 등재한다.
import db from '../db.js';
import { STD_MEANING, STD_ACTION, STD_GROUP_LABEL } from '../knowledge/standardTags.js';

const parse = (s) => { if (!s) return []; try { const a = JSON.parse(s); return Array.isArray(a) ? a : []; } catch { return []; } };

const countRows = db.prepare('SELECT COUNT(*) c FROM ruleset_tags WHERE ruleset_id=?');
const insTag = db.prepare(
  'INSERT OR IGNORE INTO ruleset_tags (ruleset_id,kind,code,name,grp,origin) VALUES (?,?,?,?,?,?)'
);

// 룰셋 사전이 비어 있으면 표준 + 사용중 비표준 코드로 시드
export function seedTagset(rulesetId) {
  if (countRows.get(rulesetId).c > 0) return false;
  const rules = db.prepare('SELECT tag, action_tags FROM rules WHERE ruleset_id=?').all(rulesetId);
  db.transaction(() => {
    for (const m of STD_MEANING) insTag.run(rulesetId, 'meaning', m.code, m.name, m.grp, 'standard');
    for (const a of STD_ACTION) insTag.run(rulesetId, 'action', a.code, a.name, null, 'standard');
    const stdM = new Set(STD_MEANING.map((x) => x.code)), stdA = new Set(STD_ACTION.map((x) => x.code));
    const usedM = new Set(), usedA = new Set();
    for (const r of rules) { if (r.tag) usedM.add(r.tag); for (const a of parse(r.action_tags)) usedA.add(a); }
    for (const c of usedM) if (!stdM.has(c)) insTag.run(rulesetId, 'meaning', c, null, null, 'custom');
    for (const c of usedA) if (!stdA.has(c)) insTag.run(rulesetId, 'action', c, null, null, 'custom');
  })();
  return true;
}

// 룰의 태그 사용 횟수
function usage(rulesetId) {
  const m = {}, a = {};
  for (const r of db.prepare('SELECT tag FROM rules WHERE ruleset_id=? AND tag IS NOT NULL').all(rulesetId))
    m[r.tag] = (m[r.tag] || 0) + 1;
  for (const r of db.prepare('SELECT action_tags FROM rules WHERE ruleset_id=?').all(rulesetId))
    for (const c of parse(r.action_tags)) a[c] = (a[c] || 0) + 1;
  return { m, a };
}

export function getTagset(rulesetId) {
  seedTagset(rulesetId);
  const rows = db.prepare('SELECT * FROM ruleset_tags WHERE ruleset_id=? ORDER BY kind, grp, code').all(rulesetId);
  const { m, a } = usage(rulesetId);
  const meaning = rows.filter((r) => r.kind === 'meaning')
    .map((r) => ({ ...r, groupLabel: STD_GROUP_LABEL[r.grp] || r.grp, count: m[r.code] || 0 }));
  const action = rows.filter((r) => r.kind === 'action').map((r) => ({ ...r, count: a[r.code] || 0 }));
  // orphan: 룰이 쓰는데 사전에 없는 코드 (사후 편집으로 생길 수 있음)
  const dictM = new Set(meaning.map((x) => x.code)), dictA = new Set(action.map((x) => x.code));
  const orphans = {
    meaning: Object.keys(m).filter((c) => !dictM.has(c)).map((c) => ({ code: c, count: m[c] })),
    action: Object.keys(a).filter((c) => !dictA.has(c)).map((c) => ({ code: c, count: a[c] })),
  };
  return { meaning, action, orphans };
}

export function addTag(rulesetId, { kind, code, name, grp }) {
  if (!['meaning', 'action'].includes(kind)) throw new Error('kind 오류');
  seedTagset(rulesetId);
  code = String(code || '').trim().toUpperCase();
  if (!code) throw new Error('code 필요');
  insTag.run(rulesetId, kind, code, name || null, grp || null, 'custom');
  return getTagset(rulesetId);
}

export function updateTag(rulesetId, tagId, body) {
  const t = db.prepare('SELECT * FROM ruleset_tags WHERE id=? AND ruleset_id=?').get(tagId, rulesetId);
  if (!t) throw new Error('not_found');
  const fields = ['name', 'active', 'grp'];
  const set = fields.filter((f) => f in body);
  if (set.length)
    db.prepare(`UPDATE ruleset_tags SET ${set.map((f) => `${f}=?`).join(',')} WHERE id=?`).run(...set.map((f) => body[f]), tagId);
  return getTagset(rulesetId);
}

export function removeTag(rulesetId, tagId) {
  const t = db.prepare('SELECT * FROM ruleset_tags WHERE id=? AND ruleset_id=?').get(tagId, rulesetId);
  if (!t) throw new Error('not_found');
  const u = usage(rulesetId);
  const cnt = (t.kind === 'meaning' ? u.m : u.a)[t.code] || 0;
  if (cnt > 0) throw new Error(`사용 중(${cnt}건) — 먼저 교정/이동 후 삭제하세요.`);
  db.prepare('DELETE FROM ruleset_tags WHERE id=?').run(tagId);
  return getTagset(rulesetId);
}

// 코드가 사전에 없으면 custom 으로 추가 (retag 대상 보정용)
export function ensureTag(rulesetId, kind, code) {
  insTag.run(rulesetId, kind, String(code).trim().toUpperCase(), null, null, 1, 'custom');
}
