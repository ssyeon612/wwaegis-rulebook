// 법령 자동 점검 스케줄러 (요구사항 4)
// 수집된 각 법령을 주기적으로 국가법령정보센터에서 다시 받아 개정을 감지한다.
// 감지된 개정은 syncLaw가 law_updates에 pending으로 쌓고, 사용자가 승인해야 반영된다.
import cron from 'node-cron';
import db from '../db.js';
import { fetchLawArticles } from './lawApi.js';
import { syncLaw } from './lawStore.js';

const CRON = process.env.LAW_CHECK_CRON || '30 6 * * *'; // 기본: 매일 06:30
let task = null;
let lastRun = null;
let running = false;

// 수집된 법령 목록(law_key 중복 제거)을 다시 받아 변경 감지
export async function runCheckNow(actor = 'scheduler') {
  if (running) return { skipped: 'already_running' };
  running = true;
  const started = new Date().toISOString();
  const keys = db.prepare("SELECT DISTINCT law_key FROM laws WHERE status='active'").all();
  const summary = { started, actor, checked: 0, changed: 0, added: 0, errors: [], laws: [] };
  try {
    if (!process.env.LAW_API_OC) throw new Error('LAW_API_OC 미설정 — 법령 점검 불가');
    for (const { law_key } of keys) {
      try {
        const { meta, articles } = await fetchLawArticles(law_key);
        const r = syncLaw(meta, articles);
        summary.checked++;
        summary.changed += r.changed;
        summary.added += r.added;
        summary.laws.push({ law_name: r.law_name, changed: r.changed, added: r.added });
      } catch (err) {
        summary.errors.push({ law_key, message: err.message });
      }
    }
  } catch (err) {
    summary.errors.push({ message: err.message });
  }
  summary.finished = new Date().toISOString();
  lastRun = summary;
  running = false;
  return summary;
}

export function startScheduler() {
  if (!cron.validate(CRON)) { console.warn(`[scheduler] 잘못된 CRON: ${CRON}`); return; }
  task = cron.schedule(CRON, () => { runCheckNow('scheduler').catch(() => {}); });
  console.log(`[scheduler] 법령 점검 예약 · CRON="${CRON}" · OC=${process.env.LAW_API_OC ? '설정됨' : '미설정(수동만)'}`);
}

export function schedulerInfo() {
  return {
    cron: CRON,
    enabled: !!task,
    oc_configured: !!process.env.LAW_API_OC,
    running,
    last_run: lastRun,
  };
}
