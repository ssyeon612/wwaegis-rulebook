// 법령 수집·조회·승인 API
import express from 'express';
import db from '../db.js';
import { searchLaws, fetchLawArticles } from '../services/lawApi.js';
import { mcpSearchLaws, mcpEnabled } from '../services/mcpLaw.js';
import { syncLaw, approveUpdate, rejectUpdate, listLaws, listArticles, listUpdates, lawHistory } from '../services/lawStore.js';
import { runCheckNow, schedulerInfo } from '../services/scheduler.js';
import { relinkRuleset } from '../services/lawLink.js';

const router = express.Router();
const fail = (res, err) => res.status(400).json({ error: 'law_api_failed', message: err.message });

// 법령 검색 (수집 대상 고르기)
// 하이브리드: 기본은 korean-law-mcp 엔진(약칭·랭킹 이점). MCP 실패 시 기존 직파싱으로 폴백해
// 검색이 절대 죽지 않게 한다. LAW_SEARCH_ENGINE=direct 면 처음부터 직접 호출.
router.get('/search', async (req, res) => {
  const q = req.query.q || '', n = Number(req.query.n) || 20;
  try {
    if (mcpEnabled()) {
      try {
        return res.json({ engine: 'mcp', laws: await mcpSearchLaws(q, n) });
      } catch (mcpErr) {
        console.warn('[law] MCP 검색 실패 → 직접 호출로 폴백:', mcpErr.message);
        return res.json({ engine: 'direct', fallback: true, laws: await searchLaws(q, n) });
      }
    }
    res.json({ engine: 'direct', laws: await searchLaws(q, n) });
  } catch (err) { fail(res, err); }
});

// 수집/갱신 — law_key(법령일련번호) 기준
router.post('/sync', async (req, res) => {
  try {
    const key = String(req.body?.law_key || '').trim();
    if (!key) return res.status(400).json({ error: 'law_key_required' });
    const { meta, articles } = await fetchLawArticles(key);
    res.json(syncLaw(meta, articles));
  } catch (err) { fail(res, err); }
});

router.get('/', (req, res) => res.json(listLaws()));

// 변경 이력 타임라인 (수집·개정반영·감지·반려)
router.get('/history', (req, res) => res.json(lawHistory(Number(req.query.limit) || 200)));
router.get('/:lawKey/articles', (req, res) => res.json(listArticles(req.params.lawKey)));

// 조문 이력(스냅샷) — 요구사항 5
router.get('/article/:lawId/versions', (req, res) =>
  res.json(db.prepare('SELECT * FROM law_versions WHERE law_id=? ORDER BY id DESC').all(req.params.lawId)));

// 스케줄러 — 수동 점검(지금 실행) · 상태
router.get('/scheduler/info', (req, res) => res.json(schedulerInfo()));
router.post('/scheduler/check-now', async (req, res) => {
  try { res.json(await runCheckNow(req.body?.actor || 'manual')); }
  catch (err) { fail(res, err); }
});

// 룰셋을 수집된 법령에 (재)연결
router.post('/relink/:rulesetId', (req, res) => res.json(relinkRuleset(Number(req.params.rulesetId))));

// 갱신 승인 큐
router.get('/updates/list', (req, res) => res.json(listUpdates(req.query.status || 'pending')));
router.get('/updates/count', (req, res) =>
  res.json(db.prepare("SELECT COUNT(*) c FROM law_updates WHERE status='pending'").get()));
router.post('/updates/:id/approve', (req, res) => {
  try { res.json(approveUpdate(Number(req.params.id), req.body?.actor)); }
  catch (err) { fail(res, err); }
});
router.post('/updates/:id/reject', (req, res) => {
  try { res.json(rejectUpdate(Number(req.params.id), req.body?.actor, req.body?.note)); }
  catch (err) { fail(res, err); }
});

export default router;
