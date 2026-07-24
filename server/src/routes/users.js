// 사용자 관리 API — master 전용(마운트 시 masterOnly 가드). 비밀번호는 절대 반환하지 않는다.
import express from 'express';
import db from '../db.js';
import { hashPassword, ROLES } from '../services/auth.js';

const router = express.Router();
const masterCount = () => db.prepare("SELECT COUNT(*) c FROM users WHERE role='master'").get().c;

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT id, username, name, role, created_at, last_login FROM users ORDER BY id').all());
});

router.post('/', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const { name, role, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'bad_request', message: '아이디와 비밀번호가 필요합니다.' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'bad_role', message: '권한 값이 올바르지 않습니다.' });
  if (db.prepare('SELECT 1 FROM users WHERE username=?').get(username)) return res.status(409).json({ error: 'dup', message: '이미 있는 아이디입니다.' });
  const r = db.prepare('INSERT INTO users (username, name, role, pass) VALUES (?,?,?,?)').run(username, name || username, role, hashPassword(password));
  res.json({ id: r.lastInsertRowid });
});

router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  if (!u) return res.status(404).json({ error: 'not_found' });
  const { name, role, password } = req.body || {};
  if (role !== undefined && !ROLES.includes(role)) return res.status(400).json({ error: 'bad_role' });
  // 마지막 master 의 권한 강등 방지
  if (role && role !== 'master' && u.role === 'master' && masterCount() <= 1)
    return res.status(400).json({ error: 'last_master', message: '마지막 마스터의 권한은 변경할 수 없습니다.' });
  if (name !== undefined) db.prepare('UPDATE users SET name=? WHERE id=?').run(name, id);
  if (role !== undefined) db.prepare('UPDATE users SET role=? WHERE id=?').run(role, id);
  if (password) { db.prepare('UPDATE users SET pass=? WHERE id=?').run(hashPassword(password), id); db.prepare('DELETE FROM sessions WHERE user_id=?').run(id); }
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  if (!u) return res.status(404).json({ error: 'not_found' });
  if (id === req.user.id) return res.status(400).json({ error: 'self', message: '자기 자신은 삭제할 수 없습니다.' });
  if (u.role === 'master' && masterCount() <= 1) return res.status(400).json({ error: 'last_master', message: '마지막 마스터는 삭제할 수 없습니다.' });
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
  db.prepare('DELETE FROM users WHERE id=?').run(id);
  res.json({ ok: true });
});

export default router;
