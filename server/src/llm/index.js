// LLM Provider 어댑터 — config(LLM_PROVIDER)로 교체.
//  ruleBased : 오프라인 규칙기반(기본, 키 불필요)  ← 폐쇄망에서도 즉시 동작
//  local     : 사내 자체 호스팅(Ollama/vLLM 등)     ← 진짜 온프레미스 권장
//  gemini    : Google Gemini (클라우드)             ← 데이터 외부 반출 주의(F1-6)
//  claude    : Anthropic Claude (클라우드)           ← 데이터 외부 반출 주의(F1-6)
//
// 모든 provider는 analyze(doc, ctx) → { domain, rules[], log, unmatched, engine } 를 반환.
import { ruleBasedAnalyze } from './ruleBased.js';
import { llmAnalyze } from './remote.js';
import { getSetting } from '../services/settings.js';
import { modelOf, byId } from './providers.js';

// provider는 설정(app_settings) → .env → 기본값 순. 설정에서 바꾸면 재시작 없이 반영된다.
export function activeProvider() {
  return getSetting('llm_provider') || process.env.LLM_PROVIDER || 'ruleBased';
}

// 현재 provider의 모델(버전). ruleBased(폴백 전용)는 모델이 없음(null).
export function activeModel() {
  const p = activeProvider();
  return byId[p] ? modelOf(p) : null;
}

export async function analyzeDocument(doc, productName, hint) {
  const provider = activeProvider();
  // hint(담당자 보충 설명)는 LLM만 활용한다. 규칙기반은 키워드 매칭이라 반영할 지점이 없다.
  if (provider === 'ruleBased') return ruleBasedAnalyze(doc, productName);
  try {
    return await llmAnalyze(provider, doc, productName, hint);
  } catch (err) {
    // 폐쇄망/키 미설정 등으로 실패 시 규칙기반으로 폴백 (서비스 중단 방지)
    const res = ruleBasedAnalyze(doc, productName);
    res.engine = `${provider} 실패 → ruleBased 폴백 (${err.message})`;
    return res;
  }
}
