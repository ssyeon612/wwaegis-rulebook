const j = (r) => r.json();

export const api = {
  status: () => fetch('/api/status').then(j),
  extract: (form) => fetch('/api/rulesets/extract', { method: 'POST', body: form }).then(j),
  listRulesets: () => fetch('/api/rulesets').then(j),
  getRuleset: (id) => fetch(`/api/rulesets/${id}`).then(j),
  patchRuleset: (id, body) => fetch(`/api/rulesets/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(j),
  patchRule: (rid, body) => fetch(`/api/rulesets/rules/${rid}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(j),
  retag: (id, body) => fetch(`/api/rulesets/${id}/retag`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(j),

  // 룰셋별 태그 사전 (표준 복제 후 편집)
  tagset: (id) => fetch(`/api/rulesets/${id}/tagset`).then(j),
  addTag: (id, body) => fetch(`/api/rulesets/${id}/tagset`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(j),
  updateTag: (id, tagId, body) => fetch(`/api/rulesets/${id}/tagset/${tagId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(j),
  removeTag: (id, tagId) => fetch(`/api/rulesets/${id}/tagset/${tagId}`, { method: 'DELETE' }).then(j),
  deleteRule: (rid) => fetch(`/api/rulesets/rules/${rid}`, { method: 'DELETE' }).then(j),
  approveAll: (id) => fetch(`/api/rulesets/${id}/approve-all`, { method: 'POST' }).then(j),
  publish: (id) => fetch(`/api/rulesets/${id}/publish`, { method: 'POST' }).then(j),
  deleteRuleset: (id) => fetch(`/api/rulesets/${id}`, { method: 'DELETE' }).then(j),
  rsList: (body = {}) => fetch('/api/rs/listRuleSets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(j),
  rsLoad: (ruleset_id) => fetch('/api/rs/loadRuleSet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ruleset_id }) }).then(j),

  // 지식그래프 · 근거 추적 (요구사항 B)
  graph: (id) => fetch(`/api/rulesets/${id}/graph`).then(j),
  provenance: (rid) => fetch(`/api/rulesets/rules/${rid}/provenance`).then(j),

  // AutoSchemaKG 방법론 — 트리플·개념 스키마 유도
  kg: (id) => fetch(`/api/rulesets/${id}/kg`).then(j),
  kgBuild: (id) => fetch(`/api/rulesets/${id}/kg/build`, { method: 'POST' }).then(j),

  // 근거 신뢰도 · 근거 경로 (TrustGraph 개념)
  trust: (id) => fetch(`/api/rulesets/${id}/trust`).then(j),
  trustPath: (rid) => fetch(`/api/rulesets/rules/${rid}/trustpath`).then(j),

  // AI 스키마 제안 (저작 보조 · 제안까지만)
  proposals: (id) => fetch(`/api/rulesets/${id}/proposals`).then(j),
  acceptProposal: (id, body) => fetch(`/api/rulesets/${id}/proposals/accept`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(j),
  dismissProposal: (id, body) => fetch(`/api/rulesets/${id}/proposals/dismiss`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(j),

  // 이력 (요구사항 5)
  ruleHistory: (rid) => fetch(`/api/rulesets/rules/${rid}/history`).then(j),
  ruleLaws: (rid) => fetch(`/api/rulesets/rules/${rid}/laws`).then(j),
  rulesetHistory: (id) => fetch(`/api/rulesets/${id}/history`).then(j),

  // 법령 (요구사항 3·4)
  lawSearch: (q, n = 20) => fetch(`/api/laws/search?q=${encodeURIComponent(q)}&n=${n}`).then(j),
  lawSync: (law_key) => fetch('/api/laws/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ law_key }) }).then(j),
  lawList: () => fetch('/api/laws').then(j),
  lawHistory: (n = 200) => fetch(`/api/laws/history?limit=${n}`).then(j),
  lawArticles: (lawKey) => fetch(`/api/laws/${lawKey}/articles`).then(j),
  lawVersions: (lawId) => fetch(`/api/laws/article/${lawId}/versions`).then(j),
  relink: (rulesetId) => fetch(`/api/laws/relink/${rulesetId}`, { method: 'POST' }).then(j),

  // 스케줄러 · 승인 큐 (요구사항 4)
  schedulerInfo: () => fetch('/api/laws/scheduler/info').then(j),
  checkNow: () => fetch('/api/laws/scheduler/check-now', { method: 'POST' }).then(j),
  updates: (status = 'pending') => fetch(`/api/laws/updates/list?status=${status}`).then(j),
  updatesCount: () => fetch('/api/laws/updates/count').then(j),
  approveUpdate: (id) => fetch(`/api/laws/updates/${id}/approve`, { method: 'POST' }).then(j),
  rejectUpdate: (id, note = '') => fetch(`/api/laws/updates/${id}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }) }).then(j),
};
