import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useWs } from '../lib/ws.js';
import { useAuth } from '../lib/auth.jsx';

const ICON = { finance: '🏦', securities: '📈', auto: '🚗', insurance: '🛡' };
// 업로드 허용 확장자 — 화면 표시(칩)와 input accept 를 한 곳에서 관리한다.
const ACCEPT_EXTS = ['xlsx', 'xls', 'csv', 'pdf', 'txt', 'md'];
const ACCEPT_ATTR = ACCEPT_EXTS.map((e) => '.' + e).join(',');

// knowledge 본문 끝의 [추가 의미태그] 라인을 분리한다 (서버 splitMeaningTags 와 동일 규칙).
// 판단근거 칸에는 본문(body)만 보이고, 추가 의미태그는 의미태그 칩으로 옮겨 보여준다.
const EXTRA_MEANING_RE = /^\s*\[추가\s*의미\s*태그\]\s*(.+)$/;
function splitMeaning(knowledge) {
  if (!knowledge || typeof knowledge !== 'string') return { body: knowledge || '', tags: [] };
  const tags = [], kept = [];
  for (const line of knowledge.split('\n')) {
    const m = line.match(EXTRA_MEANING_RE);
    if (m) { m[1].split(/[,\s]+/).map((s) => s.trim()).filter(Boolean).forEach((t) => tags.push(t)); continue; }
    kept.push(line);
  }
  return { body: kept.join('\n').replace(/\n+$/, ''), tags: [...new Set(tags)] };
}

// 룰 편집 — 하는 일이 둘로 갈린다.
//  · 선택 모드: 기존 룰셋을 골라 룰을 검토·편집·게시  (상시)
//  · 생성 모드: 내규를 올려 새 룰셋을 만들거나 기존에 추가 (가끔)
// 두 작업이 섞이면 헷갈리므로 상단에서 모드를 명시적으로 가른다.
export default function Workspace() {
  // 모드·선택 룰셋·추가 대상은 앱 전역(사이드바)에서 관리한다. 여기선 소비만 한다.
  const { rows, loadRows, mode, setMode, selId, sel, toSelect, createTarget, setCreateTarget } = useWs();
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    if (mode === 'select' && selId) api.getRuleset(selId).then(setDetail);
    else setDetail(null);
  }, [mode, selId]);

  async function afterCreate(rsId) {
    await loadRows();
    setCreateTarget(null);
    toSelect(rsId);
  }
  const reloadDetail = () => { loadRows(); if (selId) api.getRuleset(selId).then(setDetail); };

  if (!rows || mode === null) return <div className="muted">로딩 중…</div>;

  if (mode === 'create') {
    return (
      <>
        {createTarget && (
          <div className="addbar">
            <span className="ic">＋</span>
            <div className="txt">
              <b>기존 룰셋에 추가하는 중</b>
              <span>분석된 룰이 <em>{sel?.name}</em>에 병합됩니다 · 중복 개념은 자동 제외</span>
            </div>
            <span className="spacer" />
            <button className="btn sm" onClick={() => { setCreateTarget(null); toSelect(); }}>← 추가 취소</button>
          </div>
        )}
        <CreatePanel target={createTarget} targetName={sel?.name} onDone={afterCreate} />
      </>
    );
  }

  if (!detail) return <div className="muted">로딩 중…</div>;
  // 사이드바의 ＋생성은 대상 없이 새로 만들고, 여기 ＋내규 추가는 현재 룰셋을 대상으로 잡는다.
  return (
    // key={detail.id} — 룰셋을 바꾸면 필터·페이지·열린 편집행 등 내부 상태를 깨끗이 초기화한다
    <RuleWorkbench key={detail.id} rs={detail} onChange={reloadDetail}
      onAdd={() => { setCreateTarget(selId); setMode('create'); }} />
  );
}

