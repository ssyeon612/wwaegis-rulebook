import { Routes, Route, Navigate, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './lib/api.js';
import { WsContext } from './lib/ws.js';
import Workspace from './pages/Workspace.jsx';
import RulesetDetail from './pages/RulesetDetail.jsx';
import ApiExplorer from './pages/ApiExplorer.jsx';
import Settings from './pages/Settings.jsx';
import Laws from './pages/Laws.jsx';
import GraphView from './pages/GraphView.jsx';
import RulesetTags from './pages/RulesetTags.jsx';

const ICON = { finance: '🏦', securities: '📈', auto: '🚗', insurance: '🛡' };
const TITLES = { '/': '룰셋 워크스페이스', '/laws': '법령 관리', '/api': 'RS API', '/settings': '설정' };
const SUBS = {
  '/laws': '조문을 수집하고 개정을 검토·승인합니다',
  '/api': '엔드포인트를 호출해 요청·응답을 확인합니다',
  '/settings': '분석 엔진과 배포 환경을 설정합니다',
};
// 데이터가 사내에 머무는 provider — 폐쇄망 정책(F1-6) 판별용
const ONPREM = ['ruleBased', 'local'];

export default function App() {
  const [status, setStatus] = useState(null);
  const [rows, setRows] = useState(null);
  const [mode, setMode] = useState(null);   // create | select
  const [selId, setSelId] = useState(null);
  const loc = useLocation();
  const nav = useNavigate();

  useEffect(() => { api.status().then(setStatus).catch(() => {}); }, [loc.pathname]);

  const loadRows = useCallback(() => api.listRulesets().then((r) => { setRows(r); return r; }), []);
  useEffect(() => { loadRows(); }, [loadRows]);

  // 첫 로드: 룰셋이 있으면 선택 모드, 없으면 생성 모드
  useEffect(() => {
    if (!rows || mode !== null) return;
    if (rows.length) { setSelId(rows[0].id); setMode('select'); }
    else setMode('create');
  }, [rows, mode]);

  const sel = rows?.find((r) => r.id === selId) || null;

  const toCreate = () => { setMode('create'); nav('/'); };
  const toSelect = (id) => {
    if (id != null) setSelId(id);
    else if (!selId && rows?.length) setSelId(rows[0].id);
    setMode('select'); nav('/');
  };

  const ctx = useMemo(() => ({ rows, loadRows, mode, setMode, selId, setSelId, sel, toCreate, toSelect }),
    [rows, loadRows, mode, selId, sel]);

  const graph = loc.pathname.endsWith('/graph');
  const tags = loc.pathname.endsWith('/tags');
  const detail = loc.pathname.startsWith('/rulesets/');
  const title = TITLES[loc.pathname] || (graph ? '온톨로지' : tags ? '태그 관리' : detail ? '룰셋 상세' : '규정관리');
  const sub = SUBS[loc.pathname]
    || (loc.pathname === '/' ? (mode === 'create' ? '내규를 올려 새 룰셋을 만듭니다' : '룰을 검토·편집하고 승인 후 게시합니다')
      : graph ? '룰·개념·법령이 어떻게 연결돼 있는지 구조로 봅니다'
        : tags ? '표준태그사전 기준으로 룰셋의 의미태그·행위태그를 관리합니다'
          : detail ? '룰을 편집하고 승인한 뒤 게시합니다' : '');
  const c = status?.counts;
  const onprem = status && ONPREM.includes(status.provider);

  return (
    <WsContext.Provider value={ctx}>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">
            <div className="mk">W</div>
            <div><b>WiseAegis</b><span>Rulebook</span></div>
          </div>

          {/* 모드 — 프로젝트 구조를 가르는 축 */}
          <div className="modesw">
            <button className={mode === 'create' ? 'on' : ''} onClick={toCreate}>＋ 생성</button>
            <button className={mode === 'select' ? 'on' : ''} onClick={() => toSelect()} disabled={!rows?.length}>
              ☰ 선택{rows?.length ? ` ${rows.length}` : ''}
            </button>
          </div>

          <nav className="nav">
            {mode === 'create' ? (
              <>
                <div className="sec">룰셋 생성</div>
                <NavLink to="/" end className={({ isActive }) => isActive ? 'on' : ''}>
                  <span className="ic">＋</span>새 룰셋 만들기
                </NavLink>
                <div className="navnote">내규를 올리면 룰셋이 생깁니다. 생성 후 선택 모드로 넘어갑니다.</div>
              </>
            ) : (
              <>
                <div className="sec">선택한 룰셋</div>
                <select className="navsel" value={selId ?? ''} onChange={(e) => setSelId(Number(e.target.value))}>
                  {(rows || []).map((r) => (
                    <option key={r.id} value={r.id}>{ICON[r.domain] || '📄'} {r.name}</option>
                  ))}
                </select>
                {sel && (
                  <div className="navmeta">
                    <span className={'badge ' + sel.status}><i />{sel.status === 'published' ? '게시됨' : '초안'}</span>
                    <span>룰 {sel.rule_count} · 승인 {sel.approved_count}</span>
                  </div>
                )}
                <NavLink to="/" end className={({ isActive }) => isActive ? 'on' : ''}>
                  <span className="ic">☰</span>룰 편집
                </NavLink>
                {sel && (
                  <NavLink to={`/rulesets/${sel.id}/tags`} className={({ isActive }) => isActive ? 'on' : ''}>
                    <span className="ic">🏷</span>태그 관리
                  </NavLink>
                )}
                <NavLink to="/api" className={({ isActive }) => isActive ? 'on' : ''}>
                  <span className="ic">↔</span>RS API
                </NavLink>
                {sel && (
                  <NavLink to={`/rulesets/${sel.id}/graph`} className={({ isActive }) => isActive ? 'on' : ''}>
                    <span className="ic">◈</span>온톨로지
                  </NavLink>
                )}
                <NavLink to="/laws" className={({ isActive }) => isActive ? 'on' : ''}>
                  <span className="ic">⚖</span>법령 관리
                </NavLink>
              </>
            )}
          </nav>
        </aside>

        <div className="main">
          <div className="topbar">
            <div className="tb-head">
              <h1>{title}</h1>
              {sub && <div className="sub">{sub}</div>}
            </div>

            <div className="tb-right">
              {c && (
                <div className="tb-stats">
                  <NavLink to="/" end className="tb-stat"><b>{c.published}</b>게시</NavLink>
                  <NavLink to="/" end className="tb-stat"><b>{c.rules}</b>룰</NavLink>
                  <NavLink to="/laws" className="tb-stat"><b>{c.laws}</b>법령</NavLink>
                </div>
              )}
              {c && <div className="tb-div" />}
              {c && (
                <NavLink to="/laws" className={'tb-bell' + (c.pending_updates > 0 ? ' has' : '')}
                  title={c.pending_updates > 0 ? `승인 대기 ${c.pending_updates}건` : '승인 대기 없음'}>
                  🔔
                  {c.pending_updates > 0 && <span className="n">{c.pending_updates}</span>}
                </NavLink>
              )}
              {status && (
                <span className={'provider-pill ' + (onprem ? 'safe' : 'cloud')}
                  title={onprem ? '데이터가 사내에 머무릅니다' : '데이터가 외부로 나갑니다 — 준법 승인 필요(F1-6)'}>
                  <i />{status.provider}
                  <em>{onprem ? '온프레미스' : '클라우드'}</em>
                </span>
              )}
            </div>
          </div>

          <div className="content">
            <Routes>
              <Route path="/" element={<Workspace />} />
              <Route path="/rulesets/:id" element={<RulesetDetail />} />
              <Route path="/rulesets/:id/tags" element={<RulesetTags />} />
              <Route path="/rulesets/:id/graph" element={<GraphView />} />
              <Route path="/laws" element={<Laws />} />
              <Route path="/updates" element={<Navigate to="/laws" replace />} />
              <Route path="/api" element={<ApiExplorer />} />
              <Route path="/settings" element={<Settings />} />
              {/* 구 경로 → 워크스페이스로 흡수 */}
              <Route path="/rulesets" element={<Navigate to="/" replace />} />
              <Route path="/extract" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </div>
      </div>
    </WsContext.Provider>
  );
}
