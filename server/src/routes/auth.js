// 인증 API — 로그인/로그아웃/현재 사용자
import express from 'express';
import db from '../db.js';
import { verifyPassword, createSession, deleteSession, bearer, authRequired } from '../services/auth.js';

const router = express.Router();

router.post('/login', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = req.body?.password || '';
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(username);
  if (!u || !verifyPassword(password, u.pass))
    return res.status(401).json({ error: 'bad_credentials', message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
  const token = createSession(u.id);
  db.prepare("UPDATE users SET last_login=datetime('now') WHERE id=?").run(u.id);
  res.json({ token, user: { id: u.id, username: u.username, name: u.name, role: u.role } });
});

router.post('/logout', (req, res) => { deleteSession(bearer(req)); res.json({ ok: true }); });

router.get('/me', authRequired, (req, res) => res.json({ user: req.user }));

export default router;
