const j = (r) => r.json();

// ── 인증 토큰 ──
const TOKEN_KEY = 'auth_token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); };

// 모든 요청에 Bearer 토큰을 붙이고, 401 이면 토큰을 비우고 세션 만료 이벤트를 쏜다.
function authFetch(url, opts = {}) {
  const t = getToken();
  const headers = { ...(opts.headers || {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) };
  return fetch(url, { ...opts, headers }).then((r) => {
    if (r.status === 401 && !url.includes('/api/auth/')) { setToken(null); window.dispatchEvent(new Event('auth-expired')); }
    return r;
  });
}
const JSONH = { 'Content-Type': 'application/json' };

export const api = {
  // 인증
  login: (username, password) => authFetch('/api/auth/login', { method: 'POST', headers: JSONH, body: JSON.stringify({ username, password }) }).then(j),
  logout: () => authFetch('/api/auth/logout', { method: 'POST' }).then(j),
  me: () => authFetch('/api/auth/me').then(j),
  // 사용자 관리 (master)
  listUsers: () => authFetch('/api/users').then(j),
  createUser: (body) => authFetch('/api/users', { method: 'POST', headers: JSONH, body: JSON.stringify(body) }).then(j),
  updateUser: (id, body) => authFetch(`/api/users/${id}`, { method: 'PATCH', headers: JSONH, body: JSON.stringify(body) }).then(j),
  deleteUser: (id) => authFetch(`/api/users/${id}`, { method: 'DELETE' }).then(j),

  status: () => authFetch('/api/status').then(j),
  extract: (form) => authFetch('/api/rulesets/extract', { method: 'POST', body: form }).then(j),
  listRulesets: () => authFetch('/api/rulesets').then(j),
  getRuleset: (id) => authFetch(`/api/rulesets/${id}`).then(j),
  patchRuleset: (id, body) => authFetch(`/api/rulesets/${id}`, { method: 'PATCH', headers: JSONH, body: JSON.stringify(body) }).then(j),
  patchRule: (rid, body) => authFetch(`/api/rulesets/rules/${rid}`, { method: 'PATCH', headers: JSONH, body: JSON.stringify(body) }).then(j),
  retag: (id, body) => authFetch(`/api/rulesets/${id}/retag`, { method: 'POST', headers: JSONH, body: JSON.stringify(body) }).then(j),

  // 룰셋별 태그 사전 (표준 복제 후 편집)
  tagset: (id) => authFetch(`/api/rulesets/${id}/tagset`).then(j),
  addTag: (id, body) => authFetch(`/api/rulesets/${id}/tagset`, { method: 'POST', headers: JSONH, body: JSON.stringify(body) }).then(j),
  updateTag: (id, tagId, body) => authFetch(`/api/rulesets/${id}/tagset/${tagId}`, { method: 'PATCH', headers: JSONH, body: JSON.stringify(body) }).then(j),
  removeTag: (id, tagId) => authFetch(`/api/rulesets/${id}/tagset/${tagId}`, { method: 'DELETE' }).then(j),
  deleteRule: (rid) => authFetch(`/api/rulesets/rules/${rid}`, { method: 'DELETE' }).then(j),
  approveAll: (id) => authFetch(`/api/rulesets/${id}/approve-all`, { method: 'POST' }).then(j),
  publish: (id) => authFetch(`/api/rulesets/${id}/publish`, { method: 'POST' }).then(j),
  deleteRuleset: (id) => authFetch(`/api/rulesets/${id}`, { method: 'DELETE' }).then(j),
  rsList: (body = {}) => authFetch('/api/rs/listRuleSets', { method: 'POST', headers: JSONH, body: JSON.stringify(body) }).then(j),
  rsLoad: (ruleset_id) => authFetch('/api/rs/loadRuleSet', { method: 'POST', headers: JSONH, body: JSON.stringify({ ruleset_id }) }).then(j),

  // 지식그래프 · 근거 추적 (요구사항 B)
  graph: (id) => authFetch(`/api/rulesets/${id}/graph`).then(j),
  provenance: (rid) => authFetch(`/api/rulesets/rules/${rid}/provenance`).then(j),

  // AutoSchemaKG 방법론 — 트리플·개념 스키마 유도
  kg: (id) => authFetch(`/api/rulesets/${id}/kg`).then(j),
  kgBuild: (id) => authFetch(`/api/rulesets/${id}/kg/build`, { method: 'POST' }).then(j),

  // 근거 신뢰도 · 근거 경로 (TrustGraph 개념)
  trust: (id) => authFetch(`/api/rulesets/${id}/trust`).then(j),
  trustPath: (rid) => authFetch(`/api/rulesets/rules/${rid}/trustpath`).then(j),

  // AI 스키마 제안 (저작 보조 · 제안까지만)
  proposals: (id) => authFetch(`/api/rulesets/${id}/proposals`).then(j),
  acceptProposal: (id, body) => authFetch(`/api/rulesets/${id}/proposals/accept`, { method: 'POST', headers: JSONH, body: JSON.stringify(body) }).then(j),
  dismissProposal: (id, body) => authFetch(`/api/rulesets/${id}/proposals/dismiss`, { method: 'POST', headers: JSONH, body: JSON.stringify(body) }).then(j),

  // 이력 (요구사항 5)
  ruleHistory: (rid) => authFetch(`/api/rulesets/rules/${rid}/history`).then(j),
  ruleLaws: (rid) => authFetch(`/api/rulesets/rules/${rid}/laws`).then(j),
  rulesetHistory: (id) => authFetch(`/api/rulesets/${id}/history`).then(j),

  // 법령 (요구사항 3·4)
  lawSearch: (q, n = 20) => authFetch(`/api/laws/search?q=${encodeURIComponent(q)}&n=${n}`).then(j),
  lawSync: (law_key) => authFetch('/api/laws/sync', { method: 'POST', headers: JSONH, body: JSON.stringify({ law_key }) }).then(j),
  lawList: () => authFetch('/api/laws').then(j),
  lawHistory: (n = 200) => authFetch(`/api/laws/history?limit=${n}`).then(j),
  lawArticles: (lawKey) => authFetch(`/api/laws/${lawKey}/articles`).then(j),
  lawVersions: (lawId) => authFetch(`/api/laws/article/${lawId}/versions`).then(j),
  relink: (rulesetId) => authFetch(`/api/laws/relink/${rulesetId}`, { method: 'POST' }).then(j),

  // 스케줄러 — 개정은 감지 즉시 자동 반영된다(승인 큐 없음). 반영 내역은 lawHistory 로 본다.
  schedulerInfo: () => authFetch('/api/laws/scheduler/info').then(j),
  checkNow: () => authFetch('/api/laws/scheduler/check-now', { method: 'POST' }).then(j),

  // 설정 — LLM provider/model · 점검 스케줄(cron) · 프로젝트 경로
  getSettings: () => authFetch('/api/settings').then(j),
  saveSettings: (body) => authFetch('/api/settings', { method: 'PUT', headers: JSONH, body: JSON.stringify(body) }).then(j),
};
