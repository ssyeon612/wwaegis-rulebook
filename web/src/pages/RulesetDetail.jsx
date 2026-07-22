import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api.js';

export default function RulesetDetail() {
  const { id } = useParams();
  const [rs, setRs] = useState(null);
  const [open, setOpen] = useState({});
  const [tab, setTab] = useState('rules');

  const load = () => api.getRuleset(id).then(setRs);
  useEffect(() => { load(); }, [id]);
  if (!rs) return <div className="muted">로딩 중…</div>;

  const approved = rs.rules.filter((r) => r.status === 'approved').length;
  const published = rs.status === 'published';

  function setRuleField(rid, field, val) {
    setRs((p) => ({ ...p, rules: p.rules.map((r) => r.id === rid ? { ...r, [field]: val } : r) }));
  }
  const saveRule = (rid, field, val) => api.patchRule(rid, { [field]: val });
  async function toggleApprove(r) { await api.patchRule(r.id, { status: r.status === 'approved' ? 'draft' : 'approved' }); load(); }
  async function delRule(r) { if (confirm('이 룰을 삭제할까요?')) { await api.deleteRule(r.id); load(); } }
  async function approveAll() { await api.approveAll(id); load(); }
  async function publish() {
    const res = await api.publish(id);
    if (res.error) alert(res.message); else load();
  }
  const saveMeta = (field, val) => { setRs((p) => ({ ...p, [field]: val })); api.patchRuleset(id, { [field]: val }); };

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="row">
        <Link to="/rulesets" className="btn sm ghost">← 목록</Link>
        <b style={{ fontSize: 16 }}>{rs.name}</b>
        <span className={'pill ' + rs.status}>{published ? '게시됨' : '초안'}</span>
        <span className="chip mono">{rs.domain}</span>
        <span className="muted" style={{ fontSize: 12 }}>엔진: {rs.engine}</span>
        <span className="spacer" />
        <span className="muted" style={{ fontSize: 12 }}>승인 {approved}/{rs.rules.length}</span>
        {!published && <button className="btn sm" onClick={approveAll}>전체 승인</button>}
        <button className="btn sm pass" onClick={publish} disabled={published}>{published ? '게시 완료' : '✓ 게시'}</button>
      </div>

      {published && <div className="detbar"><span className="k">게시됨</span><span className="v mono">{rs.ruleset_id}</span><span className="r">ST·STT가 이 ID로 loadRuleSet 호출</span></div>}
      {!published && <div className="warn">승인된 룰만 게시본에 포함됩니다. 게시 후 RS API로 노출됩니다.</div>}

      <div className="row" style={{ gap: 6 }}>
        <button className={'btn sm ' + (tab === 'rules' ? 'primary' : 'ghost')} onClick={() => setTab('rules')}>룰 편집 ({rs.rules.length})</button>
        <button className={'btn sm ' + (tab === 'meta' ? 'primary' : 'ghost')} onClick={() => setTab('meta')}>게시 설정</button>
        <button className={'btn sm ' + (tab === 'json' ? 'primary' : 'ghost')} onClick={() => setTab('json')}>API JSON</button>
      </div>

      {tab === 'rules' && rs.rules.map((r, i) => (
        <div className={'rule' + (r.status === 'approved' ? ' approved' : '') + (open[r.id] ? ' open' : '')} key={r.id}>
          <div className="rule-top" onClick={() => setOpen((o) => ({ ...o, [r.id]: !o[r.id] }))}>
            <span className="idx mono">{String(i + 1).padStart(2, '0')}</span>
            <input className="ti" value={r.title} onClick={(e) => e.stopPropagation()}
              onChange={(e) => setRuleField(r.id, 'title', e.target.value)} onBlur={(e) => saveRule(r.id, 'title', e.target.value)} />
            <span className="chip mono">{r.tag}</span>
            <span className={'sev ' + r.severity}>{r.severity}</span>
            <span className={'pill ' + r.status}>{r.status === 'approved' ? '승인' : '검토중'}</span>
            <span className="muted" style={{ fontSize: 11 }}>{open[r.id] ? '▴' : '▾'}</span>
          </div>
          <div className="rule-body">
            <div className="prov">
              <div className="internal">
                <div className="plabel">📄 내규 출처 (회사)</div>
                <div className="ptext">{r.internal_source || '—'}</div>
              </div>
              <div className="law">
                <div className="plabel">⚖ 법령 근거 <span className="aibadge">AI 제공</span></div>
                <div className="ptext">{r.law_basis || '(법령 매핑 없음)'}</div>
              </div>
            </div>
            <div className="kwrap">
              <div className="mini">판단근거 (knowledge) — 정의·근거·준수·위반·예시</div>
              <textarea className="know mono" value={r.knowledge}
                onChange={(e) => setRuleField(r.id, 'knowledge', e.target.value)} onBlur={(e) => saveRule(r.id, 'knowledge', e.target.value)} />
            </div>
            <div className="rule-acts">
              <button className="btn sm" onClick={() => toggleApprove(r)}>{r.status === 'approved' ? '↩ 검토중으로' : '✓ 승인'}</button>
              <button className="btn sm ghost" onClick={() => delRule(r)}>🗑 삭제</button>
            </div>
          </div>
        </div>
      ))}

      {tab === 'meta' && (
        <div className="card"><div className="card-b grid" style={{ gap: 14, maxWidth: 460 }}>
          <div><label className="flabel">룰셋 이름</label><input className="fld" value={rs.name} onChange={(e) => saveMeta('name', e.target.value)} /></div>
          <div className="row" style={{ gap: 12 }}>
            <div style={{ flex: 1 }}><label className="flabel">버전</label><input className="fld mono" value={rs.version} onChange={(e) => saveMeta('version', e.target.value)} /></div>
            <div style={{ flex: 1 }}><label className="flabel">차단 임계</label><input className="fld mono" type="number" value={rs.block_threshold} onChange={(e) => saveMeta('block_threshold', +e.target.value)} /></div>
          </div>
          <div><label className="flabel">종합 판정 방식</label>
            <select className="fld mono" value={rs.aggregate_method} onChange={(e) => saveMeta('aggregate_method', e.target.value)}>
              <option>WEIGHTED</option><option>MAJORITY</option><option>UNANIMOUS</option><option>ANY</option>
            </select></div>
        </div></div>
      )}

      {tab === 'json' && <JsonView rs={rs} />}
    </div>
  );
}

function JsonView({ rs }) {
  const [data, setData] = useState(null);
  const [which, setWhich] = useState('load');
  useEffect(() => {
    if (rs.status !== 'published') { setData(null); return; }
    (which === 'load' ? api.rsLoad(rs.ruleset_id) : api.rsList({ category: rs.domain })).then(setData);
  }, [which, rs]);
  if (rs.status !== 'published') return <div className="warn">게시 후 실제 RS API 응답을 미리볼 수 있습니다.</div>;
  return (
    <div className="card"><div className="card-b">
      <div className="row" style={{ marginBottom: 12 }}>
        <button className={'btn sm ' + (which === 'load' ? 'primary' : 'ghost')} onClick={() => setWhich('load')}>loadRuleSet (ST)</button>
        <button className={'btn sm ' + (which === 'list' ? 'primary' : 'ghost')} onClick={() => setWhich('list')}>listRuleSets (ST·STT)</button>
      </div>
      <pre className="json">{data ? JSON.stringify(data, null, 2) : '…'}</pre>
    </div></div>
  );
}