/* ───────── 생성 패널 ───────── */
function CreatePanel({ target, targetName, onDone }) {
  const [src, setSrc] = useState('file');   // file | text
  const [files, setFiles] = useState([]);   // 다중 파일 업로드
  const [text, setText] = useState('');
  const [docName, setDocName] = useState('');
  const [prodName, setProdName] = useState('');   // STT 목록 표시 상품명 = 문서명
  const [prodTouched, setProdTouched] = useState(false);   // 문서명을 사용자가 직접 고쳤는지
  const [hint, setHint] = useState('');
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');   // 법령 자동 수집 결과 안내

  // 파일 추가(같은 이름·크기는 중복 제외).
  const addFiles = (list) => {
    const incoming = [...(list || [])].filter(Boolean);
    if (!incoming.length) return;
    setErr('');
    setFiles((prev) => {
      const key = (f) => `${f.name}:${f.size}`;
      const seen = new Set(prev.map(key));
      return [...prev, ...incoming.filter((f) => !seen.has(key(f)))];
    });
  };
  const removeFile = (i) => setFiles((prev) => prev.filter((_, k) => k !== i));

  // 문서명 자동 바인딩 — 파일 1개면 그 파일명(확장자 제외), 여러 개면 빈칸. 직접 수정하면 유지.
  useEffect(() => {
    if (prodTouched) return;
    setProdName(files.length === 1 ? files[0].name.replace(/\.[^.]+$/, '') : '');
  }, [files, prodTouched]);

  const ready = src === 'file' ? files.length > 0 : !!text.trim();

  // 생성 중에는 새로고침/창 닫기를 경고한다 (다른 화면 이동은 오버레이가 막는다).
  useEffect(() => {
    if (!busy) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  async function run() {
    setBusy(true); setErr('');
    try {
      const form = new FormData();
      if (src === 'file') files.forEach((f) => form.append('files', f));   // 모든 파일 전송
      else {
        form.append('text', text);
        if (docName.trim()) form.append('name', docName.trim());
      }
      if (hint.trim()) form.append('hint', hint);
      // 상품명은 파일 업로드로 새 룰셋을 만들 때만 받는다(직접 입력·추가 모드는 제외).
      if (!target && src === 'file' && prodName.trim()) form.append('productName', prodName.trim());
      if (target) form.append('target_ruleset_id', String(target));
      const res = await api.extract(form);
      if (res.error) { setErr(res.message || res.error); setBusy(false); return; }
      // 법령 자동 수집 결과가 있으면 잠깐 안내 후 이동 (없으면 즉시 이동). 이동까지 오버레이 유지.
      const lc = res.law_collect;
      if (lc?.collected?.length) {
        const arts = lc.collected.reduce((s, c) => s + (c.added || 0), 0);
        setNote(`국가법령정보센터에서 법령 ${lc.collected.length}건(조문 ${arts}개)을 자동 수집·연결했습니다.`);
        setTimeout(() => onDone(res.ruleset_id), 1300);
        return;
      }
      onDone(res.ruleset_id);
    } catch (e) { setErr(String(e)); setBusy(false); }
  }

  return (
    <>
    {/* 생성 중 — 전체 화면을 덮어 다른 화면 이동을 막는다 */}
    {busy && (
      <div className="creating-overlay">
        <div className="creating-box">
          <div className="spinner" />
          <b>룰셋 생성 중…</b>
          <span>{target ? '업로드한 문서를 분석해 이 룰셋에 추가하고 있습니다.' : 'AI가 업로드한 문서를 분석해 룰셋을 만들고 있습니다.'} 완료될 때까지 다른 작업을 할 수 없습니다.</span>
        </div>
      </div>
    )}
    {/* 추가 모드는 강조 테두리로 새 룰셋 생성과 구분한다 (위 배너와 색을 맞춤) */}
    <div className={'card' + (target ? ' cp-add' : '')}>
      <div className="card-h">
        <div>
          <h2>{target ? `📎 내규 업로드 → ${targetName}` : '새 룰셋 생성'}</h2>
          <div className="sub">{target
            ? '내규·약관·사내 법령을 여러 개 올리면 모두 분석해 룰을 뽑아 이 룰셋에 더합니다.'
            : '내규·약관·사내 법령을 여러 개 올리면 전부 분석해 도메인을 판별하고, 인용한 법령을 국가법령정보센터에서 검색·수집해 붙여 룰셋을 만듭니다.'}</div>
        </div>
      </div>
      <div className="card-b cp-flow">
        {/* 1) 소스 선택 */}
        <div className="seg eq cp-tabs">
          <button className={src === 'file' ? 'on' : ''} onClick={() => { setSrc('file'); setErr(''); }}>📄 파일 업로드</button>
          <button className={src === 'text' ? 'on' : ''} onClick={() => { setSrc('text'); setErr(''); }}>✎ 직접 입력</button>
        </div>

        {/* 2) 입력 — 파일 드롭(히어로) 또는 직접 입력 */}
        {src === 'file' ? (
          <div className={'cp-drop' + (drag ? ' drag' : '') + (files.length ? ' has' : '')}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}>
            {files.length === 0 ? (
              <div className="cp-drop-empty">
                <div className="cp-drop-ic">⬆</div>
                <div className="cp-drop-t">파일을 여기로 끌어다 놓으세요</div>
                <div className="cp-drop-s">내규 · 약관 · 사내 법령 등 여러 개 업로드 가능</div>
                <label className="fbtn">📄 파일 선택
                  <input type="file" hidden multiple accept={ACCEPT_ATTR} onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
                </label>
                <div className="cp-exts"><span>지원 형식</span>{ACCEPT_EXTS.map((x) => <em key={x}>{x.toUpperCase()}</em>)}</div>
              </div>
            ) : (
              <div className="cp-files">
                <div className="cp-files-h">
                  <b>선택한 파일 {files.length}개</b>
                  <label className="btn xs ghost">＋ 파일 추가
                    <input type="file" hidden multiple accept={ACCEPT_ATTR} onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
                  </label>
                </div>
                {files.map((f, i) => (
                  <div className="fileitem" key={f.name + f.size}>
                    <span className="fn" title={f.name}>📄 {f.name}</span>
                    <span className="fsz">{(f.size / 1024).toFixed(0)}KB</span>
                    <button className="x" onClick={() => removeFile(i)} title="제거" aria-label="파일 제거">×</button>
                  </div>
                ))}
                <div className="cp-exts"><span>지원 형식</span>{ACCEPT_EXTS.map((x) => <em key={x}>{x.toUpperCase()}</em>)}</div>
              </div>
            )}
          </div>
        ) : (
          <div>
            <textarea className="fld cp-body" value={text} onChange={(e) => setText(e.target.value)}
              placeholder={'제1조 상담 시작 시 고객을 일반금융소비자·전문투자자로 구분하여 확인한다.\n제2조 투자권유 전 투자자정보를 파악하여 투자성향을 산출한다.\n제3조 상품 권유 시 원금손실 가능성을 반드시 고지한다.'} />
            <div className="cp-count">{text.trim() ? `${text.trim().split('\n').filter((l) => l.trim()).length}줄 · ${text.length}자` : ''}</div>
          </div>
        )}

        {/* 3) 메타 — 문서명 · AI 보충 설명 */}
        <div className="cp-meta-grid">
          {(src === 'text' || !target) && (
            <div className="cp-field">
              <label className="flabel">문서명
                <span className="lblhint">{src === 'file'
                  ? (files.length > 1 ? '· 여러 파일이라 직접 입력' : files.length === 1 ? '· 파일명 자동 (수정 가능)' : '(선택)')
                  : '(선택)'}</span>
              </label>
              {src === 'file'
                ? <input className="fld" value={prodName} onChange={(e) => { setProdName(e.target.value); setProdTouched(true); }}
                    placeholder={files.length > 1 ? '여러 파일 묶음의 이름을 입력하세요' : '예: 완전판매 체크리스트'} />
                : <input className="fld" value={docName} onChange={(e) => setDocName(e.target.value)} placeholder="예: 완전판매 체크리스트" />}
            </div>
          )}
          <div className="cp-field">
            <label className="flabel">AI 보충 설명 <span className="lblhint">(선택)</span></label>
            <textarea className="fld hint" value={hint} onChange={(e) => setHint(e.target.value)}
              placeholder={'예) 대면 판매만 함 · "핵심설명서"=상품설명서 · 고령자 만 65세 이상'} />
          </div>
        </div>

        {err && <div className="warn" style={{ background: 'var(--fail-bg)', borderColor: 'var(--fail-line)', color: 'var(--fail)' }}>⚠ {err}</div>}
        {note && <div className="warn" style={{ background: 'var(--pass-bg)', borderColor: 'var(--pass-line)', color: 'var(--pass)' }}>⚖ {note}</div>}

        {/* 4) 실행 */}
        <button className="btn primary cp-run" disabled={busy || !ready} onClick={run}>
          {busy ? '분석 중…' : target ? '⚙ 분석 → 이 룰셋에 추가' : '⚙ AI 분석 → 룰셋 생성'}
        </button>
      </div>
    </div>
    </>
  );
}

/* ───────── 룰 작업면 (전체폭) ───────── */
const FILTERS = [
  { k: 'all', label: '전체' },
  { k: 'draft', label: '검토중' },
  { k: 'approved', label: '승인' },
];

function RuleWorkbench({ rs, onChange, onAdd }) {
  const { canWrite } = useAuth();
  const [open, setOpen] = useState(null);
  const [f, setF] = useState('all');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(() => new Set());
  const [page, setPage] = useState(1);
  const [rpp, setRpp] = useState(20);

  useEffect(() => { setSel(new Set()); setOpen(null); setPage(1); }, [rs.id]);
  useEffect(() => { setPage(1); }, [f, q, rpp]);   // 조건이 바뀌면 1페이지로

  const approved = rs.rules.filter((r) => r.status === 'approved').length;
  const published = rs.status === 'published';

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return rs.rules.filter((r) => {
      if (f === 'draft' && r.status === 'approved') return false;
      if (f === 'approved' && r.status !== 'approved') return false;
      if (!kw) return true;
      return `${r.title} ${r.tag} ${r.internal_source || ''}`.toLowerCase().includes(kw);
    });
  }, [rs.rules, f, q]);

  const patch = async (rid, body) => { await api.patchRule(rid, body); onChange(); };
  async function bulk(body) {
    await Promise.all([...sel].map((id) => api.patchRule(id, body)));
    setSel(new Set()); onChange();
  }
  async function bulkDel() {
    if (!confirm(`${sel.size}개 룰을 삭제할까요?`)) return;
    await Promise.all([...sel].map((id) => api.deleteRule(id)));
    setSel(new Set()); onChange();
  }
  async function publish() { const r = await api.publish(rs.id); if (r.error) alert(r.message); else onChange(); }
  async function delRule(rid) { if (confirm('이 룰을 삭제할까요?')) { await api.deleteRule(rid); onChange(); } }

  // 페이지 슬라이스 — 룰이 수십 건이면 한 화면에 다 뿌리면 스크롤이 감당이 안 된다
  const pages = Math.max(1, Math.ceil(list.length / rpp));
  const cur = Math.min(page, pages);
  const view = list.slice((cur - 1) * rpp, cur * rpp);

  // 전체선택은 '현재 페이지' 기준. 선택 자체는 페이지를 넘겨도 유지된다.
  const allChecked = view.length > 0 && view.every((r) => sel.has(r.id));
  const toggleAll = () => setSel((p) => {
    const n = new Set(p);
    view.forEach((r) => allChecked ? n.delete(r.id) : n.add(r.id));
    return n;
  });
  const count = (k) => k === 'all' ? rs.rules.length
    : k === 'approved' ? approved : rs.rules.length - approved;

  return (
    <div className="card">
      <div className="card-h">
        <div>
          <h2>{ICON[rs.domain] || '📄'} {rs.name}</h2>
          <div className="sub">승인 {approved} / {rs.rules.length} · 승인된 룰만 게시본에 포함됩니다</div>
        </div>
        <span className="spacer" />
        {canWrite ? <>
          <button className="btn sm" onClick={onAdd}>＋ 내규 추가</button>
          <button className="btn sm" onClick={() => bulkAll()} disabled={approved === rs.rules.length}>전체 승인</button>
          <button className="btn sm pass" onClick={publish}>{published ? '재게시 (버전↑)' : '게시'}</button>
        </> : <span className="pill" style={{ background: 'var(--field)', color: 'var(--muted)' }}>👁 보기 전용</span>}
      </div>

      <ProposalsPanel rs={rs} onChange={onChange} />
      <TrustPanel rs={rs} />

      <div className="rl-tools">
        <div className="seg">
          {FILTERS.map((x) => (
            <button key={x.k} className={f === x.k ? 'on' : ''} onClick={() => setF(x.k)}>{x.label} {count(x.k)}</button>
          ))}
        </div>
        <div className="srchbox">
          <span className="ic">🔍</span>
          <input placeholder="제목 · 태그 · 내규 원문 검색" value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQ('')} />
          {q && <button className="x" onClick={() => setQ('')} title="검색어 지우기">×</button>}
        </div>
        <span className="spacer" />
        <span className="hit">
          {q ? <><b>{list.length}</b>건 검색됨</> : <>{list.length}건</>}
        </span>
      </div>

      {canWrite && sel.size > 0 && (
        <div className="rl-bulk">
          {sel.size}개 선택
          <span className="spacer" />
          <button className="btn sm" onClick={() => bulk({ status: 'approved' })}>✓ 승인</button>
          <button className="btn sm ghost" onClick={() => bulk({ status: 'draft' })}>↩ 검토중</button>
          <button className="btn sm ghost" onClick={bulkDel}>🗑 삭제</button>
          <button className="btn sm ghost" onClick={() => setSel(new Set())}>선택 해제</button>
        </div>
      )}

      <div className="card-b" style={{ padding: 0 }}>
        {list.length === 0
          ? <div className="card-b muted">{rs.rules.length === 0 ? '룰이 없습니다.' : '조건에 맞는 룰이 없습니다.'}</div>
          : <table className="tbl rows rl">
              <thead><tr>
                {canWrite && <th className="ck"><input type="checkbox" checked={allChecked} onChange={toggleAll} /></th>}
                <th style={{ width: 40 }}>#</th>
                <th>제목 · 내규 출처</th>
                <th style={{ width: 84 }}>심각도</th>
                <th style={{ width: 88 }}>상태</th>
                <th className="acts" />
              </tr></thead>
              <tbody>
                {view.map((r, i) => (
                  <RuleRow key={r.id} r={r} i={(cur - 1) * rpp + i} open={open === r.id} canWrite={canWrite}
                    checked={sel.has(r.id)}
                    onCheck={() => setSel((p) => { const n = new Set(p); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })}
                    onToggle={() => setOpen(open === r.id ? null : r.id)}
                    onPatch={(b) => patch(r.id, b)} onDel={() => delRule(r.id)} />
                ))}
              </tbody>
            </table>}
      </div>

      {list.length > 0 && (
        <div className="tfoot">
          <span className="info">
            총 {list.length}건 중 <b>{(cur - 1) * rpp + 1}–{Math.min(cur * rpp, list.length)}</b> 표시
            {sel.size > 0 && <> · 선택 {sel.size}</>}
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
              {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  );

  async function bulkAll() { await api.approveAll(rs.id); onChange(); }
}

/* ───────── AI 스키마 제안 (AutoSchemaKG 방법론 · 저작 보조 · 제안까지만) ───────── */
function ProposalsPanel({ rs, onChange }) {
  const [data, setData] = useState(null);
  const [openP, setOpenP] = useState(false);
  const [busy, setBusy] = useState('');

  const load = () => api.proposals(rs.id).then(setData).catch(() => setData({ proposals: [] }));
  useEffect(() => { load(); }, [rs.id, rs.rules.length]);

  const props = data?.proposals || [];
  async function accept(p) {
    setBusy(p.tag);
    const r = await api.acceptProposal(rs.id, { tag: p.tag, chunk_id: p.evidence_chunk_id });
    setBusy('');
    if (r.error) { alert(r.message); return; }
    await load(); onChange(); // 새 draft 룰이 테이블에 나타남
  }
  async function dismiss(p) { setBusy(p.tag); await api.dismissProposal(rs.id, { tag: p.tag }); setBusy(''); load(); }

  // 제안이 없으면 패널 자체를 감춘다 — 빈 배너는 룰 작업면만 밀어낸다.
  if (!data || props.length === 0) return null;
  return (
    <div className="propbox">
      <div className="prophead" onClick={() => setOpenP((v) => !v)}>
        <span className="ptitle">💡 AI 스키마 제안</span>
        <span className="pcount">{props.length}</span>
        <span className="pdesc">내규를 자유 스캔해 <b>룰이 없는 개념</b>을 찾았습니다 — 채택하면 초안 룰로 추가됩니다.</span>
        <span className="spacer" />
        <span className="pcar">{openP ? '▴' : '▾'}</span>
      </div>
      {openP && (
        <div className="plist">
            {props.map((p) => (
              <div className="pitem" key={p.tag}>
                <div className="pmain">
                  <div className="prow1">
                    <span className="chip mono">{p.tag}</span>
                    <span className="pconcept">{p.concept}</span>
                    <b>{p.title}</b>
                    <span className={'sev ' + p.severity}>{p.severity}</span>
                  </div>
                  <div className="prat">{p.rationale}</div>
                  <div className="pev">📄 {p.evidence_text}</div>
                  {p.law_basis && <div className="plaw">⚖ {p.law_basis}</div>}
                </div>
                <div className="pacts">
                  <button className="btn sm primary" disabled={busy === p.tag} onClick={() => accept(p)}>{busy === p.tag ? '…' : '＋ 룰로 채택'}</button>
                  <button className="btn sm ghost" disabled={busy === p.tag} onClick={() => dismiss(p)}>무시</button>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

/* ───────── 근거 신뢰도 · 근거 경로 (TrustGraph 개념 채택 · 저작/감사 층) ───────── */
const GRADE = { strong: { t: '강', c: 'g-strong' }, medium: { t: '보통', c: 'g-medium' }, weak: { t: '약', c: 'g-weak' } };

function TrustPanel({ rs }) {
  const [data, setData] = useState(null);
  const [openT, setOpenT] = useState(false);
  const [path, setPath] = useState(null);   // { ruleId, loading, data }

  const load = () => api.trust(rs.id).then(setData).catch(() => setData(null));
  // 승인·법령편집은 룰 개수·버전을 바꾸지 않는다 — 부모가 rs를 재조회할 때마다(=새 객체)
  // 신뢰도를 다시 계산해야 '사람 승인' 등이 실시간 반영된다. 근거 경로는 룰셋이 바뀔 때만 닫는다.
  useEffect(() => { load(); }, [rs]);
  useEffect(() => { setPath(null); }, [rs.id]);

  if (!data || !data.coverage.total) return null;
  const c = data.coverage;
  const weak = data.rules.filter((r) => r.grade !== 'strong');

  async function showPath(rid) {
    if (path?.ruleId === rid) { setPath(null); return; }
    setPath({ ruleId: rid, loading: true });
    const t = await api.trustPath(rid).catch(() => null);
    setPath({ ruleId: rid, data: t });
  }

  return (
    <div className="trustbox">
      {/* 제목·요약 줄과 지표 줄을 분리한다 — 한 줄에 몰면 1150px 아래에서 지표가
          접히면서 펼침 화살표까지 아랫줄로 끌려 내려간다. */}
      <div className="trusthead" onClick={() => setOpenT((v) => !v)}>
        <span className="ttitle">🛡 근거 신뢰도</span>
        <span className="tgrade">
          <em className="g-strong">강 {c.strong}</em>
          <em className="g-medium">보통 {c.medium ?? 0}</em>
          <em className="g-weak">약 {c.weak}</em>
        </span>
        <span className="tsum">룰 {c.total}건 중 보완 필요 <b>{weak.length}</b>건</span>
        <span className="spacer" />
        <span className="pcar">{openT ? '▴' : '▾'}</span>
      </div>

      {/* 법령은 '근거 유무'(has_law)로 등급을 매기므로 지표도 같은 기준을 쓴다.
          실제 수집 조문 연결(law_linked)은 더 강한 근거라 보조 수치로 덧붙인다. */}
      <div className="tbars">
        <Metric label="내규 근거" n={c.has_chunk} total={c.total} />
        <Metric label="법령 근거" n={c.has_law} total={c.total}
          note={c.law_linked < c.has_law ? `조문 연결 ${c.law_linked}건` : null} />
        <Metric label="사람 승인" n={c.approved} total={c.total} />
        <Metric label="게시" n={c.published} total={c.total} />
      </div>

      {openT && (
        <div className="tlist">
          {weak.length === 0
            ? <div className="tnote ok">모든 룰이 내규·법령·승인 근거를 갖추었습니다. ✓</div>
            : <div className="tnote">근거가 완전하지 않은 룰 {weak.length}건 — 행을 눌러 어디가 비었는지 확인하세요.</div>}
          {weak.map((r) => (
            <div className="trow" key={r.id}>
              <div className="tmain" onClick={() => showPath(r.id)}>
                <span className={'tdot ' + GRADE[r.grade].c} />
                <span className="chip mono">{r.tag}</span>
                <b>{r.title}</b>
                <span className="tflags">
                  {!r.has_chunk && <em className="miss">내규없음</em>}
                  {!r.has_law && <em className="miss">법령근거없음</em>}
                  {r.has_law && !r.law_linked && <em className="caution">조문미연결</em>}
                  {!r.approved && <em className="miss">미승인</em>}
                  {!r.published && <em className="caution">미게시</em>}
                </span>
                <span className="spacer" />
                <span className="tlink">{path?.ruleId === r.id ? '경로 닫기' : '근거 경로'}</span>
              </div>
              {path?.ruleId === r.id && (
                <div className="tpath">
                  {path.loading && <div className="tnote">불러오는 중…</div>}
                  {path.data && <TrustSteps steps={path.data.steps} />}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, n, total, note }) {
  const v = total ? Math.round((n / total) * 100) : 0;
  const c = v >= 80 ? 'g-strong' : v >= 40 ? 'g-medium' : 'g-weak';
  return (
    <div className="metric">
      <div className="mtop">
        <span className="mlabel">{label}</span>
        <span className="mval">{v}%</span>
      </div>
      <span className="mbar"><i className={c} style={{ width: v + '%' }} /></span>
      <div className="msub">{n}/{total}{note ? ` · ${note}` : ''}</div>
    </div>
  );
}

// 상태 클래스는 s- 접두사를 쓴다 — 전역 .warn 이 박스(패딩·테두리·여백) 스타일이라
// 그대로 쓰면 타임라인 행이 통째로 박스가 되면서 연결선이 끊긴다.
function TrustSteps({ steps }) {
  return (
    <ol className="tsteps">
      {steps.map((s, i) => (
        <li key={i} className={s.ok ? (s.warn ? 's-warn' : 's-ok') : 's-bad'}>
          <span className="sicon">{s.ok ? (s.warn ? '△' : '●') : '✕'}</span>
          <span className="slabel">{s.label}</span>
          <span className="sdetail">{s.detail}</span>
        </li>
      ))}
    </ol>
  );
}

// 행위태그(JSON 문자열 or 배열) → 작은 칩. ST 매칭의 required_action_tags 와 동일 값.
const ACTION_LABEL = {
  EXPLAIN: '설명', NOTIFY: '고지', PROVIDE: '교부', CONFIRM: '확인', RECOMMEND: '권유',
  COMPARE: '비교', CLASSIFY: '구분', RECORD: '녹취', RESTRICT: '금지', CONSENT: '동의',
};
function ActionTags({ v, empty }) {
  let list = v;
  if (typeof v === 'string') { try { list = JSON.parse(v); } catch { list = []; } }
  if (!Array.isArray(list) || list.length === 0) return empty ? <span className="muted" style={{ fontSize: 11.5 }}>{empty}</span> : null;
  return (
    <span className="atags">
      {list.map((t) => <span key={t} className="atag" title={t}>{ACTION_LABEL[t] || t}</span>)}
    </span>
  );
}

function RuleRow({ r, i, open, checked, onCheck, onToggle, onPatch, onDel, canWrite }) {
  const [title, setTitle] = useState(r.title);
  // 판단근거 본문과 추가 의미태그를 분리 — textarea 에는 본문만, 태그는 칩으로.
  // 서버가 meaning_extra 로 태그를 내려주고, 저장 시 운반 라인도 서버가 보존한다.
  const { body, tags: parsed } = useMemo(() => splitMeaning(r.knowledge), [r.knowledge]);
  const extraTags = r.meaning_extra ?? parsed;
  const [know, setKnow] = useState(body);
  useEffect(() => { setTitle(r.title); setKnow(body); }, [r.id, r.title, body]);

  // 본문만 저장한다 — 추가 의미태그 운반 라인은 서버(PATCH)가 다시 붙인다.
  const saveKnow = () => { if (know !== body) onPatch({ knowledge: know }); };

  const stop = (e) => e.stopPropagation();
  return (
    <>
      {/* 행 전체를 클릭하면 상세가 열린다 — 편집 버튼은 없앴다. 체크박스·승인은 전파를 막는다. */}
      <tr className={'rl-row' + (open ? ' openrow' : '') + (checked ? ' on' : '')} onClick={onToggle}>
        {canWrite && <td className="ck" onClick={stop}><input type="checkbox" checked={checked} onChange={onCheck} /></td>}
        <td className="mono muted">{String(i + 1).padStart(2, '0')}</td>
        <td className="ttl">
          {r.title}
          {r.internal_source && <div className="src">📄 {r.internal_source}</div>}
        </td>
        <td><span className={'sev ' + r.severity}>{r.severity}</span></td>
        <td><span className={'badge ' + (r.status === 'approved' ? 'published' : 'draft')}><i />{r.status === 'approved' ? '승인' : '검토중'}</span></td>
        <td className="acts">
          <div className="rl-acts">
            {canWrite && (r.status === 'approved'
              ? <button className="btn sm ghost undo" title="검토중으로 되돌립니다"
                  onClick={(e) => { stop(e); onPatch({ status: 'draft' }); }}>승인 취소</button>
              : <button className="btn sm ok" title="승인하면 게시본에 포함됩니다"
                  onClick={(e) => { stop(e); onPatch({ status: 'approved' }); }}>✓ 승인</button>)}
            <span className={'rl-caret' + (open ? ' on' : '')} aria-hidden="true">▸</span>
          </div>
        </td>
      </tr>

      {open && (
        <tr className="editrow"><td colSpan={canWrite ? 6 : 5}>
          <div className="rl-edit" onClick={stop}>
            {/* 상단: 정체성(제목·심각도·상태) + 삭제 */}
            <div className="rle-head">
              <div className="rle-f rle-title">
                <label className="flabel">제목</label>
                <input className="fld" value={title} readOnly={!canWrite} onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => canWrite && title !== r.title && onPatch({ title })} />
              </div>
              <div className="rle-f">
                <label className="flabel">심각도</label>
                <select className="fld" value={r.severity} disabled={!canWrite} onChange={(e) => onPatch({ severity: e.target.value })}>
                  {['HIGH', 'MEDIUM', 'LOW'].map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="rle-f">
                <label className="flabel">상태</label>
                <div className="rle-status"><span className={'badge ' + (r.status === 'approved' ? 'published' : 'draft')}><i />{r.status === 'approved' ? '승인' : '검토중'}</span></div>
              </div>
              {canWrite && <button className="rle-del" onClick={onDel} title="이 룰 삭제">🗑 삭제</button>}
            </div>

            {/* 본문: 좌 참조정보 · 우 판단근거(주 편집 대상) */}
            <div className="rle-body">
              <div className="rle-side">
                <div className="rle-f">
                  <label className="flabel">🏷 의미태그</label>
                  <div className="atrow">
                    <span className="chip mono">{r.tag}</span>
                    {extraTags.map((t) => <span key={t} className="chip mono mtag" title="추가 의미태그 — required_meaning_tags 로 서빙">{t}</span>)}
                  </div>
                </div>
                <div className="rle-f">
                  <label className="flabel">🏷 행위태그</label>
                  <div className="atrow"><ActionTags v={r.action_tags} empty="(없음)" /></div>
                </div>
                <div className="rle-f">
                  <label className="flabel">⚖ 법령 근거</label>
                  <div className="lawline">{r.law_basis || '(매핑 없음)'}</div>
                </div>
                <div className="rle-f">
                  <label className="flabel">🔎 내규↔법령 대조</label>
                  <div className={'cmpbox' + (String(r.law_compare || '').startsWith('⚠') ? ' cmp-warn' : (r.law_compare ? ' ok' : ''))}>{r.law_compare || '—'}</div>
                </div>
                <div className="rle-f">
                  <label className="flabel">📄 내규 출처</label>
                  <div className="srcbox">{r.internal_source || '—'}</div>
                </div>
              </div>

              <div className="rle-main">
                <label className="flabel">판단근거 (knowledge) — 정의 · 근거 · 준수 · 위반 · 예시</label>
                <textarea className="fld mono" style={{ fontSize: 12, lineHeight: 1.65 }}
                  value={know} readOnly={!canWrite} onChange={(e) => setKnow(e.target.value)}
                  onBlur={() => canWrite && saveKnow()} />
              </div>
            </div>
          </div>
        </td></tr>
      )}
    </>
  );
}
