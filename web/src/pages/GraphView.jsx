import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import OntologyGraph from './OntologyGraph.jsx';

// 근거 추적 (요구사항 B / AutoSchemaKG 방법론)
//  · 근거 추적  : 문서 → 청크 → 룰 → 개념/법령 (provenance) 을 룰 한 행으로 편다
//  · 유도 스키마: 트리플 추출 + 개념화로 유도한 스키마 (주체—의무→개념 등)
//
// 노드-링크 SVG 였으나 라벨이 전부 잘려 읽을 수 없었고, 룰이 늘면 세로로 무한정
// 길어졌다. 추적의 목적은 "이 룰이 어디서 왔나"를 읽는 것이므로 표가 맞다.
const SEV = { HIGH: 'var(--fail)', MEDIUM: 'var(--amber)', LOW: 'var(--muted)' };

export default function GraphView() {
  const { id } = useParams();
  const [mode, setMode] = useState('kg');
  const [g, setG] = useState(null);
  useEffect(() => { api.graph(id).then(setG).catch(() => setG(null)); }, [id]);

  // 통계는 문서 → 조항 → 룰 → 개념 → 법령 순. 화면이 다루는 사슬 자체라
  // 순서를 바꾸지 않는다. 큰 상자 5개는 자리만 먹어 한 줄로 눕혔다.
  const chain = [['documents', '문서'], ['chunks', '조항'], ['rules', '룰'],
    ['concepts', '개념'], ['laws', '법령']];

  return (
    <div className="kgv">
      {/* 카드 하나로 합친다 — 헤더가 둘이면 제목·룰셋명이 두 번 나오고 세로만 먹는다 */}
      <div className="card">
        <div className="kgv-head">
          <div className="t">
            <h2>◈ 온톨로지</h2>
            {g?.ruleset?.name && <span className="rs">{g.ruleset.name}</span>}
          </div>
          {g?.stats && (
            <div className="kgv-chain">
              {chain.map(([k, label], i) => (
                <span key={k} className="s">
                  {i > 0 && <em className="arw">›</em>}
                  <b>{g.stats[k] ?? 0}</b>{label}
                </span>
              ))}
            </div>
          )}
          <span className="spacer" />
          <Link className="btn sm ghost" to="/">← 룰 편집</Link>
        </div>

        <div className="kgv-tabs">
          <div className="dict-tabs">
            <button className={mode === 'kg' ? 'on' : ''} onClick={() => setMode('kg')}>온톨로지 그래프</button>
            <button className={mode === 'prov' ? 'on' : ''} onClick={() => setMode('prov')}>근거 추적 표</button>
          </div>
        </div>

        {mode === 'prov' ? <EvidenceTable id={id} g={g} /> : <SchemaView id={id} />}
      </div>
    </div>
  );
}

/* ───────── 근거 추적 표 ───────── */
// 그래프 엣지를 룰 기준으로 한 번에 뒤집어 둔다 — 행마다 API를 부르지 않는다.
function buildRows(g) {
  if (!g?.nodes) return [];
  const byId = Object.fromEntries(g.nodes.map((n) => [n.id, n]));
  const chunkOfRule = {}, docOfChunk = {}, conceptsOfRule = {}, lawsOfRule = {};
  for (const e of g.edges) {
    if (e.type === 'DERIVES') chunkOfRule[e.to] = byId[e.from];
    else if (e.type === 'HAS_CHUNK') docOfChunk[e.to] = byId[e.from];
    else if (e.type === 'ABOUT') (conceptsOfRule[e.from] ||= []).push(byId[e.to]);
    // 방향이 rule→law 든 law→rule 든 룰 쪽에 모은다
    else if (e.type === 'GROUNDED_IN') {
      const rid = byId[e.from]?.type === 'rule' ? e.from : e.to;
      const law = byId[e.from]?.type === 'law' ? byId[e.from] : byId[e.to];
      if (law) (lawsOfRule[rid] ||= []).push(law);
    }
  }
  return g.nodes.filter((n) => n.type === 'rule').map((r) => {
    const chunk = chunkOfRule[r.id] || null;
    return {
      ...r,
      chunk,
      doc: chunk ? docOfChunk[chunk.id] || null : null,
      concepts: conceptsOfRule[r.id] || [],
      laws: lawsOfRule[r.id] || [],
    };
  });
}

