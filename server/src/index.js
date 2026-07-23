import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import db from './db.js';
import { activeProvider, activeModel } from './llm/index.js';
import { PACKS } from './knowledge/index.js';
import rulesets from './routes/rulesets.js';
import rs from './routes/rs.js';
import laws from './routes/laws.js';
import { startScheduler, schedulerInfo } from './services/scheduler.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));

// 상태 · 설정
app.get('/api/status', (req, res) => {
  const counts = {
    documents: db.prepare('SELECT COUNT(*) c FROM documents').get().c,
    rulesets: db.prepare('SELECT COUNT(*) c FROM rulesets').get().c,
    published: db.prepare("SELECT COUNT(*) c FROM rulesets WHERE status='published'").get().c,
    rules: db.prepare('SELECT COUNT(*) c FROM rules').get().c,
    laws: db.prepare("SELECT COUNT(DISTINCT law_key) c FROM laws WHERE status='active'").get().c,
    pending_updates: db.prepare("SELECT COUNT(*) c FROM law_updates WHERE status='pending'").get().c,
  };
  res.json({
    ok: true,
    provider: activeProvider(),
    model: activeModel(),
    domains: Object.values(PACKS).map((p) => ({ id: p.id, label: p.label, icon: p.icon, reg: p.reg })),
    counts,
    scheduler: schedulerInfo(),
  });
});

app.use('/api/rulesets', rulesets);
app.use('/api/laws', laws); // 법령 수집·승인
app.use('/api/rs', rs); // ST·STT 소비 엔드포인트

const PORT = process.env.PORT || 4300;
app.listen(PORT, () => {
  console.log(`[rulebook-admin] server → http://localhost:${PORT} · provider=${activeProvider()}`);
  startScheduler(); // 요구사항 4: 법령 자동 점검 예약
});
