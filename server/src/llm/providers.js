// 분석 엔진(LLM) provider 레지스트리 — 사내 호스팅 + 클라우드.
// 규칙기반(ruleBased)은 선택지에서 제외한다(내부 폴백 전용).
//  · native  : 자체 요청 형식(gemini / claude)
//  · base    : OpenAI 호환(/chat/completions) — openai · grok · mistral · deepseek 공용
// 모델·API 키는 설정(app_settings) → .env → 기본값 순으로 해석한다.
import { getSetting } from '../services/settings.js';

export const PROVIDERS = [
  { id: 'local', label: '사내 호스팅 (Ollama/vLLM)', note: '온프레미스', category: 'onprem', cloud: false, envBase: 'LOCAL_LLM', defaultModel: 'gemma2' },
  { id: 'gemini', label: 'Google Gemini', note: 'Google 생성형 AI', category: 'cloud', cloud: true, native: 'gemini', envBase: 'GEMINI', defaultModel: 'gemini-2.0-flash' },
  { id: 'claude', label: 'Anthropic Claude', note: 'Anthropic', category: 'cloud', cloud: true, native: 'claude', envBase: 'CLAUDE', defaultModel: 'claude-sonnet-5' },
  { id: 'openai', label: 'OpenAI (ChatGPT)', note: 'OpenAI GPT', category: 'cloud', cloud: true, base: 'https://api.openai.com/v1', envBase: 'OPENAI', defaultModel: 'gpt-4o-mini' },
  { id: 'grok', label: 'xAI Grok', note: 'xAI · OpenAI 호환', category: 'cloud', cloud: true, base: 'https://api.x.ai/v1', envBase: 'GROK', defaultModel: 'grok-2-latest' },
  { id: 'mistral', label: 'Mistral', note: 'Mistral AI · OpenAI 호환', category: 'cloud', cloud: true, base: 'https://api.mistral.ai/v1', envBase: 'MISTRAL', defaultModel: 'mistral-large-latest' },
];

export const byId = Object.fromEntries(PROVIDERS.map((p) => [p.id, p]));

// 모델: 설정(llm_model_<id>) → .env(<ENVBASE>_MODEL) → 기본값
export function modelOf(id) {
  const p = byId[id];
  if (!p) return null;
  return getSetting(`llm_model_${id}`) || process.env[`${p.envBase}_MODEL`] || p.defaultModel;
}

// API 키: 설정(llm_apikey_<id>) → .env(<ENVBASE>_API_KEY). 사내 호스팅은 키 불필요.
export function keyOf(id) {
  const p = byId[id];
  if (!p || !p.cloud) return '';
  return getSetting(`llm_apikey_${id}`) || process.env[`${p.envBase}_API_KEY`] || '';
}

export function keyConfigured(id) {
  return !!keyOf(id);
}
