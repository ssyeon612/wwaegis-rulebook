import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import db from './db.js';
import { activeProvider, activeModel } from './llm/index.js';
import { PACKS } from './knowledge/index.js';
import rulesets from './routes/rulesets.js';
import rs from './routes/rs.js';
import laws from './routes/laws.js';
import settings from './routes/settings.js';
import authRoutes from './routes/auth.js';
import users from './routes/users.js';
import { authRequired, writerOnly, masterOnly, seedMaster } from './services/auth.js';
import { startScheduler, schedulerInfo } from './services/scheduler.js';
import { applyPendingAmendments } from './services/lawStore.js';

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
    // 개정은 즉시 반영된다 — 최근 7일간 자동 반영된 개정 건수(헤더 종 알림용).
    recent_amendments: db.prepare("SELECT COUNT(*) c FROM law_updates WHERE status='applied' AND datetime(COALESCE(reviewed_at, detected_at)) >= datetime('now','-7 days')").get().c,
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

// 인증 — 로그인/로그아웃/me (열려 있음)
app.use('/api/auth', authRoutes);
// 관리 API — 로그인 필요. viewer(읽기 전용)는 변경 불가. 사용자 관리는 master 전용.
app.use('/api/rulesets', authRequired, writerOnly, rulesets);
app.use('/api/laws', authRequired, writerOnly, laws); // 법령 수집·개정 반영
app.use('/api/settings', authRequired, writerOnly, settings); // 런타임 설정 (LLM·스케줄·경로)
app.use('/api/users', authRequired, masterOnly, users); // 사용자 관리 (master)
app.use('/api/rs', rs); // ST·STT 소비 엔드포인트 (외부 시스템 — 세션 인증 대상 아님)

const PORT = process.env.PORT || 4300;
app.listen(PORT, () => {
  console.log(`[rulebook-admin] server → http://localhost:${PORT} · provider=${activeProvider()}`);
  const seeded = seedMaster(); // 최초 실행 시 master 계정 시드
  if (seeded) console.log(`[rulebook-admin] ⚑ 최초 마스터 계정 생성 — id: ${seeded.username} / pw: ${seeded.password} (로그인 후 비밀번호 변경 권장)`);
  const applied = applyPendingAmendments(); // 정책 전환: 대기 중이던 개정을 즉시 반영
  if (applied) console.log(`[rulebook-admin] 대기 개정 ${applied}건 즉시 반영 완료`);
  startScheduler(); // 법령 자동 점검 예약 (감지 즉시 반영)

});
