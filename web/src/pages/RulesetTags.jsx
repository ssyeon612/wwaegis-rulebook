import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { parseActionTags } from '../lib/standardTags.js';

// 룰셋별 태그 관리 (옵션3 — 표준을 복제해온 뒤 룰셋 안에서 편집).
// 사전은 전역 상수가 아니라 이 룰셋의 ruleset_tags(API)에서 온다. 룰셋마다 독립.
export default function RulesetTags() {
  const { id } = useParams();
  const [ts, setTs] = useState(null);   // { meaning, action, orphans }
  const [rs, setRs] = useState(null);
  const [section, setSection] = useState('meaning');   // meaning | action

  const load = () => Promise.all([api.tagset(id), api.getRuleset(id)]).then(([t, r]) => { setTs(t); setRs(r); });
  useEffect(() => { load(); }, [id]);

  if (!ts || !rs) return <div className="muted">로딩 중…</div>;

  const M = ts.meaning, A = ts.action;
  const usedM = M.filter((m) => m.count > 0);
  const customM = M.filter((m) => m.origin === 'custom');
  const orphans = [...ts.orphans.meaning, ...ts.orphans.action];
  const activeA = A.filter((a) => a.active);
  const rules = rs.rules || [];
  const noAction = rules.filter((r) => parseActionTags(r.action_tags).length === 0);

  return (
    <div className="tagmgr">
      <div className="card">
        <div className="card-h">
          <div>
            <h2>🏷 태그 관리 — {rs.name}</h2>
            <div className="sub">이 룰셋은 표준을 복제한 <b>자체 태그 사전</b>을 가집니다. 여기서 자유롭게 편집합니다.</div>
          </div>
          <span className="spacer" />
          <Link className="btn sm ghost" to="/">← 룰 편집</Link>
        </div>

        {/* 지표는 그리드로 — flex+wrap 이면 라벨 줄 수에 따라 칸 높이가 제각각이 된다 */}
        <div className="tm-metrics">
          <Metric n={M.length} l="사전 태그" s={`사용 ${usedM.length} · 미사용 ${M.length - usedM.length}`} />
          <Metric n={customM.length} l="신규(custom)" s="표준에 없는 코드" warn={customM.length > 0} />
          <Metric n={orphans.length} l="사전 밖 코드" s="룰이 쓰는데 사전에 없음" bad={orphans.length > 0} />
          <Metric n={activeA.length} l="행위태그(활성)" s={`전체 ${A.length}`} />
          <Metric n={noAction.length} l="행위태그 없는 룰" s={`전체 ${rules.length}`} warn={noAction.length > 0} />
        </div>

        {orphans.length > 0 && (
          <div className="tm-warn">
            ⚠ 룰이 쓰는데 이 룰셋 사전에 없는 코드가 있습니다 —{' '}
            <b>{orphans.map((o) => o.code).join(', ')}</b>. 아래에서 사전에 추가하거나 표준 코드로 교정하세요.
          </div>
        )}
      </div>

      {/* 사전 — 의미 / 행위 탭 전환 (위아래 대신 한 카드에서 교체) */}
      <div className="card">
        <div className="card-h">
          <div className="dict-tabs">
            <button className={section === 'meaning' ? 'on' : ''} onClick={() => setSection('meaning')}>
              의미태그 사전 <span className="cnt">{M.length}</span>
            </button>
            <button className={section === 'action' ? 'on' : ''} onClick={() => setSection('action')}>
              행위태그 사전 <span className="cnt">{A.length}</span>
            </button>
          </div>
          <span className="spacer" />
          <AddTag kind={section} rulesetId={id} onChange={load} />
        </div>

        {section === 'meaning'
          ? <MeaningDict M={M} usedM={usedM} customM={customM} rules={rules} rulesetId={id} onChange={load} />
          : <ActionDict A={A} activeA={activeA} rules={rules} noAction={noAction} rulesetId={id} onChange={load} />}
      </div>
    </div>
  );
}

function Metric({ n, l, s, bad, warn }) {
  return (
    // 상태는 lv- 접두사 — 전역 .warn 은 박스 스타일(margin-bottom:14px)이라
    // 그대로 쓰면 그 칸만 아래 여백이 붙어 그리드 행이 통째로 14px 커진다.
    <div className={'tm-metric' + (bad ? ' lv-bad' : warn ? ' lv-warn' : '')}>
      <div className="v">{n}</div>
      <div className="l">{l}</div>
      {s && <div className="s">{s}</div>}
    </div>
  );
}

