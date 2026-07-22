import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

// 법령 개정 승인 큐 (요구사항 4) — 스케줄러가 감지한 개정을 사람이 승인해야 반영
export default function Updates() {
  const [sched, setSched] = useState(null);
  const [list, setList] = useState([]);
  const [status, setStatus] = useState('pending');
  const [busy, setBusy] = useState(false);
  const [checkMsg, setCheckMsg] = useState('');

  const load = () => { api.updates(status).then(setList); api.schedulerInfo().then(setSched); };
  useEffect(() => { load(); }, [status]);

  async function checkNow() {
    setBusy(true); setCheckMsg('법령 점검 중…');
    const r = await api.checkNow();
    if (r.error) setCheckMsg(`점검 실패: ${r.message}`);
    else setCheckMsg(`점검 완료 — 확인 ${r.checked} · 개정 감지 ${r.changed} · 신규 ${r.added}${r.errors?.length ? ` · 오류 ${r.errors.length}` : ''}`);
    setBusy(false); load();
  }
  async function approve(id) { await api.approveUpdate(id); load(); }
  async function reject(id) { const note = prompt('반려 사유(선택)') ?? ''; await api.rejectUpdate(id, note); load(); }

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="card">
        <div className="card-h"><h2>법령 자동 점검</h2><span className="tag">스케줄러</span></div>
        <div className="card-b">
          <div className="row" style={{ marginBottom: 12 }}>
            <span className="pill" style={{ borderColor: 'var(--line-2)' }}>주기 <b className="mono">{sched?.cron || '…'}</b></span>
            <span className={'pill ' + (sched?.oc_configured ? 'published' : 'draft')}>{sched?.oc_configured ? 'API 연결됨' : 'API 키 미설정'}</span>
            {sched?.last_run && <span className="muted" style={{ fontSize: 12 }}>최근 점검: {(sched.last_run.finished || '').slice(0, 16)} · 개정 {sched.last_run.changed}</span>}
            <span className="spacer" />
            <button className="btn primary" onClick={checkNow} disabled={busy}>{busy ? '점검 중…' : '⟳ 지금 점검'}</button>
          </div>
          <p className="lead" style={{ margin: 0 }}>
            매일 <span className="mono">{sched?.cron}</span>에 수집된 법령을 다시 받아 개정을 감지합니다. 감지된 개정은 아래 승인 큐에 <b>대기(pending)</b>로 쌓이며, <b>승인해야 룰에 반영</b>됩니다. 개정 자체가 룰 본문을 자동으로 바꾸지 않습니다.
          </p>
          {checkMsg && <div className="lead" style={{ marginTop: 10, color: 'var(--pass)' }}>{checkMsg}</div>}
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h2>승인 큐</h2>
          <div className="row" style={{ marginLeft: 'auto', gap: 6 }}>
            {['pending', 'approved', 'rejected'].map((s) => (
              <button key={s} className={'btn sm ' + (status === s ? 'primary' : 'ghost')} onClick={() => setStatus(s)}>
                {{ pending: '대기', approved: '승인', rejected: '반려' }[s]}
              </button>
            ))}
          </div>
        </div>
        <div className="card-b" style={{ padding: 0 }}>
          {list.length === 0
            ? <div className="card-b muted">{status === 'pending' ? '대기 중인 개정이 없습니다. 위 ‘지금 점검’으로 확인하세요.' : '항목 없음'}</div>
            : list.map((u) => (
              <div key={u.id} style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
                <div className="row" style={{ marginBottom: 10 }}>
                  <b>{u.law_name}</b>
                  <span className="chip mono">{u.article_no}</span>
                  {u.article_title && <span className="muted">{u.article_title}</span>}
                  <span className="pill draft">영향 룰 {u.affected_rules}</span>
                  <span className="spacer" />
                  <span className="muted mono" style={{ fontSize: 11 }}>{(u.detected_at || '').slice(0, 16)}</span>
                  {status === 'pending' && <>
                    <button className="btn sm pass" onClick={() => approve(u.id)}>✓ 승인</button>
                    <button className="btn sm ghost" onClick={() => reject(u.id)}>반려</button>
                  </>}
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
    </div>
  );
}
