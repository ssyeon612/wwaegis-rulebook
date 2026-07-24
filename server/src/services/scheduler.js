// 법령 자동 점검 스케줄러 (요구사항 4)
// 수집된 각 법령을 주기적으로 국가법령정보센터에서 다시 받아 개정을 감지한다.
// 감지된 개정은 syncLaw가 즉시 반영하고 law_updates(status='applied')에 as-is/to-be 로 기록한다.
import cron from 'node-cron';
import db from '../db.js';
import { fetchLawArticles } from './lawApi.js';
import { syncLaw } from './lawStore.js';
import { getSetting, setSetting } from './settings.js';

// 점검 주기(cron)는 설정(app_settings) → .env → 기본값 순. 설정에서 바꾸면 즉시 재예약된다.
const DEFAULT_CRON = process.env.LAW_CHECK_CRON || '30 6 * * *'; // 기본: 매일 06:30
let CRON = getSetting('law_check_cron') || DEFAULT_CRON;
let task = null;
let running = false;

const insRun = db.prepare(`INSERT INTO law_check_runs
  (actor, started_at, finished_at, checked, changed, added, errors)
  VALUES (@actor,@started_at,@finished_at,@checked,@changed,@added,@errors)`);
const lastRunRow = db.prepare('SELECT * FROM law_check_runs ORDER BY id DESC LIMIT 1');

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
  // 재시작에도 '마지막 업데이트'가 남도록 실행 결과를 영속화한다.
  insRun.run({
    actor, started_at: started, finished_at: summary.finished,
    checked: summary.checked, changed: summary.changed, added: summary.added,
    errors: summary.errors.length,
  });
  running = false;
  return summary;
}

// 자동 점검 on/off — 설정값(law_check_enabled). 없으면 기본 켜짐.
function isEnabled() {
  const v = getSetting('law_check_enabled');
  return v == null ? true : v === '1' || v === 'true';
}

export function startScheduler() {
  if (!isEnabled()) { console.log('[scheduler] 자동 점검 꺼짐(설정) — 예약하지 않음'); return; }
  if (!cron.validate(CRON)) { console.warn(`[scheduler] 잘못된 CRON: ${CRON}`); return; }
  task = cron.schedule(CRON, () => { runCheckNow('scheduler').catch(() => {}); });
  console.log(`[scheduler] 법령 점검 예약 · CRON="${CRON}" · OC=${process.env.LAW_API_OC ? '설정됨' : '미설정(수동만)'}`);
}

// 점검 주기 변경 — 유효성 검사 후 저장·재예약. 잘못된 표현식이면 예외를 던진다.
export function rescheduleScheduler(newCron) {
  const c = String(newCron || '').trim();
  if (!cron.validate(c)) throw new Error('올바른 cron 표현식이 아닙니다 (분 시 일 월 요일)');
  setSetting('law_check_cron', c);
  CRON = c;
  if (task) { task.stop(); task = null; }
  startScheduler();   // 꺼짐 상태면 내부에서 예약하지 않는다
  return schedulerInfo();
}

// 자동 점검 켜기/끄기 — 저장 후 즉시 예약/해제.
export function setSchedulerEnabled(on) {
  setSetting('law_check_enabled', on ? '1' : '0');
  if (task) { task.stop(); task = null; }
  if (on) startScheduler();
  return schedulerInfo();
}

export function schedulerInfo() {
  const last = lastRunRow.get() || null;   // DB에서 — 재시작해도 유지
  return {
    cron: CRON,
    enabled: !!task,                 // 실제 예약된 태스크 존재 여부
    scheduler_enabled: isEnabled(),  // 사용자 on/off 설정
    oc_configured: !!process.env.LAW_API_OC,
    running,
    // { actor, started_at, finished_at, checked, changed, added, errors } | null
    last_run: last,
  };
}
