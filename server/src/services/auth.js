// 인증·권한 — 사용자/세션 저장, 비밀번호 해시(scrypt), 세션 토큰, 역할 가드.
// 역할: master(슈퍼 관리자, 사용자 관리 포함 모든 기능) · approver(사용자 관리 제외 모든 기능) · viewer(읽기 전용)
import crypto from 'crypto';
import db from '../db.js';

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'viewer',      -- master | approver | viewer
  pass TEXT NOT NULL,                        -- salt:hash (scrypt)
  created_at TEXT DEFAULT (datetime('now')),
  last_login TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
`);

export const ROLES = ['master', 'approver', 'viewer'];
export const ROLE_LABEL = { master: '마스터 (슈퍼 관리자)', approver: '편집·승인', viewer: '보기 전용' };

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
export function verifyPassword(pw, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const h = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex'), b = Buffer.from(h, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// 최초 실행 시 master 계정을 시드한다(사용자가 하나도 없을 때만).
export function seedMaster() {
  if (db.prepare('SELECT COUNT(*) c FROM users').get().c > 0) return null;
  const username = process.env.ADMIN_USER || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin1234';
  db.prepare('INSERT INTO users (username, name, role, pass) VALUES (?,?,?,?)')
    .run(username, '슈퍼 관리자', 'master', hashPassword(password));
  return { username, password };
}

const SESSION_DAYS = 7;
export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,datetime('now','+${SESSION_DAYS} days'))`).run(token, userId);
  // 만료 세션 정리(가벼운 GC)
  db.prepare("DELETE FROM sessions WHERE datetime(expires_at) < datetime('now')").run();
  return token;
}
export function deleteSession(token) { if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(token); }
export function sessionUser(token) {
  if (!token) return null;
  const s = db.prepare("SELECT user_id FROM sessions WHERE token=? AND datetime(expires_at) > datetime('now')").get(token);
  if (!s) return null;
  return db.prepare('SELECT id, username, name, role FROM users WHERE id=?').get(s.user_id) || null;
}

export function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

// ── 미들웨어 ──
export function authRequired(req, res, next) {
  const u = sessionUser(bearer(req));
  if (!u) return res.status(401).json({ error: 'unauthorized', message: '로그인이 필요합니다.' });
  req.user = u; next();
}
// viewer(읽기 전용)는 변경(GET 외) 불가
export function writerOnly(req, res, next) {
  if (req.method !== 'GET' && req.user?.role === 'viewer')
    return res.status(403).json({ error: 'forbidden', message: '보기 전용 계정은 변경할 수 없습니다.' });
  next();
}
// master 전용 (사용자 관리)
export function masterOnly(req, res, next) {
  if (req.user?.role !== 'master') return res.status(403).json({ error: 'forbidden', message: '마스터 권한이 필요합니다.' });
  next();
}
