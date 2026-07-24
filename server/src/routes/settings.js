// 설정 API — 런타임에 바꾸는 값들. 재시작 없이 반영된다.
//  · LLM provider/model  (app_settings: llm_provider, llm_model_<provider>)
//  · 법령 점검 스케줄(cron) (app_settings: law_check_cron → 재예약)
//  · 프로젝트 저장 경로 (읽기 전용 노출)
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSetting, setSetting } from '../services/settings.js';
import { activeProvider, activeModel } from '../llm/index.js';
import { PROVIDERS, byId, modelOf, keyConfigured } from '../llm/providers.js';
import { rescheduleScheduler, setSchedulerEnabled, schedulerInfo } from '../services/scheduler.js';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(__dirname, '..', '..');
const PROJECT_DIR = path.resolve(SERVER_DIR, '..');
const DB_PATH = path.join(SERVER_DIR, 'data', 'rulebook.db');

// API 키는 절대 그대로 내려주지 않는다 — 설정 여부와 마스킹된 힌트만.
const keyHint = (id) => {
  const k = getSetting(`llm_apikey_${id}`) || process.env[`${byId[id]?.envBase}_API_KEY`] || '';
  return k ? '••••' + k.slice(-4) : '';
};

function currentSettings() {
  return {
    provider: activeProvider(),
    model: activeModel(),
    provider_source: getSetting('llm_provider') ? 'settings' : 'env',
    providers: PROVIDERS.map((p) => ({
      id: p.id, label: p.label, note: p.note, category: p.category, cloud: p.cloud,
      model: modelOf(p.id), needsModel: true, needsKey: p.cloud,
      keyConfigured: p.cloud ? keyConfigured(p.id) : true,
      keyHint: p.cloud ? keyHint(p.id) : '',
    })),
    scheduler: schedulerInfo(),           // { cron, enabled, oc_configured, running, last_run }
    cron_source: getSetting('law_check_cron') ? 'settings' : 'env',
    paths: { project: PROJECT_DIR, server: SERVER_DIR, db: DB_PATH },
  };
}

router.get('/', (req, res) => res.json(currentSettings()));

router.put('/', (req, res) => {
  const { provider, model, apiKey, cron, scheduler_enabled } = req.body || {};
  try {
    if (provider !== undefined) {
      if (!byId[provider]) return res.status(400).json({ error: 'bad_provider', message: '알 수 없는 provider' });
      setSetting('llm_provider', provider);
      // 모델 오버라이드 (빈 값이면 .env 기본으로 되돌림)
      if (model !== undefined) setSetting(`llm_model_${provider}`, model);
      // API 키 — 클라우드만, 비어있지 않을 때만 갱신(빈 값은 기존 유지)
      if (byId[provider].cloud && apiKey !== undefined && String(apiKey).trim()) setSetting(`llm_apikey_${provider}`, String(apiKey).trim());
    }
    if (cron !== undefined && cron !== null && String(cron).trim()) rescheduleScheduler(cron);
    if (scheduler_enabled !== undefined) setSchedulerEnabled(!!scheduler_enabled);
    res.json(currentSettings());
  } catch (e) {
    res.status(400).json({ error: 'save_failed', message: e.message });
  }
});

export default router;
