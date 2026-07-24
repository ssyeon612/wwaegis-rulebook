import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
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
      {/* 요약 카드는 사이드바(룰셋명·룰 편집)와 상단바(제목)와 겹쳐 제거했다.
          다만 '사전 밖 코드' 경고는 실제 오류 신호이므로 사전 카드 위에 살려 둔다. */}
      {orphans.length > 0 && (
        <div className="tm-warn standalone">
          ⚠ 룰이 쓰는데 이 룰셋 사전에 없는 코드가 있습니다 —{' '}
          <b>{orphans.map((o) => o.code).join(', ')}</b>. 아래에서 사전에 추가하거나 표준 코드로 교정하세요.
        </div>
      )}

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

/* ───────── 의미태그 사전 (2단: 좌 대분류 · 우 태그) ───────── */
function MeaningDict({ M, customM, rules, rulesetId, onChange }) {
  const [cat, setCat] = useState('all');   // all | custom | unused | <대분류>
  const [q, setQ] = useState('');
  const codes = useMemo(() => M.map((m) => m.code), [M]);

  // 대분류별 개수 (서버가 grp 순으로 정렬해 보내므로 그 순서를 그대로 유지)
  const cats = useMemo(() => {
    const map = new Map();
    for (const m of M) { const k = m.groupLabel || '기타'; map.set(k, (map.get(k) || 0) + 1); }
    return [...map.entries()].map(([label, count]) => ({ label, count }));
  }, [M]);
  const unusedN = useMemo(() => M.filter((m) => !m.active).length, [M]);

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (kw) return M.filter((m) => `${m.code} ${m.name || ''} ${m.groupLabel || ''}`.toLowerCase().includes(kw));
    if (cat === 'custom') return customM;
    if (cat === 'unused') return M.filter((m) => !m.active);
    if (cat === 'all') return M;
    return M.filter((m) => (m.groupLabel || '기타') === cat);
  }, [M, customM, cat, q]);

  const pick = (k) => { setCat(k); setQ(''); };
  const heading = q ? `‘${q}’ 검색` : cat === 'all' ? '전체' : cat === 'custom' ? '신규' : cat === 'unused' ? '미사용' : cat;
  const railBtn = (k, label, n, alt) => (
    <button className={'mt2-cat' + (alt ? ' alt' : '') + (cat === k && !q ? ' on' : '')} onClick={() => pick(k)}>
      <span>{label}</span><em>{n}</em>
    </button>
  );

  return (
    <div className="mt2">
      {/* 좌: 대분류 레일 */}
      <div className="mt2-rail">
        {railBtn('all', '전체', M.length)}
        {customM.length > 0 && railBtn('custom', '신규', customM.length, true)}
        {unusedN > 0 && railBtn('unused', '미사용', unusedN, true)}
        <div className="mt2-sec">대분류</div>
        {cats.map((c) => (
          <button key={c.label} className={'mt2-cat' + (cat === c.label && !q ? ' on' : '')} onClick={() => pick(c.label)}>
            <span>{c.label}</span><em>{c.count}</em>
          </button>
        ))}
      </div>

      {/* 우: 선택한 카테고리의 태그 */}
      <div className="mt2-main">
        <div className="mt2-tools">
          <b className="mt2-title">{heading} <span className="muted">{list.length}</span></b>
          <span className="spacer" />
          <div className="srchbox" style={{ minWidth: 200, maxWidth: 280, height: 34 }}>
            <span className="ic">🔍</span>
            <input placeholder="코드 · 명칭 검색" value={q}
              onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQ('')} />
            {q && <button className="x" onClick={() => setQ('')}>×</button>}
          </div>
        </div>
        <div className="mt2-list">
          {list.map((m) => (
            <MeaningRow key={m.id} m={m} rules={rules} rulesetId={rulesetId} onChange={onChange} />
          ))}
          {list.length === 0 && <div className="tg-none">{q ? `‘${q}’와 일치하는 태그가 없습니다.` : '해당 태그가 없습니다.'}</div>}
        </div>
      </div>

      <datalist id="ruleset-codes">
        {codes.map((c) => <option key={c} value={c} />)}
      </datalist>
    </div>
  );
}

// 의미태그 사전 행 — 명칭 인라인 편집(호버 ✎) · 사용/미사용(서빙 제외) · 교정/병합 · 삭제 · 쓰는 룰
function MeaningRow({ m, rules, rulesetId, onChange }) {
  const [open, setOpen] = useState(false);      // 쓰는 룰 펼침
  const [edit, setEdit] = useState(false);      // 코드 교정
  const [to, setTo] = useState('');
  const [nameEdit, setNameEdit] = useState(false);
  const [name, setName] = useState(m.name || '');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setName(m.name || ''); setNameEdit(false); }, [m.id, m.name]);

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
  const toggleUse = () => api.updateTag(rulesetId, m.id, { active: m.active ? 0 : 1 }).then(onChange);
  const del = () => api.removeTag(rulesetId, m.id).then(onChange).catch((e) => alert(String(e.message || e)));

  return (
    <div className={'mt-item' + (m.active ? '' : ' off') + (open || edit ? ' exp' : '')}>
      <div className="mt-row">
        <span className="chip mono">{m.code}</span>
        <div className="mt-name">
          {nameEdit ? (
            <input className="fld sm" style={{ width: '100%', maxWidth: 340 }} value={name} autoFocus
              onChange={(e) => setName(e.target.value)} onBlur={saveName}
              onKeyDown={(e) => e.key === 'Enter' ? e.currentTarget.blur() : e.key === 'Escape' && (setName(m.name || ''), setNameEdit(false))} />
          ) : (
            <button className={'mt-nameBtn' + (m.name ? '' : ' empty')} onClick={() => setNameEdit(true)} title="클릭해 명칭 편집">
              <span>{m.name || '명칭 입력'}</span><span className="ed">✎</span>
            </button>
          )}
        </div>
        <button className={'mt-count' + (using.length ? '' : ' zero')} disabled={using.length === 0}
          onClick={() => setOpen((v) => !v)} title={using.length ? `이 태그를 쓰는 룰 ${using.length}건` : '쓰는 룰 없음'}>
          룰 {m.count || 0}
        </button>
        <button className={'use-sw' + (m.active ? ' on' : '')} onClick={toggleUse} role="switch" aria-checked={m.active}
          title={m.active ? '미사용으로 전환 — 서빙(required_meaning_tags)에서 제외' : '사용으로 전환'}>
          <span className="knob" />
          <span className="lbl">{m.active ? '사용' : '미사용'}</span>
        </button>
        <div className="mt-acts">
          <button className={'ic-btn' + (edit ? ' on' : '')} onClick={() => setEdit((v) => !v)} title="코드 교정/병합">↦</button>
          <button className="ic-btn danger" disabled={m.count > 0} onClick={del}
            title={m.count > 0 ? '사용 중 — 삭제 불가' : '삭제'}>🗑</button>
        </div>
      </div>

      {edit && (
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
      )}
      {open && (
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
      )}
    </div>
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
