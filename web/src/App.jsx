import { Routes, Route, Navigate, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './lib/api.js';
import { WsContext } from './lib/ws.js';
import Workspace from './pages/Workspace.jsx';
import RulesetDetail from './pages/RulesetDetail.jsx';
import ApiExplorer from './pages/ApiExplorer.jsx';
import Settings from './pages/Settings.jsx';
import Laws from './pages/Laws.jsx';
import GraphView from './pages/GraphView.jsx';
import RulesetTags from './pages/RulesetTags.jsx';
import RulesetManager from './pages/RulesetManager.jsx';
import { Icon } from './lib/icons.jsx';

const ICON = { finance: '🏦', securities: '📈', auto: '🚗', insurance: '🛡' };
// provider 접두사가 모델명에 중복되면 뗀다 (gemini + gemini-flash-latest → flash-latest)
function prettyModel(provider, model) {
  if (!model) return '';
  return model.replace(new RegExp('^' + provider + '[-_]', 'i'), '');
}
const TITLES = { '/': '룰 편집', '/rulesets': '룰셋 관리', '/laws': '법령 관리', '/api': 'RS API', '/settings': '설정' };
// 헤더 제목 앞 아이콘 — LNB 라인 아이콘 세트와 같은 이름을 쓴다
const HEAD_IC = { '/': 'rule', '/rulesets': 'rulesets', '/laws': 'law', '/api': 'api' };
const SUBS = {
  '/rulesets': '모든 룰셋을 한눈에 — 이름 변경·상태·룰 수 확인',
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
  // 테마 — 초기값은 index.html 인라인 스크립트가 이미 <html data-theme> 에 세팅했다.
  const [theme, setTheme] = useState(() =>
    (typeof document !== 'undefined' && document.documentElement.dataset.theme) || 'light');
  const loc = useLocation();
  const nav = useNavigate();

  useEffect(() => { api.status().then(setStatus).catch(() => {}); }, [loc.pathname]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch { /* 저장 실패는 무시 */ }
  };

  // LNB 축소 — 아이콘만 남긴다. 선택은 localStorage 에 유지.
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('lnb-collapsed') === '1'; } catch { return false; }
  });
  const toggleCollapse = () => setCollapsed((v) => {
    const n = !v;
    try { localStorage.setItem('lnb-collapsed', n ? '1' : '0'); } catch { /* 무시 */ }
    return n;
  });

  const loadRows = useCallback(() => api.listRulesets().then((r) => { setRows(r); return r; }), []);
  useEffect(() => { loadRows(); }, [loadRows]);

  // 첫 로드: 룰셋이 있으면 선택 모드, 없으면 생성 모드
  useEffect(() => {
    if (!rows || mode !== null) return;
    if (rows.length) { setSelId(rows[0].id); setMode('select'); }
    else setMode('create');
  }, [rows, mode]);

  const sel = rows?.find((r) => r.id === selId) || null;

  // 생성 모드는 둘로 갈린다: 대상 없으면 새 룰셋, createTarget 있으면 그 룰셋에 내규 추가.
  // 사이드바·상단바가 이 구분을 함께 반영하도록 앱 전역에 둔다.
  const [createTarget, setCreateTarget] = useState(null);
  useEffect(() => { if (mode !== 'create') setCreateTarget(null); }, [mode]);
  const addTarget = createTarget != null ? rows?.find((r) => r.id === createTarget) : null;

  const toCreate = () => { setCreateTarget(null); setMode('create'); nav('/'); };
  const toSelect = (id) => {
    if (id != null) setSelId(id);
    else if (!selId && rows?.length) setSelId(rows[0].id);
    setMode('select'); nav('/');
  };

  const ctx = useMemo(() => ({ rows, loadRows, mode, setMode, selId, setSelId, sel, createTarget, setCreateTarget, toCreate, toSelect }),
    [rows, loadRows, mode, selId, sel, createTarget]);

  const graph = loc.pathname.endsWith('/graph');
  const tags = loc.pathname.endsWith('/tags');
  const detail = loc.pathname.startsWith('/rulesets/');
  const title = TITLES[loc.pathname] || (graph ? '온톨로지' : tags ? '태그 관리' : detail ? '룰셋 상세' : '규정관리');
  const headIc = HEAD_IC[loc.pathname] || (graph ? 'onto' : tags ? 'tag' : detail ? 'rule' : 'rule');
  const sub = SUBS[loc.pathname]
    || (loc.pathname === '/'
        ? (mode === 'create'
            ? (addTarget ? `기존 룰셋 「${addTarget.name}」에 내규를 추가합니다` : '내규를 올려 새 룰셋을 만듭니다')
            : '룰을 검토·편집하고 승인 후 게시합니다')
      : graph ? '룰·개념·법령이 어떻게 연결돼 있는지 구조로 봅니다'
        : tags ? '표준태그사전 기준으로 룰셋의 의미태그·행위태그를 관리합니다'
          : detail ? '룰을 편집하고 승인한 뒤 게시합니다' : '');
  const c = status?.counts;
  const onprem = status && ONPREM.includes(status.provider);

  return (
    <WsContext.Provider value={ctx}>
      <div className={'shell' + (collapsed ? ' lnb-collapsed' : '')}>
        <aside className="sidebar">
          {/* 축소 토글 — 사이드바 오른쪽 가장자리에 걸친 원형 버튼 */}
          <button className="lnb-toggle tip-r" onClick={toggleCollapse}
            data-tip={collapsed ? '메뉴 펼치기' : '메뉴 접기'} aria-label="사이드바 접기/펼치기">
            {collapsed ? '»' : '«'}
          </button>
          <div className="brand">
            <div className="mk">W</div>
            <div className="brand-txt"><b>WiseAegis</b><span>Rulebook</span></div>
          </div>

          {/* 룰 생성은 헤더(＋ 룰 생성)로 일원화 — 사이드바는 선택된 룰셋 작업 맥락만. */}
          <nav className="nav">
            {mode === 'create' ? (
              <>
                <div className="sec">{addTarget ? '기존 룰셋에 추가' : '룰셋 생성'}</div>
                <NavLink to="/" end data-tip={addTarget ? '내규 추가' : '새 룰셋 만들기'}
                  className={({ isActive }) => (isActive ? 'on ' : '') + 'tip-r' + (addTarget ? ' add' : '')}>
                  <span className="ic"><Icon name={addTarget ? 'clip' : 'plus'} /></span>{addTarget ? '내규 추가' : '새 룰셋 만들기'}
                </NavLink>
                <div className="navnote">{addTarget
                  ? <>대상 <b>{addTarget.name}</b> · 새 룰셋을 만들려면 헤더의 <b>🪄 룰셋 생성</b>을 누르세요.</>
                  : '내규를 올리면 룰셋이 생깁니다. 생성 후 선택 모드로 넘어갑니다.'}</div>
                {rows?.length > 0 && (
                  <button className="nav-back" onClick={() => toSelect()}>← 선택 모드로 돌아가기</button>
                )}
              </>
            ) : (
              <>
                <div className="rscard">
                  <span className="rscard-lbl">선택한 룰셋</span>
                  <RulesetSelect rows={rows} selId={selId} onSelect={setSelId} />
                </div>
                {/* 룰셋 스코프 — 선택된 룰셋을 대상으로 동작한다 */}
                <NavLink to="/" end data-tip="룰 편집" className={({ isActive }) => (isActive ? 'on ' : '') + 'tip-r'}>
                  <span className="ic"><Icon name="rule" /></span>룰 편집
                </NavLink>
                {sel && (
                  <NavLink to={`/rulesets/${sel.id}/tags`} data-tip="태그 관리" className={({ isActive }) => (isActive ? 'on ' : '') + 'tip-r'}>
                    <span className="ic"><Icon name="tag" /></span>태그 관리
                  </NavLink>
                )}
                {sel && (
                  <NavLink to={`/rulesets/${sel.id}/graph`} data-tip="온톨로지" className={({ isActive }) => (isActive ? 'on ' : '') + 'tip-r'}>
                    <span className="ic"><Icon name="onto" /></span>온톨로지
                  </NavLink>
                )}

                {/* 공통 — 선택된 룰셋에 영향받지 않는다 */}
                <div className="sec">공통</div>
                <NavLink to="/rulesets" end data-tip="룰셋 관리" className={({ isActive }) => (isActive ? 'on ' : '') + 'tip-r'}>
                  <span className="ic"><Icon name="rulesets" /></span>룰셋 관리
                </NavLink>
                <NavLink to="/api" data-tip="RS API" className={({ isActive }) => (isActive ? 'on ' : '') + 'tip-r'}>
                  <span className="ic"><Icon name="api" /></span>RS API
                </NavLink>
                <NavLink to="/laws" data-tip="법령 관리" className={({ isActive }) => (isActive ? 'on ' : '') + 'tip-r'}>
                  <span className="ic"><Icon name="law" /></span>법령 관리
                </NavLink>
              </>
            )}
          </nav>

          {/* provider 표시는 LNB 하단에 고정 (헤더에서 옮김).
              라벨엔 '클라우드' 문구 대신 실제 모델(버전)을 적는다. 온프레미스/클라우드
              구분은 색(safe/cloud)과 툴팁으로만 남긴다. */}
          {status && (
            <div className="side-prov">
              <span className={'provider-pill tip-r ' + (onprem ? 'safe' : 'cloud')}>
                <i />{status.provider}
                {status.model && <em>{prettyModel(status.provider, status.model)}</em>}
              </span>
            </div>
          )}
        </aside>

        <div className="main">
          <div className="topbar">
            <div className="tb-head">
              <span className="tb-ic"><Icon name={headIc} size={19} /></span>
              <div className="tb-titles">
                <h1>{title}</h1>
                {sub && <div className="sub">{sub}</div>}
              </div>
            </div>

            <div className="tb-right">
              {/* 통계(게시/룰/법령) 자리에 룰 생성 버튼을 둔다 */}
              <button className="tb-create tip-b" data-tip="새 룰셋 생성" onClick={toCreate}>
                <span className="spark"><Icon name="wand" size={15} /></span>룰셋 생성
              </button>
              {c && (
                <NavLink to="/laws" className={'tb-bell tip-b' + (c.pending_updates > 0 ? ' has' : '')}
                  data-tip={c.pending_updates > 0 ? `승인 대기 ${c.pending_updates}건` : '승인 대기 없음'}>
                  🔔
                  {c.pending_updates > 0 && <span className="n">{c.pending_updates}</span>}
                </NavLink>
              )}
              <button className="tb-theme tip-b" onClick={toggleTheme}
                data-tip={theme === 'dark' ? '라이트 모드' : '다크 모드'} aria-label="테마 전환">
                {theme === 'dark' ? '☀' : '☾'}
              </button>
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
              <Route path="/rulesets" element={<RulesetManager />} />
              <Route path="/extract" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </div>
      </div>
    </WsContext.Provider>
  );
}