function EvidenceTable({ id, g }) {
  const [q, setQ] = useState('');
  const [docId, setDocId] = useState('');
  const [gap, setGap] = useState('all');     // all | nolaw | nochunk
  const [open, setOpen] = useState(null);
  const [prov, setProv] = useState(null);    // { ruleId, loading, data }
  const [page, setPage] = useState(1);
  const [rpp, setRpp] = useState(20);

  const rows = useMemo(() => buildRows(g), [g]);
  const docs = useMemo(() => {
    const m = new Map();
    (g?.nodes || []).filter((n) => n.type === 'document').forEach((d) => m.set(d.id, d.label));
    return [...m.entries()];
  }, [g]);

  useEffect(() => { setPage(1); }, [q, docId, gap, rpp]);

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (docId && r.doc?.id !== docId) return false;
      if (gap === 'nolaw' && r.laws.length) return false;
      if (gap === 'nochunk' && r.chunk) return false;
      if (!kw) return true;
      const hay = [r.label, r.tag, r.chunk?.text, r.doc?.label,
        ...r.concepts.map((c) => c.label), ...r.laws.map((l) => `${l.label} ${l.article_title || ''}`)].join(' ').toLowerCase();
      return hay.includes(kw);
    });
  }, [rows, q, docId, gap]);

  const pages = Math.max(1, Math.ceil(list.length / rpp));
  const cur = Math.min(page, pages);
  const view = list.slice((cur - 1) * rpp, cur * rpp);

  const noLaw = rows.filter((r) => !r.laws.length).length;
  const noChunk = rows.filter((r) => !r.chunk).length;

  function toggle(r) {
    if (open === r.id) { setOpen(null); setProv(null); return; }
    setOpen(r.id); setProv({ ruleId: r.rule_id, loading: true });
    api.provenance(r.rule_id)
      .then((d) => setProv({ ruleId: r.rule_id, data: d }))
      .catch(() => setProv({ ruleId: r.rule_id, data: null }));
  }

  if (!g) return <div className="card-b muted">불러오는 중…</div>;
  if (!rows.length) return <div className="tg-none">룰이 없습니다. 먼저 내규로 룰셋을 만드세요.</div>;

  return (
    <>
      <div className="tg-tools">
        <div className="seg sm">
          <button className={gap === 'all' ? 'on' : ''} onClick={() => setGap('all')}>전체 {rows.length}</button>
          <button className={gap === 'nolaw' ? 'on' : ''} onClick={() => setGap('nolaw')}>법령 미연결 {noLaw}</button>
          <button className={gap === 'nochunk' ? 'on' : ''} onClick={() => setGap('nochunk')}>내규 없음 {noChunk}</button>
        </div>
        {docs.length > 1 && (
          <select className="fld" style={{ width: 'auto', maxWidth: 250, height: 34, padding: '0 10px', fontSize: 12.5 }}
            value={docId} onChange={(e) => setDocId(e.target.value)}>
            <option value="">전체 문서</option>
            {docs.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
        )}
        <div className="srchbox" style={{ minWidth: 200, maxWidth: 300, height: 34 }}>
          <span className="ic">🔍</span>
          <input placeholder="룰 · 조항 · 개념 · 법령 검색" value={q}
            onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQ('')} />
          {q && <button className="x" onClick={() => setQ('')}>×</button>}
        </div>
      </div>

      <table className="tbl rows kgv-tbl">
        <thead><tr>
          <th>룰</th>
          <th className="c-chunk">조항(청크)</th>
          <th className="c-cpt">개념태그</th>
          <th className="c-law">법령 조문</th>
          <th className="c-ev">근거</th>
        </tr></thead>
        <tbody>
          {view.map((r) => (
            <Row key={r.id} r={r} id={id} open={open === r.id} prov={prov} onToggle={() => toggle(r)} />
          ))}
          {view.length === 0 && (
            <tr><td colSpan="5"><div className="tg-none">조건에 맞는 룰이 없습니다.</div></td></tr>
          )}
        </tbody>
      </table>

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
              {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
      )}
    </>
  );
}

