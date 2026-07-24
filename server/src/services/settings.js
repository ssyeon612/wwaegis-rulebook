// 런타임 설정 저장소 — 재시작 없이 바꾸는 값(LLM provider·model, 점검 스케줄)을
// SQLite 키-값으로 보관한다. 값이 없으면 .env(그다음 기본값)로 폴백한다.
import db from '../db.js';

db.exec(`CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
)`);

const getStmt = db.prepare('SELECT value FROM app_settings WHERE key=?');
const setStmt = db.prepare(`
  INSERT INTO app_settings (key, value, updated_at) VALUES (?,?,datetime('now'))
  ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')`);
const delStmt = db.prepare('DELETE FROM app_settings WHERE key=?');

export function getSetting(key, fallback = null) {
  const r = getStmt.get(key);
  return r && r.value != null ? r.value : fallback;
}

export function setSetting(key, value) {
  if (value == null || value === '') delStmt.run(key);   // 빈 값이면 .env 폴백으로 되돌림
  else setStmt.run(key, String(value));
}