// 선택한 룰셋 드롭다운 — 네이티브 select 대신 커스텀 리스트박스라 팝업까지 디자인이 입혀진다.
// 라벨만 노출(도메인 아이콘 제외). 바깥 클릭·Esc로 닫히고, 열릴 때 선택 항목이 보이게 스크롤한다.
function RulesetSelect({ rows, selId, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const popRef = useRef(null);
  const sel = (rows || []).find((r) => r.id === selId) || null;

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    // 선택된 항목이 화면에 들어오게
    popRef.current?.querySelector('.rssel-opt.on')?.scrollIntoView({ block: 'nearest' });
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className={'rssel' + (open ? ' open' : '')} ref={ref}>
      <button type="button" className={'rssel-btn' + (!open && sel ? ' tip-b' : '')} onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox" aria-expanded={open} data-tip={sel?.name || undefined}>
        <span className="rssel-cur">{sel?.name || '룰셋 선택'}</span>
        <span className="rssel-caret" aria-hidden="true"><Icon name="chevron" size={15} /></span>
      </button>
      {open && (
        <div className="rssel-pop" role="listbox" ref={popRef}>
          {(rows || []).map((r) => (
            <button type="button" key={r.id} role="option" aria-selected={r.id === selId}
              className={'rssel-opt tip-r' + (r.id === selId ? ' on' : '')} data-tip={r.name}
              onClick={() => { onSelect(r.id); setOpen(false); }}>
              <span className="rssel-dot" data-st={r.status === 'published' ? 'pub' : 'draft'} />
              <span className="rssel-nm">{r.name}</span>
              {r.id === selId && <span className="rssel-check"><Icon name="check" size={14} /></span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
