import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';

const ICON = { finance: '🏦', securities: '📈', auto: '🚗' };

// SQLite datetime('now')는 UTC라 'Z'를 붙여 파싱해야 로컬 시각으로 맞는다.
const parse = (s) => (s ? new Date(s.replace(' ', 'T') + 'Z') : null);
const p2 = (n) => String(n).padStart(2, '0');
const ymd = (s) => { const d = parse(s); return !d || isNaN(d) ? '—' : `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
const hm = (s) => { const d = parse(s); return !d || isNaN(d) ? '' : `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const rel = (s) => {
  const d = parse(s);
  if (!d || isNaN(d)) return '';
  const sec = (Date.now() - d.getTime()) / 1000;
  if (sec < 60) return '방금';
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`;
  if (sec < 2592000) return `${Math.floor(sec / 86400)}일 전`;
  return `${Math.floor(sec / 2592000)}개월 전`;
};

export default function Rulesets() {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState('all');   // all | published | draft
  const [page, setPage] = useState(1);
  const [rpp, setRpp] = useState(10);
  const [menu, setMenu] = useState(null);

  const load = () => api.listRulesets().then(setRows);
  useEffect(() => { load(); }, []);

  // 바깥 클릭으로 케밥 메뉴 닫기
  useEffect(() => {
    const close = () => setMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const filtered = useMemo(
    () => (rows || []).filter((r) => filter === 'all' || r.status === filter),
    [rows, filter]
  );
  const pages = Math.max(1, Math.ceil(filtered.length / rpp));
  const cur = Math.min(page, pages);
  const view = filtered.slice((cur - 1) * rpp, cur * rpp);
  useEffect(() => { setPage(1); }, [filter, rpp]);

  async function del(id) {
    setMenu(null);
    if (!confirm('이 룰셋을 삭제할까요?')) return;
    await api.deleteRuleset(id); load();
  }

  if (!rows) return <div className="muted">로딩 중…</div>;

  return (
    <div className="card">
      <div className="card-h">
        <div>
          <h2>☰ 룰셋 목록</h2>
          <div className="sub">내규에서 생성된 룰셋을 검토·승인·게시합니다.</div>
        </div>
        <span className="spacer" />
        <select className="fld" style={{ width: 'auto', padding: '7px 10px', fontSize: 12.5 }}
          value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">전체 상태</option>
          <option value="published">게시됨</option>
          <option value="draft">초안</option>
        </select>
        <Link to="/extract" className="btn sm primary">＋ 룰셋 생성</Link>
      </div>

      <div className="card-b" style={{ padding: 0 }}>
        {filtered.length === 0
          ? <div className="card-b muted">
              {rows.length === 0
                ? <>아직 룰셋이 없습니다. <Link to="/extract" style={{ color: 'var(--brand)', fontWeight: 700 }}>룰셋 생성</Link>으로 시작하세요.</>
                : '해당 상태의 룰셋이 없습니다.'}
            </div>
          : <>
              <table className="tbl rows">
                <thead>
                  <tr>
                    <th style={{ width: 92 }}>룰셋 ID</th>
                    <th>이름</th>
                    <th style={{ width: 132 }}>도메인</th>
                    <th style={{ width: 92 }}>룰(승인)</th>
                    <th style={{ width: 92 }}>상태</th>
                    <th style={{ width: 108 }}>생성일</th>
                    <th style={{ width: 118 }}>최종 수정</th>
                    <th style={{ width: 56 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {view.map((r) => (
                    <tr key={r.id}>
                      <td><Link to={`/rulesets/${r.id}`} className="idlink mono">RS-{String(r.id).padStart(4, '0')}</Link></td>
                      <td>
                        <div style={{ fontWeight: 700 }}>{r.name}</div>
                        <div className="muted mono" style={{ fontSize: 11 }}>v{r.version}{r.ruleset_id ? ` · ${r.ruleset_id}` : ''}</div>
                      </td>
                      <td className="dt">{ICON[r.domain] || '📄'} {r.domain}</td>
                      <td className="mono">{r.rule_count} <span className="muted">({r.approved_count})</span></td>
                      <td>
                        <span className={'badge ' + r.status}><i />{r.status === 'published' ? '게시됨' : '초안'}</span>
                      </td>
                      <td className="dt"><b>{ymd(r.created_at)}</b><span>{hm(r.created_at)}</span></td>
                      <td className="dt"><b>{ymd(r.updated_at)}</b><span>{rel(r.updated_at)}</span></td>
                      <td className="kebab">
                        <button onClick={(e) => { e.stopPropagation(); setMenu(menu === r.id ? null : r.id); }}>⋮</button>
                        {menu === r.id && (
                          <div className="kmenu" onClick={(e) => e.stopPropagation()}>
                            <Link to={`/rulesets/${r.id}`}>열기</Link>
                            <Link to={`/rulesets/${r.id}/graph`}>지식그래프</Link>
                            <button className="danger" onClick={() => del(r.id)}>삭제</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="tfoot">
                <span className="info">
                  총 {filtered.length}건 중 <b>{(cur - 1) * rpp + 1}–{Math.min(cur * rpp, filtered.length)}</b> 표시
                </span>
                <div className="pg">
                  <button onClick={() => setPage(cur - 1)} disabled={cur === 1}>‹</button>
                  {Array.from({ length: pages }, (_, i) => i + 1)
                    .filter((n) => n === 1 || n === pages || Math.abs(n - cur) <= 1)
                    .map((n, i, arr) => (
                      <span key={n} style={{ display: 'flex', gap: 5 }}>
                        {i > 0 && arr[i - 1] !== n - 1 && <button disabled>…</button>}
                        <button className={n === cur ? 'on' : ''} onClick={() => setPage(n)}>{n}</button>
                      </span>
                    ))}
                  <button onClick={() => setPage(cur + 1)} disabled={cur === pages}>›</button>
                </div>
                <div className="rpp">
                  페이지당
                  <select value={rpp} onChange={(e) => setRpp(+e.target.value)}>
                    {[5, 10, 20, 50].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
            </>}
      </div>
    </div>
  );
}