/* ───────── 의미태그 사전 ───────── */
function MeaningDict({ M, usedM, customM, rules, rulesetId, onChange }) {
  const [tab, setTab] = useState('used');   // used | custom | all
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [rpp, setRpp] = useState(20);
  const codes = useMemo(() => M.map((m) => m.code), [M]);

  useEffect(() => { setPage(1); }, [tab, q, rpp]);

  // 94개까지 늘어나는 사전이라 검색 없이는 특정 코드를 찾을 수 없다
  const list = useMemo(() => {
    const base = tab === 'used' ? usedM : tab === 'custom' ? customM : M;
    const kw = q.trim().toLowerCase();
    return kw ? base.filter((m) => `${m.code} ${m.name || ''} ${m.groupLabel || ''}`.toLowerCase().includes(kw)) : base;
  }, [tab, q, M, usedM, customM]);

  const pages = Math.max(1, Math.ceil(list.length / rpp));
  const cur = Math.min(page, pages);
  const view = list.slice((cur - 1) * rpp, cur * rpp);

  return (
    <>
      <div className="tg-tools">
        <div className="seg sm">
          {[['used', `사용 중 ${usedM.length}`], ['custom', `신규 ${customM.length}`], ['all', `전체 ${M.length}`]].map(([k, label]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
        <div className="srchbox" style={{ minWidth: 200, maxWidth: 280, height: 34 }}>
          <span className="ic">🔍</span>
          <input placeholder="코드 · 명칭 검색" value={q}
            onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQ('')} />
          {q && <button className="x" onClick={() => setQ('')}>×</button>}
        </div>
      </div>

      {/* 스크롤 박스를 두면 460px 에서 행이 반 잘려 끝나 잘린 것처럼 보인다 — 페이징으로 대신한다 */}
      <table className="tbl rows tg-tbl">
        <thead><tr>
          <th className="c-code">코드</th>
          <th>명칭</th>
          <th className="c-num">사용</th>
          <th className="c-out">출력</th>
          <th className="c-st">상태</th>
          <th className="c-act">작업</th>
        </tr></thead>
        <tbody>
          {view.map((m) => (
            <MeaningRow key={m.id} m={m} rules={rules} codes={codes} rulesetId={rulesetId} onChange={onChange} />
          ))}
          {view.length === 0 && (
            <tr><td colSpan="6"><div className="tg-none">{q ? `‘${q}’와 일치하는 태그가 없습니다.` : '해당 태그가 없습니다.'}</div></td></tr>
          )}
        </tbody>
      </table>

      <Pager total={list.length} cur={cur} pages={pages} rpp={rpp} setPage={setPage} setRpp={setRpp} />

      <datalist id="ruleset-codes">
        {codes.map((c) => <option key={c} value={c} />)}
      </datalist>
    </>
  );
}

// 의미태그 사전 행 — 명칭 편집 · 출력/활성 토글 · 교정/병합 · 삭제 · 쓰는 룰
function MeaningRow({ m, rules, codes, rulesetId, onChange }) {
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(false);
  const [to, setTo] = useState('');
  const [nameEdit, setNameEdit] = useState(false);
  const [name, setName] = useState(m.name || '');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setName(m.name || ''); }, [m.id, m.name]);

  const using = rules.filter((r) => r.tag === m.code);
  async function retag() {
    const t = to.trim().toUpperCase();
    if (!t || t === m.code) { setEdit(false); return; }
    setBusy(true); await api.retag(rulesetId, { from: m.code, to: t }); setBusy(false); setEdit(false); setTo(''); onChange();
  }
  function saveName() {
    setNameEdit(false);
    if (name !== (m.name || '')) api.updateTag(rulesetId, m.id, { name }).then(onChange);
  }
  const toggleOut = () => api.updateTag(rulesetId, m.id, { output: m.output ? 0 : 1 }).then(onChange);
  const toggleActive = () => api.updateTag(rulesetId, m.id, { active: m.active ? 0 : 1 }).then(onChange);
  const del = () => api.removeTag(rulesetId, m.id).then(onChange).catch((e) => alert(String(e.message || e)));

  return (
    <>
      <tr className={(m.active ? '' : 'muted-row') + (open ? ' openrow' : '')}>
        <td className="c-code">
          {/* 펼침은 전용 버튼으로 — 칩을 눌러야 열리는 건 알아채기 어렵다 */}
          <button className={'tg-exp' + (open ? ' on' : '')} onClick={() => setOpen((v) => !v)}
            title={`이 태그를 쓰는 룰 ${using.length}건`} disabled={using.length === 0}>▸</button>
          <span className="chip mono">{m.code}</span>
        </td>
        {/* 명칭과 대분류를 한 줄에 둔다 — 대분류가 아랫줄로 밀리면 행이 30px 높아진다 */}
        <td className="c-name">
          <div className="tg-namewrap">
            {/* 평소엔 텍스트로 둔다 — 모든 행이 입력창이면 표가 시끄럽다 */}
            {nameEdit ? (
              <input className="fld sm" style={{ width: '100%', maxWidth: 320 }} value={name} autoFocus
                onChange={(e) => setName(e.target.value)} onBlur={saveName}
                onKeyDown={(e) => e.key === 'Enter' ? e.currentTarget.blur() : e.key === 'Escape' && (setName(m.name || ''), setNameEdit(false))} />
            ) : (
              <button className={'tg-name' + (m.name ? '' : ' empty')} onClick={() => setNameEdit(true)} title="클릭해 편집">
                {m.name || '명칭 입력'}
              </button>
            )}
            {m.groupLabel && <span className="tg-grp">{m.groupLabel}</span>}
          </div>
        </td>
        <td className="c-num mono">{m.count || <span className="muted">0</span>}</td>
        <td className="c-out">
          <button className={'dot-btn' + (m.output ? ' on' : '')} title={m.output ? '모델 출력 ●' : '비출력 ○'} onClick={toggleOut} />
        </td>
        <td className="c-st">
          <span className={'tst ' + (m.origin === 'custom' ? 'new' : 'ok')}>{m.origin === 'custom' ? '신규' : '표준'}</span>
          {!m.active && <span className="tst off">보류</span>}
        </td>
        <td className="c-act">
          <span className="rowacts">
            <button className={'btn xs ghost' + (edit ? ' on' : '')} onClick={() => setEdit((v) => !v)}
              title="코드 교정/병합">↦ 교정</button>
            <button className="btn xs ghost" onClick={toggleActive}>{m.active ? '보류' : '사용'}</button>
            <button className="btn xs ghost danger" disabled={m.count > 0}
              title={m.count > 0 ? '사용 중 — 삭제 불가' : '삭제'} onClick={del}>🗑</button>
          </span>
        </td>
      </tr>

      {/* 교정 편집기는 186px 작업 칸에 넣으면 '적용'이 세로로 접힌다.
          룰을 통째로 옮기는 동작이라 아래 줄로 빼고 무슨 일이 일어나는지 함께 쓴다. */}
      {edit && (
        <tr className="subrow"><td colSpan="6">
          <div className="retagbox">
            <span className="lb">↦ 코드 교정</span>
            <span className="chip mono">{m.code}</span>
            <span className="arw">→</span>
            <input className="fld sm mono" list="ruleset-codes" value={to} autoFocus placeholder="바꿀 코드"
              onChange={(e) => setTo(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' ? retag() : e.key === 'Escape' && setEdit(false)} />
            <button className="btn xs primary" disabled={busy || !to.trim()} onClick={retag}>적용</button>
            <button className="btn xs ghost" onClick={() => { setTo(''); setEdit(false); }}>취소</button>
            <span className="hint">
              {m.count > 0
                ? <>이 태그를 쓰는 룰 <b>{m.count}건</b>이 새 코드로 옮겨집니다. 이미 있는 코드를 넣으면 <b>병합</b>됩니다.</>
                : <>쓰는 룰이 없어 코드 이름만 바뀝니다.</>}
            </span>
          </div>
        </td></tr>
      )}
      {open && (
        <tr className="subrow"><td colSpan="6">
          <div className="tm-rules">
            {using.map((r) => (
              <div key={r.id} className="tm-rule">
                <b>{r.title}</b>
                <span className="muted">{r.internal_source || ''}</span>
                <span className="spacer" />
                {parseActionTags(r.action_tags).map((a) => <span key={a} className="atag">{a}</span>)}
              </div>
            ))}
          </div>
        </td></tr>
      )}
    </>
  );
}

/* ───────── 행위태그 사전 ───────── */
function ActionDict({ A, activeA, rules, noAction, rulesetId, onChange }) {
  const [showAll, setShowAll] = useState(false);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [rpp, setRpp] = useState(20);
  useEffect(() => { setPage(1); }, [showAll, q, rpp]);

  const list = useMemo(() => {
    const base = showAll ? rules : noAction;
    const kw = q.trim().toLowerCase();
    return kw ? base.filter((r) => `${r.tag || ''} ${r.title || ''}`.toLowerCase().includes(kw)) : base;
  }, [showAll, q, rules, noAction]);

  const pages = Math.max(1, Math.ceil(list.length / rpp));
  const cur = Math.min(page, pages);
  const view = list.slice((cur - 1) * rpp, cur * rpp);

  return (
    <>
      <div className="card-b" style={{ paddingBottom: 6 }}>
        <div className="tg-hint">
          <b>‘어떻게 말했나’</b> — 의미태그와 별개 축입니다. 완료 판정은 보통 설명(EX)·안내(NT)를 요구합니다.
        </div>
        <div className="sa-usage">
          {A.map((a) => (
            <div key={a.id} className={'sa-chip' + (a.count ? ' on' : '') + (a.active ? '' : ' off')}>
              <b className="mono">{a.code}</b> {a.name || ''}
              <span className="cnt">{a.count}</span>
              {a.count === 0 && (
                <button className="x" title="삭제" onClick={() => api.removeTag(rulesetId, a.id).then(onChange).catch((e) => alert(e))}>✕</button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="tg-tools">
        <div className="seg sm">
          <button className={showAll ? '' : 'on'} onClick={() => setShowAll(false)}>미지정 {noAction.length}</button>
          <button className={showAll ? 'on' : ''} onClick={() => setShowAll(true)}>전체 룰 {rules.length}</button>
        </div>
        <div className="srchbox" style={{ minWidth: 200, maxWidth: 280, height: 34 }}>
          <span className="ic">🔍</span>
          <input placeholder="룰 · 태그 검색" value={q}
            onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQ('')} />
          {q && <button className="x" onClick={() => setQ('')}>×</button>}
        </div>
        <span className="spacer" />
        <span className="tg-legend">클릭해 행위태그 지정 · 변경하면 저장 버튼이 나타납니다</span>
      </div>

      <div className="sa-list">
        {view.map((r) => <ActionEditor key={r.id} r={r} actions={activeA} onChange={onChange} />)}
        {view.length === 0 && (
          <div className="tg-none">{q ? `‘${q}’와 일치하는 룰이 없습니다.` : '모든 룰에 행위태그가 있습니다. ✓'}</div>
        )}
      </div>

      <Pager total={list.length} cur={cur} pages={pages} rpp={rpp} setPage={setPage} setRpp={setRpp} unit="룰" />
    </>
  );
}

// 룰 하나의 행위태그 편집 — 이 룰셋의 활성 행위태그로 토글
function ActionEditor({ r, actions, onChange }) {
  const cur = parseActionTags(r.action_tags);
  const [sel, setSel] = useState(cur);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setSel(parseActionTags(r.action_tags)); }, [r.id, r.action_tags]);
  const dirty = sel.join(',') !== cur.join(',');
  const toggle = (c) => setSel((p) => p.includes(c) ? p.filter((x) => x !== c) : [...p, c]);
  const save = async () => { setBusy(true); await api.patchRule(r.id, { action_tags: sel }); setBusy(false); onChange(); };
  return (
    <div className={'sa-row' + (dirty ? ' dirty' : '')}>
      <div className="sa-rt"><span className="chip mono">{r.tag || '(무태그)'}</span><b>{r.title}</b></div>
      <div className="sa-toggles">
        {actions.map((a) => (
          <button key={a.code} className={'atoggle' + (sel.includes(a.code) ? ' on' : '')}
            title={a.name || a.code} onClick={() => toggle(a.code)}>{a.code}</button>
        ))}
        <button className={'btn xs primary sa-save' + (dirty ? '' : ' hid')} disabled={busy || !dirty} onClick={save}>저장</button>
      </div>
    </div>
  );
}

// 신규 태그 추가 (custom)
function AddTag({ kind, rulesetId, onChange }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  async function add() {
    if (!code.trim()) return;
    setBusy(true);
    const r = await api.addTag(rulesetId, { kind, code: code.trim(), name: name.trim() });
    setBusy(false);
    if (r.error) { alert(r.message); return; }
    setCode(''); setName(''); setOpen(false); onChange();
  }
  if (!open) return <button className="btn sm" onClick={() => setOpen(true)}>＋ 태그 추가</button>;
  return (
    <span className="addtag">
      <input className="fld sm mono" style={{ width: 100 }} value={code} autoFocus placeholder="CODE"
        onChange={(e) => setCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && add()} />
      <input className="fld sm" style={{ width: 130 }} value={name} placeholder="명칭"
        onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
      <button className="btn xs primary" disabled={busy} onClick={add}>추가</button>
      <button className="btn xs ghost" onClick={() => setOpen(false)}>✕</button>
    </span>
  );
}

// 하단 페이지네이션 — 룰 편집 화면(.tfoot)과 같은 형태로 맞춘다
function Pager({ total, cur, pages, rpp, setPage, setRpp, unit = '건' }) {
  if (total === 0) return null;
  return (
    <div className="tfoot">
      <span className="info">
        총 {total}{unit} 중 <b>{(cur - 1) * rpp + 1}–{Math.min(cur * rpp, total)}</b> 표시
      </span>
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
          {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
    </div>
  );
}