function Row({ r, id, open, prov, onToggle }) {
  const steps = [['내규', !!r.chunk], ['개념', r.concepts.length > 0], ['법령', r.laws.length > 0]];
  const done = steps.filter(([, ok]) => ok).length;
  const p = open && prov?.ruleId === r.rule_id ? prov : null;

  return (
    <>
      <tr className={open ? 'openrow' : ''}>
        <td className="c-rule">
          {/* 제목이 두 줄이 되어도 캐럿 아래로 흘러내리지 않도록 flex 로 묶는다 */}
          <div className="kgv-rule">
            <button className={'tg-exp' + (open ? ' on' : '')} onClick={onToggle} title="근거 경로 펼치기">▸</button>
            <span className="sevdot" style={{ background: SEV[r.severity] || SEV.LOW }} title={`중요도 ${r.severity}`} />
            <span className="kgv-title" onClick={onToggle}>{r.label}</span>
          </div>
        </td>
        <td className="c-chunk">
          {r.chunk
            ? <span className="kgv-cell" title={r.chunk.text}>{r.chunk.text || r.chunk.label}</span>
            : <span className="miss-cell">내규 근거 없음</span>}
        </td>
        <td className="c-cpt">
          {r.concepts.length
            ? r.concepts.map((c) => <span key={c.id} className="chip mono kgv-cpt" title={c.label}>{c.label}</span>)
            : <span className="miss-cell">—</span>}
        </td>
        <td className="c-law">
          {r.laws.length
            ? r.laws.map((l) => (
                <div key={l.id} className="kgv-law" title={`${l.label} ${l.article_title || ''}`}>
                  <b>{l.label}</b>{l.article_title && <span> · {l.article_title}</span>}
                </div>
              ))
            : <span className="miss-cell">미연결</span>}
        </td>
        <td className="c-ev">
          <span className="evdots" title={steps.map(([n, ok]) => `${n} ${ok ? '✓' : '✕'}`).join(' · ')}>
            {steps.map(([n, ok]) => <i key={n} className={ok ? 'on' : ''} />)}
          </span>
          <span className={'evn' + (done === 3 ? ' full' : done === 1 ? ' low' : '')}>{done}/3</span>
        </td>
      </tr>
      {open && (
        <tr className="subrow"><td colSpan="5">
          <div className="kgv-path">
            {p?.loading && <div className="muted" style={{ fontSize: 12 }}>근거 경로 불러오는 중…</div>}
            {p?.data && <PathSteps d={p.data} id={id} />}
            {p && !p.loading && !p.data && <div className="muted" style={{ fontSize: 12 }}>근거를 불러오지 못했습니다.</div>}
          </div>
        </td></tr>
      )}
    </>
  );
}

// 문서 → 조항 → 룰 → 개념 → 법령 순서를 그대로 세로로 편다
function PathSteps({ d, id }) {
  const S = ({ ic, label, ok, children }) => (
    <div className={'kgv-step' + (ok ? '' : ' off')}>
      <span className="ic">{ic}</span>
      <span className="lb">{label}</span>
      <div className="bd">{children}</div>
    </div>
  );
  return (
    <>
      <S ic="📄" label="내규 문서" ok={!!d.document}>{d.document?.name || '(연결된 문서 없음)'}</S>
      <S ic="✂" label="조항(청크)" ok={!!d.chunk}>{d.chunk?.text || '(근거 청크 없음)'}</S>
      <S ic="📝" label="내규 원문" ok={!!d.internal_source}>{d.internal_source || '(원문 없음)'}</S>
      <S ic="🏷" label="개념태그" ok={!!d.concept}>
        {d.concept ? <span className="chip mono">{d.concept}</span> : '(없음)'}
      </S>
      <S ic="⚖" label="법령 조문" ok={d.laws?.length > 0}>
        {d.laws?.length
          ? d.laws.map((l) => <div key={l.id}><b>{l.law_name} {l.article_no}</b>{l.article_title && <span className="muted"> · {l.article_title}</span>}</div>)
          : '(수집·연결된 조문 없음 — 법령 관리에서 수집하세요)'}
      </S>
      <div style={{ marginTop: 10 }}>
        <Link to="/" className="btn xs ghost">← 이 룰 편집하러 가기</Link>
      </div>
    </>
  );
}

/* ───────── 유도된 스키마 (AutoSchemaKG) ───────── */
function SchemaView({ id }) {
  const [kg, setKg] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => api.kg(id).then(setKg).catch(() => setKg(null));
  useEffect(() => { load(); }, [id]);
  async function rebuild() { setBusy(true); await api.kgBuild(id); await load(); setBusy(false); }

  if (!kg) return <div className="card-b muted">불러오는 중…</div>;

  // 클래스 칩 목록은 클래스 뷰의 노드와 같은 것이라 캔버스 위에 또 늘어놓지 않는다.
  // 툴바도 하나로 합친다 — 두 줄이면 개수(클래스/엔티티)가 위아래로 두 번 나온다.
  return (
    <OntologyGraph
      kg={kg}
      right={
        <>
          <span className="tg-legend">트리플 {kg.stats.triples}</span>
          <button className="btn sm" onClick={rebuild} disabled={busy}>{busy ? '유도 중…' : '↻ 재유도'}</button>
        </>
      }
    />
  );
}
