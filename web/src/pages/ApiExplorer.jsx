import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useWs } from '../lib/ws.js';

// RuleSet 정본 서빙 계약 — 엔드포인트는 둘뿐이다.
// 이 화면은 그 둘의 요청·응답만 보여준다.
const ENDPOINTS = {
  list: {
    label: 'listRuleSets', path: '/api/rs/listRuleSets',
    desc: '게시된 룰셋 목록을 조회합니다. 룰 본문은 포함되지 않습니다.',
    needsRuleset: false,
  },
  load: {
    label: 'loadRuleSet', path: '/api/rs/loadRuleSet',
    desc: '룰셋 본문 전체를 로드합니다. 승인된 룰만 포함됩니다.',
    needsRuleset: true,
  },
};

export default function ApiExplorer() {
  const [ep, setEp] = useState('list');
  const { sel } = useWs();
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);      // { data, ms, bytes, error }

  // loadRuleSet 대상은 이 탭에서 직접 고른다 — 사이드바 전역 선택(sel)과 무관하다.
  // 로드 가능한 건 게시본뿐이므로 listRuleSets 결과(게시 룰셋)로 채운다.
  const [pubList, setPubList] = useState(null);   // [{ id, name, count }] | null(로딩)
  const [loadId, setLoadId] = useState('');

  useEffect(() => {
    api.rsList({})
      .then((d) => setPubList((d?.rulesets || []).map((r) => ({
        id: r.meta.ruleset_id, name: r.meta.ruleset_name, count: r.rule_count,
      }))))
      .catch(() => setPubList([]));
  }, []);

  // 기본 선택: 현재 선택값 유지 → 사이드바 룰셋이 게시본이면 그걸 → 아니면 첫 게시본.
  useEffect(() => {
    if (!pubList) return;
    setLoadId((cur) => {
      if (cur && pubList.some((r) => r.id === cur)) return cur;
      if (sel?.ruleset_id && pubList.some((r) => r.id === sel.ruleset_id)) return sel.ruleset_id;
      return pubList[0]?.id || '';
    });
  }, [pubList, sel]);

  const cfg = ENDPOINTS[ep];
  const body = useMemo(() => (ep === 'list' ? {} : { ruleset_id: loadId || '' }), [ep, loadId]);

  const blocked = cfg.needsRuleset && !loadId;

  async function run() {
    setBusy(true); setRes(null);
    const t0 = performance.now();
    try {
      const data = await (ep === 'list' ? api.rsList({}) : api.rsLoad(body.ruleset_id));
      setRes({ data, ms: Math.round(performance.now() - t0), bytes: new Blob([JSON.stringify(data)]).size });
    } catch (e) {
      setRes({ error: String(e), ms: Math.round(performance.now() - t0) });
    }
    setBusy(false);
  }

  const curlText = () =>
    `curl -X POST http://localhost:4300${cfg.path} \\\n  -H 'Content-Type: application/json' \\\n  -d '${JSON.stringify(body)}'`;

  const result = res?.data?.result;
  const ok = result === 'SUCCESS';

  return (
    <div className="rsx">
      <div className="req">
        <div className="card">
          <div className="card-h"><h2>요청</h2></div>
          <div className="card-b">
            {/* 엔드포인트는 두 개뿐이라 목록이 아니라 전환 스위치로 둔다 */}
            <div className="seg eq" style={{ marginBottom: 12 }}>
              {Object.entries(ENDPOINTS).map(([k, v]) => (
                <button key={k} className={ep === k ? 'on' : ''} onClick={() => { setEp(k); setRes(null); }}>{v.label}</button>
              ))}
            </div>
            <div className="epdesc">{cfg.desc}</div>

            {/* 대상 룰셋은 이 탭에서 직접 고른다 — 사이드바 전역 선택에는 영향을 주지 않는다. */}
            {cfg.needsRuleset && (
              pubList && pubList.length === 0 ? (
                <div className="warn">
                  게시된 룰셋이 없습니다. 게시본만 응답하므로,
                  <Link to="/" style={{ color: 'var(--amber)', fontWeight: 700, textDecoration: 'underline' }}> 룰 편집</Link>에서 승인 후 게시하세요.
                </div>
              ) : (
                <div className="tgt">
                  <span className="k">대상 룰셋</span>
                  <select className="fld" value={loadId} onChange={(e) => setLoadId(e.target.value)}
                    style={{ flex: '1 1 auto', minWidth: 0 }} disabled={!pubList}>
                    {!pubList && <option value="">불러오는 중…</option>}
                    {(pubList || []).map((r) => (
                      <option key={r.id} value={r.id}>{r.name} · {r.id} (승인 룰 {r.count})</option>
                    ))}
                  </select>
                </div>
              )
            )}

            <div className="reqbox">
              <div className="line"><b>POST</b> {cfg.path}</div>
              <pre>{JSON.stringify(body, null, 2)}</pre>
            </div>

            <div className="row">
              <button className="btn primary" onClick={run} disabled={busy || blocked}>
                {busy ? '호출 중…' : '▶ 실행'}
              </button>
              <CopyBtn text={curlText}>curl 복사</CopyBtn>
              {blocked && <span className="muted" style={{ fontSize: 12 }}>게시된 룰셋이 있어야 호출할 수 있습니다</span>}
            </div>
          </div>
        </div>
      </div>

      {/* 복사 결과를 알려주지 않으면 눌렸는지 알 수 없다.
          navigator.clipboard 는 비보안 컨텍스트(http)에서 없거나 거부되므로 실패도 구분해 보여준다. */}
      <div className="res">
        <div className="card">
          {res ? (
            <>
              <div className="resbar">
                {res.error
                  ? <span className="code err">요청 실패</span>
                  : <span className={'code ' + (ok ? 'ok' : 'err')}>{result || '응답'}</span>}
                <span className="m"><b>{res.ms}</b>ms</span>
                {res.bytes != null && <span className="m"><b>{(res.bytes / 1024).toFixed(1)}</b>KB</span>}
                {res.data?.rulesets && <span className="m">룰셋 <b>{res.data.rulesets.length}</b>건</span>}
                {res.data?.ruleset?.rules && <span className="m">룰 <b>{res.data.ruleset.rules.length}</b>건</span>}
                {res.data?.error_message && <span className="m" style={{ color: 'var(--fail)' }}>{res.data.error_message}</span>}
                <span className="spacer" />
                {!res.error && (
                  // 응답 바는 카드 맨 위라 툴팁을 위로 띄우면 헤더에 가린다 — 아래로 연다
                  <CopyBtn text={() => JSON.stringify(res.data, null, 2)} below>JSON 복사</CopyBtn>
                )}
              </div>
              <div className="card-b">
                <pre className="json">{res.error || JSON.stringify(res.data, null, 2)}</pre>
              </div>
            </>
          ) : (
            <>
              <div className="card-h"><h2>응답</h2></div>
              {/* flex 컨테이너의 직계 자식은 각각 flex 아이템이 되므로 한 덩어리로 감싼다 */}
              <div className="empty">
                <div>
                  <b>▶ 실행</b>을 누르면 <span className="mono">{cfg.label}</span>의<br />
                  실제 응답이 여기에 나옵니다.
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// 복사 버튼 + 결과 툴팁. text 는 함수로 받는다 — 누른 시점의 값을 복사해야 한다.
function CopyBtn({ text, children, below }) {
  const [state, setState] = useState(null);   // 'ok' | 'fail'

  useEffect(() => {
    if (!state) return;
    const t = setTimeout(() => setState(null), 1800);
    return () => clearTimeout(t);
  }, [state]);

  async function copy() {
    setState(null);
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(text());
      setState('ok');
    } catch {
      setState('fail');
    }
  }

  return (
    <span className="copywrap">
      <button className="btn sm ghost" onClick={copy}>{children}</button>
      {state && (
        <span className={'copytip' + (below ? ' below' : '') + (state === 'fail' ? ' fail' : '')} role="status">
          {state === 'ok' ? '복사되었습니다' : '복사할 수 없습니다 — 직접 선택해 주세요'}
        </span>
      )}
    </span>
  );
}
