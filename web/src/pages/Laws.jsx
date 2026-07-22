import { useEffect, useMemo, useState, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';

// 법령 관리 (요구사항 3·4) — 검색·수집, 조문 열람, 개정 추적 상태
// cron을 사람이 읽는 문장으로. 해석 못 하면 원문을 그대로 보여준다.
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
function cronText(c) {
  if (!c) return '—';
  const p = String(c).trim().split(/\s+/);
  if (p.length !== 5) return c;
  const [mi, hh, dom, mon, dow] = p;
  const num = (v) => /^\d+$/.test(v);
  const at = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const every = hh.match(/^\*\/(\d+)$/);
  if (num(mi) && num(hh) && dom === '*' && mon === '*' && dow === '*') return `매일 ${at(hh, mi)}`;
  if (num(mi) && num(hh) && dom === '*' && mon === '*' && num(dow)) return `매주 ${DOW[+dow % 7]}요일 ${at(hh, mi)}`;
  if (num(mi) && num(hh) && num(dom) && mon === '*' && dow === '*') return `매월 ${dom}일 ${at(hh, mi)}`;
  if (num(mi) && every && dom === '*' && mon === '*' && dow === '*') return `${every[1]}시간마다`;
  return c;   // 해석 못 하는 패턴은 원문 그대로
}
const ymd = (s) => (s && s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : s || '—');

export default function Laws() {
  const [tab, setTab] = useState('collect');   // collect | updates
  const [pendingN, setPendingN] = useState(0);
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [collected, setCollected] = useState([]);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);      // {tone, text}
  const [openKey, setOpenKey] = useState(null);
  const [articles, setArticles] = useState({});
  const [sched, setSched] = useState(null);

  const loadCollected = () => api.lawList().then(setCollected);
  const loadSched = () => api.schedulerInfo().then(setSched).catch(() => {});
  const loadPending = () => api.updatesCount().then((r) => setPendingN(r.c || 0)).catch(() => {});
  useEffect(() => { loadCollected(); loadSched(); loadPending(); }, []);

  async function search() {
    setBusy('search'); setMsg(null); setResults(null);
    try { setResults(await api.lawSearch(q)); }
    catch { setMsg({ tone: 'fail', text: '검색 실패 — LAW_API_OC(인증키)를 확인하세요.' }); }
    setBusy('');
  }
  async function sync(law_key, name) {
    setBusy(law_key); setMsg(null);
    const r = await api.lawSync(law_key);
    if (r.error) setMsg({ tone: 'fail', text: `수집 실패: ${r.message}` });
    else setMsg({
      tone: r.changed > 0 ? 'warn' : 'pass',
      text: `${r.law_name || name} — 신규 ${r.added} · 변경 ${r.changed} · 동일 ${r.unchanged}`
        + (r.changed > 0 ? ' · 변경분은 승인 큐에서 검토하세요' : ''),
    });
    setBusy('');
    loadCollected();
    setArticles((a) => ({ ...a, [law_key]: undefined })); // 다시 열 때 최신으로
  }
  async function checkNow() {
    setBusy('check'); setMsg(null);
    const r = await api.checkNow();
    setBusy('');
    setMsg({ tone: r.error ? 'fail' : 'pass', text: r.error ? r.message : `점검 완료 — 변경 ${r.changed ?? 0}건` });
    loadCollected(); loadSched();
  }
  async function toggleArticles(lawKey) {
    if (openKey === lawKey) { setOpenKey(null); return; }
    setOpenKey(lawKey);
    if (!articles[lawKey]) {
      const arts = await api.lawArticles(lawKey);
      setArticles((a) => ({ ...a, [lawKey]: arts }));
    }
  }

  const collectedKeys = new Set(collected.map((c) => c.law_key));

  return (
    <div className="grid" style={{ gap: 16 }}>
      {/* 스케줄러 상태 — 데이터는 이미 받고 있었는데 화면에 없었다 */}
      {sched && (
        <div className="schedbar">
          <span className={'dot ' + (sched.enabled && sched.oc_configured ? 'on' : 'off')} />
          <span className="k">자동 점검</span>
          <span className="v">{sched.enabled && sched.oc_configured ? '켜짐' : '꺼짐'}</span>
          <span className="sep" />
          <span className="k">주기</span>
          <span className="v" title={sched.cron}>{cronText(sched.cron)}</span>
          <span className="sep" />
          <span className="k">마지막</span>
          <span className="v">{sched.last_run ? String(sched.last_run).slice(0, 16) : '실행 이력 없음'}</span>
          <span className="spacer" />
          <button className="btn sm" onClick={checkNow} disabled={busy === 'check' || !sched.oc_configured}>
            {busy === 'check' ? '점검 중…' : '↻ 지금 점검'}
          </button>
        </div>
      )}

      {/* 수집과 승인은 둘 다 '법령' 작업이라 한 화면에서 탭으로 가른다 */}
      <div className="seg">
        <button className={tab === 'collect' ? 'on' : ''} onClick={() => setTab('collect')}>검색 · 수집</button>
        <button className={tab === 'updates' ? 'on' : ''} onClick={() => setTab('updates')}>
          개정 승인{pendingN > 0 && <span className="segbadge">{pendingN}</span>}
        </button>
        <button className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>변경 이력</button>
      </div>

      {sched && !sched.oc_configured && (
        <div className="warn">⚠ <b>LAW_API_OC 미설정</b> — 국가법령정보센터 인증키(open.law.go.kr 신청)를 <span className="mono">server/.env</span>의 <span className="mono">LAW_API_OC</span>에 넣으면 검색·수집·자동점검이 켜집니다.</div>
      )}

      {msg && (
        <div className="warn" style={msg.tone === 'fail'
          ? { background: 'var(--fail-bg)', borderColor: 'var(--fail-line)', color: 'var(--fail)' }
          : msg.tone === 'pass'
            ? { background: 'var(--pass-bg)', borderColor: 'var(--pass-line)', color: 'var(--pass)' }
            : undefined}>{msg.text}</div>
      )}

      {tab === 'collect' && <>
      <div className="card">
        <div className="card-h">
          <div>
            <h2>법령 검색 · 수집</h2>
            <div className="sub">룰의 근거가 될 법령을 조문 단위로 수집합니다. 이후 개정은 자동 점검이 추적합니다.</div>
          </div>
          <span className="tag">국가법령정보센터 OPEN API</span>
        </div>
        <div className="card-b">
          <div className="row">
            <div className="srchbox" style={{ maxWidth: 440, flex: 1 }}>
              <span className="ic">🔍</span>
              <input placeholder="법령명 (예: 금융소비자, 자본시장, 보험업)" value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') search(); if (e.key === 'Escape') setQ(''); }} />
              {q && <button className="x" onClick={() => setQ('')} title="지우기">×</button>}
            </div>
            <button className="btn primary" onClick={search} disabled={busy === 'search' || !q.trim()}>
              {busy === 'search' ? '검색 중…' : '검색'}
            </button>
          </div>

          {results && (results.length === 0
            ? <div className="muted" style={{ fontSize: 12.5, marginTop: 14 }}>검색 결과가 없습니다. 법령명 일부만 넣어 보세요(예: “금융소비자”).</div>
            : <table className="tbl rows" style={{ marginTop: 14 }}>
                <thead><tr>
                  <th>법령명</th><th style={{ width: 130 }}>소관부처</th><th style={{ width: 92 }}>구분</th>
                  <th style={{ width: 110 }}>시행일</th><th style={{ width: 108 }}></th>
                </tr></thead>
                <tbody>
                  {results.map((l) => (
                    <tr key={l.law_key}>
                      <td>
                        <b>{l.name}</b>
                        {!l.current && <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>연혁</span>}
                      </td>
                      <td className="muted">{l.dept}</td>
                      <td className="muted">{l.kind}</td>
                      <td className="mono" style={{ fontSize: 11.5 }}>{ymd(l.effective)}</td>
                      <td style={{ textAlign: 'right' }}>
                        {collectedKeys.has(l.law_key)
                          ? <button className="btn sm ghost" onClick={() => sync(l.law_key, l.name)} disabled={busy === l.law_key}>
                              {busy === l.law_key ? '…' : '↻ 갱신'}
                            </button>
                          : <button className="btn sm primary" onClick={() => sync(l.law_key, l.name)} disabled={busy === l.law_key}>
                              {busy === l.law_key ? '수집 중…' : '＋ 수집'}
                            </button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>)}
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <div>
            <h2>수집된 법령</h2>
            <div className="sub">조문을 펼쳐 본문을 확인하고, 룰에 연결된 조문을 볼 수 있습니다.</div>
          </div>
          <span className="tag">{collected.length}건</span>
        </div>
        <div className="card-b" style={{ padding: 0 }}>
          {collected.length === 0
            ? <div className="card-b muted">아직 수집된 법령이 없습니다. 위에서 검색해 수집하세요.</div>
            : <table className="tbl rows">
                <thead><tr>
                  <th>법령명</th><th style={{ width: 78 }}>조문</th><th style={{ width: 92 }}>연결 룰</th>
                  <th style={{ width: 110 }}>시행일</th><th style={{ width: 132 }}>최근 수집</th><th style={{ width: 150 }}></th>
                </tr></thead>
                <tbody>
                  {collected.map((l) => (
                    <Fragment key={l.law_key}>
                      <tr>
                        <td>
                          <b>{l.law_name}</b>
                          {l.pending > 0 && <span className="badge draft" style={{ marginLeft: 8 }}><i />개정 {l.pending}</span>}
                        </td>
                        <td className="mono">{l.articles}</td>
                        <td>{l.linked_rules > 0
                          ? <span className="badge published"><i />{l.linked_rules}</span>
                          : <span className="muted" style={{ fontSize: 11.5 }}>없음</span>}</td>
                        <td className="mono" style={{ fontSize: 11.5 }}>{ymd(l.effective_date)}</td>
                        <td className="muted mono" style={{ fontSize: 11 }}>{(l.fetched_at || '').slice(0, 16)}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button className="btn sm ghost" onClick={() => toggleArticles(l.law_key)}>
                            {openKey === l.law_key ? '접기' : '조문'}
                          </button>
                          <button className="btn sm ghost" style={{ marginLeft: 6 }}
                            onClick={() => sync(l.law_key, l.law_name)} disabled={busy === l.law_key}>
                            {busy === l.law_key ? '…' : '↻ 갱신'}
                          </button>
                        </td>
                      </tr>
                      {openKey === l.law_key && (
                        <tr><td colSpan="6" style={{ padding: 0 }}>
                          <ArticlePanel list={articles[l.law_key]} />
                        </td></tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>}
        </div>
      </div>
      </>}

      {tab === 'updates' && <UpdatesPanel onChanged={() => { loadPending(); loadCollected(); }} />}
      {tab === 'history' && <HistoryPanel />}
    </div>
  );
}

/* 변경 이력 — 이력은 계속 쌓이므로 날짜로 묶고, 같은 시각·같은 법령의 이벤트는
   한 건으로 접는다. 실제 법 개정은 조문 수십 개가 한꺼번에 바뀌어서
   조문 단위로 나열하면 하루치가 수십 줄이 된다. */
const KIND = {
  collected: { label: '수집', verb: '수집' },
  updated: { label: '개정 반영', verb: '반영' },
  detected: { label: '개정 감지', verb: '감지' },
  rejected: { label: '반려', verb: '반려' },
};
const KEYS = Object.keys(KIND);
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const dayLabel = (d) => {
  const dt = new Date(d + 'T00:00:00');
  return isNaN(dt) ? d : `${d} (${WD[dt.getDay()]})`;
};

function HistoryPanel() {
  const [raw, setRaw] = useState(null);
  const [kinds, setKinds] = useState(() => new Set(KEYS));
  const [lawKey, setLawKey] = useState('');
  const [q, setQ] = useState('');
  const [days, setDays] = useState(7);        // 표시할 날짜 그룹 수
  const [open, setOpen] = useState(null);

  useEffect(() => { api.lawHistory().then(setRaw).catch(() => setRaw([])); }, []);
  useEffect(() => { setDays(7); }, [kinds, lawKey, q]);

  // 같은 (분·종류·법령) 이벤트를 한 건으로 묶는다
  const groups = useMemo(() => {
    if (!raw) return null;
    const kw = q.trim().toLowerCase();
    const hit = (e) => !kw || `${e.law_name} ${e.article_no || ''} ${e.article_title || ''}`.toLowerCase().includes(kw);
    const bucket = new Map();
    for (const e of raw) {
      if (!kinds.has(e.kind)) continue;
      if (lawKey && e.law_key !== lawKey) continue;
      if (!hit(e)) continue;
      const at = String(e.at);
      const key = `${at.slice(0, 16)}|${e.kind}|${e.law_key}`;
      if (!bucket.has(key)) bucket.set(key, { key, at, kind: e.kind, law_key: e.law_key, law_name: e.law_name, items: [], n: 0 });
      const g = bucket.get(key);
      g.items.push(e);
      g.n += e.n || 1;                       // 수집은 조문 수(n), 나머지는 1건씩
    }
    // 날짜별로 다시 묶기
    const byDay = new Map();
    for (const g of [...bucket.values()].sort((a, b) => b.at.localeCompare(a.at))) {
      const d = g.at.slice(0, 10);
      if (!byDay.has(d)) byDay.set(d, []);
      byDay.get(d).push(g);
    }
    return [...byDay.entries()];
  }, [raw, kinds, lawKey, q]);

  const laws = useMemo(() => {
    const m = new Map();
    (raw || []).forEach((e) => m.set(e.law_key, e.law_name));
    return [...m.entries()];
  }, [raw]);

  const toggle = (k) => setKinds((p) => {
    const n = new Set(p);
    n.has(k) ? n.delete(k) : n.add(k);
    return n.size ? n : new Set(KEYS);
  });

  const shown = (groups || []).slice(0, days);
  const total = (groups || []).reduce((s, [, gs]) => s + gs.length, 0);

  return (
    <div className="card">
      <div className="card-h">
        <div>
          <h2>변경 이력</h2>
          <div className="sub">법령이 수집·개정된 기록입니다. 같은 시각에 일어난 변경은 한 건으로 묶여 있습니다.</div>
        </div>
      </div>

      <div className="rl-tools">
        <div className="row" style={{ gap: 5 }}>
          {KEYS.map((k) => (
            <button key={k} className={'btn sm ' + (kinds.has(k) ? '' : 'ghost')} onClick={() => toggle(k)}>
              {KIND[k].label}
            </button>
          ))}
        </div>
        {laws.length > 1 && (
          <select className="fld" style={{ width: 'auto', padding: '7px 10px', fontSize: 12.5 }}
            value={lawKey} onChange={(e) => setLawKey(e.target.value)}>
            <option value="">전체 법령</option>
            {laws.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
        )}
        <div className="srchbox" style={{ minWidth: 220, maxWidth: 300 }}>
          <span className="ic">🔍</span>
          <input placeholder="법령 · 조문 검색" value={q}
            onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQ('')} />
          {q && <button className="x" onClick={() => setQ('')}>×</button>}
        </div>
        <span className="spacer" />
        <span className="muted" style={{ fontSize: 11.5 }}>{total}건</span>
      </div>

      <div className="card-b" style={{ padding: 0 }}>
        {groups === null
          ? <div className="card-b muted">불러오는 중…</div>
          : total === 0
            ? <div className="card-b muted">조건에 맞는 기록이 없습니다.</div>
            : <>
                {shown.map(([day, list]) => (
                  <div key={day}>
                    <div className="hday">
                      <b>{dayLabel(day)}</b>
                      <span className="n">{list.length}건</span>
                    </div>
                    {list.map((g) => {
                      const many = g.items.length > 1 || g.kind === 'collected';
                      const one = g.items[0];
                      const isOpen = open === g.key;
                      return (
                        <div className={'hitem ' + g.kind + (many ? ' clickable' : '')} key={g.key}>
                          <div className="h" onClick={() => many && setOpen(isOpen ? null : g.key)}>
                            <span className="tm">{g.at.slice(11, 16)}</span>
                            <span className="kind">{KIND[g.kind].label}</span>
                            <span className="txt">
                              <b>{g.law_name}</b>
                              {many
                                ? <> · 조문 <b>{g.n}개</b> {KIND[g.kind].verb}</>
                                : <>
                                    {one.article_no && <span className="chip mono" style={{ marginLeft: 6 }}>{one.article_no}</span>}
                                    {one.article_title && <span className="muted" style={{ marginLeft: 6 }}>{one.article_title}</span>}
                                  </>}
                              {!many && detailLine(one)}
                            </span>
                            {many && <span className="car">{isOpen ? '▴' : '▾'}</span>}
                          </div>
                          {many && isOpen && (
                            <div className="hsub">
                              {g.items.map((e, i) => (
                                <div className="r" key={i}>
                                  {e.article_no
                                    ? <><span className="no mono">{e.article_no}</span>
                                        <span className="t">{e.article_title || '(제목 없음)'}</span></>
                                    : <span className="t muted">조문 {e.n}개가 이 시각에 수집됐습니다.</span>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
                {days < (groups?.length || 0) && (
                  <div style={{ padding: 14, textAlign: 'center' }}>
                    <button className="btn sm" onClick={() => setDays((d) => d + 7)}>
                      이전 기록 더 보기 ({groups.length - days}일 남음)
                    </button>
                  </div>
                )}
              </>}
      </div>
    </div>
  );
}

// 단건일 때만 보조 설명 — 누가·왜를 한 줄로
function detailLine(e) {
  const bits = [];
  if (e.actor) bits.push(<b key="a">{e.actor}</b>);
  if (e.affected_rules > 0) bits.push(<span key="r">영향 룰 {e.affected_rules}</span>);
  if (e.note) bits.push(<span key="n">“{e.note}”</span>);
  if (e.kind === 'detected') bits.push(<span key="d">승인 대기</span>);
  if (!bits.length) return null;
  return <div className="sub">{bits.map((b, i) => <Fragment key={i}>{i > 0 && ' · '}{b}</Fragment>)}</div>;
}

/* 개정 승인 — 스케줄러가 감지한 개정을 사람이 승인해야 룰에 반영된다.
   (구 /updates 화면을 법령 관리 탭으로 흡수) */
const UST = [
  { k: 'pending', label: '대기' },
  { k: 'approved', label: '승인' },
  { k: 'rejected', label: '반려' },
];

function UpdatesPanel({ onChanged }) {
  const [status, setStatus] = useState('pending');
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(0);

  const load = () => api.updates(status).then(setList);
  useEffect(() => { load(); }, [status]);

  async function approve(id) {
    setBusy(id); await api.approveUpdate(id); setBusy(0);
    load(); onChanged?.();
  }
  async function reject(id) {
    const note = prompt('반려 사유(선택)') ?? '';
    setBusy(id); await api.rejectUpdate(id, note); setBusy(0);
    load(); onChanged?.();
  }

  return (
    <div className="card">
      <div className="card-h">
        <div>
          <h2>개정 승인</h2>
          <div className="sub">
            감지된 개정은 <b>승인해야</b> 법령 본문에 반영됩니다. 승인해도 룰 본문은 자동으로 바뀌지 않고, 참조 룰에 이력만 남습니다.
          </div>
        </div>
        <span className="spacer" />
        <div className="seg">
          {UST.map((s) => (
            <button key={s.k} className={status === s.k ? 'on' : ''} onClick={() => setStatus(s.k)}>{s.label}</button>
          ))}
        </div>
      </div>
      <div className="card-b" style={{ padding: 0 }}>
        {list.length === 0
          ? <div className="card-b muted">
              {status === 'pending'
                ? '대기 중인 개정이 없습니다. 위 ‘지금 점검’으로 즉시 확인할 수 있습니다.'
                : `${UST.find((s) => s.k === status).label} 항목이 없습니다.`}
            </div>
          : list.map((u) => (
              <div key={u.id} style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
                <div className="row" style={{ marginBottom: 10 }}>
                  <b>{u.law_name}</b>
                  <span className="chip mono">{u.article_no}</span>
                  {u.article_title && <span className="muted">{u.article_title}</span>}
                  <span className={'badge ' + (u.affected_rules > 0 ? 'draft' : 'published')}>
                    <i />영향 룰 {u.affected_rules}
                  </span>
                  <span className="spacer" />
                  <span className="muted mono" style={{ fontSize: 11 }}>{(u.detected_at || '').slice(0, 16)}</span>
                  {status === 'pending' && (
                    <>
                      <button className="btn sm pass" disabled={busy === u.id} onClick={() => approve(u.id)}>✓ 승인</button>
                      <button className="btn sm ghost" disabled={busy === u.id} onClick={() => reject(u.id)}>반려</button>
                    </>
                  )}
                  {status !== 'pending' && u.reviewed_by && (
                    <span className="muted" style={{ fontSize: 11.5 }}>by {u.reviewed_by}</span>
                  )}
                </div>
                <div className="grid g-2" style={{ gap: 10 }}>
                  <div>
                    <div className="mini" style={{ color: 'var(--fail)' }}>개정 전</div>
                    <pre className="diff old">{u.old_content}</pre>
                  </div>
                  <div>
                    <div className="mini" style={{ color: 'var(--pass)' }}>개정 후</div>
                    <pre className="diff new">{u.new_content}</pre>
                  </div>
                </div>
              </div>
            ))}
      </div>
    </div>
  );
}

/* 조문 목록 — 73개를 스크롤로 뒤지지 않도록 검색·필터를 붙이고 본문을 펼쳐 볼 수 있게 한다 */
function ArticlePanel({ list }) {
  const [kw, setKw] = useState('');
  const [onlyLinked, setOnlyLinked] = useState(false);
  const [open, setOpen] = useState(null);

  const view = useMemo(() => {
    const s = kw.trim().toLowerCase();
    return (list || []).filter((a) => {
      if (onlyLinked && !a.linked_rules) return false;
      if (!s) return true;
      return `${a.article_no} ${a.article_title || ''} ${a.content || ''}`.toLowerCase().includes(s);
    });
  }, [list, kw, onlyLinked]);

  if (!list) return <div className="artempty">조문 불러오는 중…</div>;
  const linked = list.filter((a) => a.linked_rules > 0).length;

  return (
    <div className="artpanel">
      <div className="artbar">
        <div className="srchbox" style={{ minWidth: 240, maxWidth: 320 }}>
          <span className="ic">🔍</span>
          <input placeholder="조문번호 · 제목 · 본문 검색" value={kw}
            onChange={(e) => setKw(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setKw('')} />
          {kw && <button className="x" onClick={() => setKw('')}>×</button>}
        </div>
        <button className={'btn sm ' + (onlyLinked ? 'primary' : 'ghost')}
          onClick={() => setOnlyLinked((v) => !v)} disabled={linked === 0}>
          룰 연결됨 {linked}
        </button>
        <span className="spacer" />
        <span className="muted" style={{ fontSize: 11.5 }}>{view.length} / {list.length}조</span>
      </div>

      {view.length === 0
        ? <div className="artempty">조건에 맞는 조문이 없습니다.</div>
        : <div className="artlist">
            {view.map((a) => (
              <div key={a.id} className={'artrow' + (open === a.id ? ' on' : '')}>
                <div className="h" onClick={() => setOpen(open === a.id ? null : a.id)}>
                  <span className="no mono">{a.article_no}</span>
                  <span className="ti">{a.article_title || '(제목 없음)'}</span>
                  {a.linked_rules > 0 && <span className="badge published"><i />룰 {a.linked_rules}</span>}
                  <span className="muted mono" style={{ fontSize: 10.5 }}>{ymd(a.effective_date)}</span>
                  <span className="muted" style={{ fontSize: 11 }}>{open === a.id ? '▴' : '▾'}</span>
                </div>
                {open === a.id && <div className="body">{a.content || '(본문 없음)'}</div>}
              </div>
            ))}
          </div>}
    </div>
  );
}
