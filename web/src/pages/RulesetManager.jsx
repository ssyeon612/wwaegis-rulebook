import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useWs } from '../lib/ws.js';

// 룰셋 관리 — 전체 룰셋을 한 표에서 보고, 이름을 인라인으로 바꾼다.
// 데이터는 앱 전역 rows(listRulesets)를 그대로 쓰고, 변경 후 loadRows 로 사이드바까지 갱신한다.
const ICON = { finance: '🏦', securities: '📈', auto: '🚗', insurance: '🛡' };
const DOMLBL = { finance: '금융상품', securities: '증권', auto: '자동차', insurance: '보험' };

const p2 = (n) => String(n).padStart(2, '0');
function toDate(s) {
  if (!s) return null;
  const d = new Date(String(s).includes('T') ? s : s.replace(' ', 'T') + 'Z');
  return isNaN(d) ? null : d;
}
const ymd = (s) => { const d = toDate(s); return d ? `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}` : '—'; };
function relTime(s) {
  const d = toDate(s); if (!d) return '';
  const sec = (Date.now() - d.getTime()) / 1000;
  if (sec < 60) return '방금';
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`;
  if (sec < 2592000) return `${Math.floor(sec / 86400)}일 전`;
  return `${Math.floor(sec / 2592000)}개월 전`;
}

export default function RulesetManager() {
  const { rows, loadRows, toSelect } = useWs();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');   // all | published | draft
  const [page, setPage] = useState(1);
  const [rpp, setRpp] = useState(10);
  const [menu, setMenu] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    const close = () => setMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);
  useEffect(() => { setPage(1); }, [q, filter, rpp]);

  const all = rows || [];
  const stats = useMemo(() => ({
    total: all.length,
    published: all.filter((r) => r.status === 'published').length,
    draft: all.filter((r) => r.status !== 'published').length,
    rules: all.reduce((s, r) => s + (r.rule_count || 0), 0),
    approved: all.reduce((s, r) => s + (r.approved_count || 0), 0),
  }), [all]);

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return all.filter((r) => {
      if (filter === 'published' && r.status !== 'published') return false;
      if (filter === 'draft' && r.status === 'published') return false;
      if (!kw) return true;
      return `${r.name} ${DOMLBL[r.domain] || r.domain} ${r.product_name || ''}`.toLowerCase().includes(kw);
    });
  }, [all, q, filter]);
  const pages = Math.max(1, Math.ceil(list.length / rpp));
  const cur = Math.min(page, pages);
  const view = list.slice((cur - 1) * rpp, cur * rpp);

  async function rename(id, name) { setBusy(id); await api.patchRuleset(id, { name }); await loadRows(); setBusy(null); }
  async function del(id, name) {
    setMenu(null);
    if (!confirm(`룰셋 「${name}」을(를) 삭제할까요? 되돌릴 수 없습니다.`)) return;
    setBusy(id); await api.deleteRuleset(id); await loadRows(); setBusy(null);
  }

  if (!rows) return <div className="muted">로딩 중…</div>;

  return (
    <div className="rsm">
      {/* 전체 현황 */}
      <div className="rsm-stats">
        <Stat n={stats.total} l="룰셋" />
        <Stat n={stats.published} l="게시됨" tone="pass" />
        <Stat n={stats.draft} l="초안" tone="amber" />
        <Stat n={stats.rules} l="총 룰" />
        <Stat n={stats.approved} l="승인 룰" tone="pass" />
      </div>

      <div className="card">
        <div className="card-h">
          <div>
            <h2>룰셋 목록</h2>
            <div className="sub">이름을 눌러 바로 바꾸고, 상태·룰 수·수정 시각을 한눈에 봅니다.</div>
          </div>
          <span className="spacer" />
          <div className="seg sm">
            {[['all', `전체 ${all.length}`], ['published', `게시 ${stats.published}`], ['draft', `초안 ${stats.draft}`]].map(([k, label]) => (
              <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{label}</button>
            ))}
          </div>
          <div className="srchbox" style={{ minWidth: 200, maxWidth: 280, height: 34 }}>
            <span className="ic">🔍</span>
            <input placeholder="룰셋명 · 도메인 검색" value={q}
              onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQ('')} />
            {q && <button className="x" onClick={() => setQ('')}>×</button>}
          </div>
        </div>

        <div className="card-b" style={{ padding: 0 }}>
          {list.length === 0
            ? <div className="card-b muted">
                {all.length === 0 ? '아직 룰셋이 없습니다. 헤더의 ＋ 룰 생성으로 시작하세요.' : '조건에 맞는 룰셋이 없습니다.'}
              </div>
            : <table className="tbl rows rsm-tbl">
                <thead><tr>
                  <th>룰셋명</th>
                  <th style={{ width: 120 }}>도메인</th>
                  <th style={{ width: 96 }}>상태</th>
                  <th style={{ width: 110 }}>룰(승인)</th>
                  <th style={{ width: 108 }}>생성일</th>
                  <th style={{ width: 140 }}>최종 수정</th>
                  <th style={{ width: 116 }} />
                </tr></thead>
                <tbody>
                  {view.map((r) => (
                    <Row key={r.id} r={r} busy={busy === r.id} menu={menu === r.id}
                      onRename={(name) => rename(r.id, name)}
                      onOpen={() => toSelect(r.id)}
                      onMenu={() => setMenu(menu === r.id ? null : r.id)}
                      onGraph={() => { setMenu(null); nav(`/rulesets/${r.id}/graph`); }}
                      onTags={() => { setMenu(null); nav(`/rulesets/${r.id}/tags`); }}
                      onDel={() => del(r.id, r.name)} />
                  ))}
                </tbody>
              </table>}
        </div>

        {list.length > 0 && (
          <div className="tfoot">
            <span className="info">총 {list.length}건 중 <b>{(cur - 1) * rpp + 1}–{Math.min(cur * rpp, list.length)}</b> 표시</span>
            {pages > 1 && (
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
            )}
            <div className="rpp" style={pages > 1 ? undefined : { marginLeft: 'auto' }}>
              페이지당
              <select value={rpp} onChange={(e) => setRpp(+e.target.value)}>
                {[10, 20, 50].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ n, l, tone }) {
  return <div className={'rsm-stat' + (tone ? ' ' + tone : '')}><b>{n}</b><span>{l}</span></div>;
}

function Row({ r, busy, menu, onRename, onOpen, onMenu, onGraph, onTags, onDel }) {
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(r.name);
  useEffect(() => { setName(r.name); }, [r.name]);
  function save() {
    setEdit(false);
    const t = name.trim();
    if (t && t !== r.name) onRename(t); else setName(r.name);
  }
  return (
    <tr>
      <td className="rsm-name">
        {/* 이름은 평소 텍스트 — 클릭하면 입력창으로 바뀐다 */}
        {edit ? (
          <input className="fld sm" style={{ width: '100%', maxWidth: 380 }} value={name} autoFocus disabled={busy}
            onChange={(e) => setName(e.target.value)} onBlur={save}
            onKeyDown={(e) => e.key === 'Enter' ? e.currentTarget.blur() : e.key === 'Escape' && (setName(r.name), setEdit(false))} />
        ) : (
          <button className="rsm-namebtn" onClick={() => setEdit(true)} title="클릭해 이름 변경">
            <b>{r.name}</b><span className="ed">✎</span>
          </button>
        )}
        {r.ruleset_id && <div className="rsm-uid mono">{r.ruleset_id}</div>}
      </td>
      <td className="dt">{ICON[r.domain] || '📄'} {DOMLBL[r.domain] || r.domain}</td>
      <td><span className={'badge ' + (r.status === 'published' ? 'published' : 'draft')}><i />{r.status === 'published' ? '게시됨' : '초안'}</span></td>
      <td className="mono">{r.rule_count} <span className="muted">({r.approved_count})</span></td>
      <td className="dt"><b>{ymd(r.created_at)}</b></td>
      <td className="dt"><b>{ymd(r.updated_at)}</b><span>{relTime(r.updated_at)}</span></td>
      <td className="acts">
        <div className="rsm-acts">
          <button className="btn sm" onClick={onOpen} disabled={busy}>열기</button>
          <div className="kebab">
            <button onClick={(e) => { e.stopPropagation(); onMenu(); }}>⋮</button>
            {menu && (
              <div className="kmenu" onClick={(e) => e.stopPropagation()}>
                <button onClick={onTags}>태그 관리</button>
                <button onClick={onGraph}>온톨로지</button>
                <button className="danger" onClick={onDel}>삭제</button>
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}
