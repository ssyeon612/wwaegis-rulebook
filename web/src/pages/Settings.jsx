import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { Icon } from '../lib/icons.jsx';
import { useAuth } from '../lib/auth.jsx';

// cron → 사람이 읽는 문장 (미리보기용, Laws 의 cronText 와 동일 규칙)
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
  return c;
}

// cron 문자열을 빌더 상태로 역해석 (편집 진입 시 UI 프리필)
function parseCron(c) {
  const p = String(c || '').trim().split(/\s+/);
  if (p.length === 5) {
    const [mi, hh, dom, mon, dow] = p;
    const num = (v) => /^\d+$/.test(v);
    const every = hh.match(/^\*\/(\d+)$/);
    if (num(mi) && num(hh) && dom === '*' && mon === '*' && dow === '*') return { mode: 'daily', time: `${hh.padStart(2, '0')}:${mi.padStart(2, '0')}`, dow: 1, every: 6 };
    if (num(mi) && num(hh) && dom === '*' && mon === '*' && num(dow)) return { mode: 'weekly', time: `${hh.padStart(2, '0')}:${mi.padStart(2, '0')}`, dow: +dow % 7, every: 6 };
    if (num(mi) && every && dom === '*' && mon === '*' && dow === '*') return { mode: 'hours', time: '06:30', dow: 1, every: +every[1] };
  }
  return { mode: 'raw', time: '06:30', dow: 1, every: 6, raw: c || '30 6 * * *' };
}
function buildCron({ mode, time, dow, every, raw }) {
  const [h, m] = String(time || '06:30').split(':').map((x) => parseInt(x, 10) || 0);
  if (mode === 'daily') return `${m} ${h} * * *`;
  if (mode === 'weekly') return `${m} ${h} * * ${dow}`;
  if (mode === 'hours') return `0 */${Math.max(1, every)} * * *`;
  return raw;
}

// 공통 설정 카드 — 아이콘 배지 + 제목·설명 + 우측 슬롯 + 본문
function Card({ icon, title, desc, right, dim, children }) {
  return (
    <section className="set-card">
      <div className="set-head">
        <span className="set-ic" aria-hidden="true">{icon}</span>
        <div className="set-htxt"><h2>{title}</h2><p>{desc}</p></div>
        {right && <div className="set-right">{right}</div>}
      </div>
      <div className="set-body" style={dim ? { opacity: 0.5 } : undefined}>{children}</div>
    </section>
  );
}

// 섹션이 늘어도 한 화면에 한 섹션만 — 좌측 네비로 전환해 스크롤을 짧게 유지한다.
const SECTIONS = [
  { key: 'engine', icon: '🧠', label: '분석 엔진', desc: 'LLM 엔진·모델·API 키' },
  { key: 'schedule', icon: '⏰', label: '법령 점검', desc: '자동 점검 주기·on/off' },
  { key: 'paths', icon: '📁', label: '프로젝트 경로', desc: '파일 시스템 경로' },
];

export default function Settings() {
  const { canWrite } = useAuth();
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState(null);   // { tone, text }
  const [active, setActive] = useState('engine');
  useEffect(() => { api.getSettings().then(setS); }, []);

  // 저장 성공 안내는 잠깐 떴다 사라지게
  const flash = (tone, text) => { setMsg({ tone, text }); };
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 4000); return () => clearTimeout(t); }, [msg]);

  if (!s) return <div className="muted" style={{ padding: 40 }}>설정을 불러오는 중…</div>;
  return (
    <div className="settings">
      <nav className="set-nav">
        {SECTIONS.map((sec) => (
          <button key={sec.key} className={'set-navitem' + (active === sec.key ? ' on' : '')} onClick={() => { setActive(sec.key); setMsg(null); }}>
            <span className="ic" aria-hidden="true">{sec.icon}</span>
            <span className="txt"><b>{sec.label}</b><em>{sec.desc}</em></span>
          </button>
        ))}
      </nav>

      <div className="set-content">
        {!canWrite && <div className="set-flash" style={{ background: 'var(--field)', borderColor: 'var(--line)', color: 'var(--muted)' }}>👁 보기 전용 계정입니다 — 설정을 변경할 수 없습니다.</div>}
        {msg && <div className={'set-flash ' + msg.tone}>{msg.tone === 'fail' ? '⚠' : '✓'} {msg.text}</div>}
        {active === 'engine' && <LlmSection s={s} ro={!canWrite} onSaved={(next) => { setS(next); flash('pass', 'LLM 설정을 저장했습니다 — 다음 분석부터 적용됩니다.'); }} onError={(t) => flash('fail', t)} />}
        {active === 'schedule' && <ScheduleSection s={s} ro={!canWrite} onSaved={(next, m) => { setS(next); flash('pass', m || `점검 스케줄을 저장했습니다 — ${cronText(next.scheduler.cron)}`); }} onError={(t) => flash('fail', t)} />}
        {active === 'paths' && <PathSection paths={s.paths} />}
      </div>
    </div>
  );
}

/* ── 1) 분석 엔진 (LLM) ─────────────────────────── */
const GROUPS = [['onprem', '사내 호스팅'], ['cloud', '클라우드']];
function LlmSection({ s, ro, onSaved, onError }) {
  const [provider, setProvider] = useState(s.provider);
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const cur = s.providers.find((p) => p.id === provider);

  // provider 를 바꾸면 그 엔진의 현재 모델로 채우고, API 키 입력·표시는 초기화(키는 provider별).
  useEffect(() => { setModel(s.providers.find((p) => p.id === provider)?.model || ''); setApiKey(''); setShowKey(false); }, [provider, s]);

  const dirty = provider !== s.provider || model !== (cur?.model || '') || apiKey.trim() !== '';

  async function save() {
    setBusy(true);
    const r = await api.saveSettings({ provider, model, apiKey: apiKey.trim() || undefined }).catch(() => ({ error: 'network' }));
    setBusy(false);
    if (r.error) onError(r.message || '저장 실패');
    else { setApiKey(''); onSaved(r); }
  }

  return (
    <Card icon="🧠" title="분석 엔진 (LLM)" desc="내규를 분석해 룰을 뽑는 엔진입니다. 저장하면 재시작 없이 다음 분석부터 적용됩니다."
      right={<span className="set-cur"><i className={cur?.cloud ? 'cloud' : 'safe'} /><b>{s.provider}</b>{s.model && <em>{s.model}</em>}</span>}>

      {GROUPS.map(([cat, label]) => {
        const items = s.providers.filter((p) => p.category === cat);
        if (!items.length) return null;
        return (
          <div className="prov-group" key={cat}>
            <div className="prov-glabel">{label}</div>
            <div className="prov-grid">
              {items.map((p) => {
                const sel = provider === p.id;
                return (
                  <button key={p.id} type="button" className={'prov-card' + (sel ? ' on' : '')} onClick={() => setProvider(p.id)}>
                    <span className="prov-dot" />
                    <span className="prov-main">
                      <span className="prov-name">{p.label}</span>
                      <span className="prov-note">{p.note}</span>
                      <span className="prov-tags">
                        {s.provider === p.id && <span className="tagpill on">● 사용중</span>}
                        {p.cloud && (p.keyConfigured
                          ? <span className="tagpill ok">API 키 있음</span>
                          : <span className="tagpill warn">API 키 없음</span>)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="set-field">
        <label className="flabel">모델</label>
        <input className="fld" value={model} onChange={(e) => setModel(e.target.value)} placeholder={cur?.model} style={{ maxWidth: 460 }} />
        <div className="fhint">비우면 서버 <span className="mono">.env</span> 기본값(<span className="mono">{cur?.model}</span>)을 씁니다.</div>
      </div>

      {cur?.needsKey && (
        <div className="set-field">
          <label className="flabel">API 키 {cur.keyConfigured && <span className="tagpill ok" style={{ marginLeft: 4 }}>저장됨 {cur.keyHint}</span>}</label>
          <div className="pw-wrap" style={{ maxWidth: 460 }}>
            <input className="fld mono" type={showKey ? 'text' : 'password'} autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
              placeholder={cur.keyConfigured ? '변경하려면 새 키 입력' : `${cur.label} API 키 입력`} />
            <button type="button" className="pw-eye" onClick={() => setShowKey((v) => !v)}
              title={showKey ? '키 숨기기' : '키 표시'} aria-label={showKey ? '키 숨기기' : '키 표시'} aria-pressed={showKey}>
              <Icon name={showKey ? 'eyeOff' : 'eye'} size={17} />
            </button>
          </div>
          <div className="fhint">
            {cur.keyConfigured ? '키가 저장되어 있습니다. 비워두면 유지됩니다.' : '이 클라우드 엔진을 쓰려면 API 키가 필요합니다.'} 키는 서버에만 저장되고 화면엔 표시되지 않습니다.
          </div>
        </div>
      )}

      <div className="set-actions">
        <button className="btn primary" onClick={save} disabled={busy || !dirty || ro}>{busy ? '저장 중…' : '변경 저장'}</button>
        <span className="set-hint">{dirty ? '저장하지 않은 변경이 있습니다.' : '모든 변경이 저장되었습니다.'}</span>
      </div>
    </Card>
  );
}

/* ── 2) 법령 점검 스케줄 (cron) ───────────────────────── */
const HOUR_OPTS = [1, 2, 3, 6, 12, 24];
function ScheduleSection({ s, ro, onSaved, onError }) {
  const [c, setC] = useState(() => parseCron(s.scheduler.cron));
  const [busy, setBusy] = useState(false);
  const [tog, setTog] = useState(false);
  const cron = useMemo(() => buildCron(c), [c]);
  const dirty = cron !== s.scheduler.cron;
  const enabled = s.scheduler.scheduler_enabled !== false;

  async function save() {
    setBusy(true);
    const r = await api.saveSettings({ cron }).catch(() => ({ error: 'network' }));
    setBusy(false);
    if (r.error) onError(r.message || 'cron 저장 실패'); else onSaved(r);
  }
  async function toggle() {
    const next = !enabled;
    setTog(true);
    const r = await api.saveSettings({ scheduler_enabled: next }).catch(() => ({ error: 'network' }));
    setTog(false);
    if (r.error) onError(r.message || '변경 실패');
    else onSaved(r, `자동 점검을 ${next ? '켰습니다 — ' + cronText(r.scheduler.cron) + '에 실행됩니다.' : '껐습니다 — 자동 점검이 실행되지 않습니다.'}`);
  }

  return (
    <Card icon="⏰" title="법령 점검 스케줄" desc="국가법령정보센터를 자동으로 다시 받아 개정을 감지·반영하는 주기입니다." dim={!enabled}
      right={
        <button type="button" role="switch" aria-checked={enabled} disabled={tog || ro}
          className={'switch' + (enabled ? ' on' : '')} onClick={toggle} title={enabled ? '자동 점검 끄기' : '자동 점검 켜기'}>
          <span className="knob" />
          <span className="lbl">{enabled ? '자동 점검 켜짐' : '자동 점검 꺼짐'}</span>
        </button>
      }>
      {!enabled && (
        <div className="set-warn" style={{ marginTop: 0 }}>
          자동 점검이 <b>꺼져 있습니다</b> — 아래 주기를 저장해도 실행되지 않습니다. 우측 스위치로 켜세요. (‘법령 현황’의 <b>지금 업데이트</b> 수동 점검은 계속 가능)
        </div>
      )}

      <div className="set-field">
        <label className="flabel">반복 주기</label>
        <div className="seg" style={{ maxWidth: 380 }}>
          {[['daily', '매일'], ['weekly', '매주'], ['hours', '시간마다'], ['raw', '직접 입력']].map(([k, l]) => (
            <button key={k} className={c.mode === k ? 'on' : ''} onClick={() => setC((v) => ({ ...v, mode: k, raw: v.raw || cron }))}>{l}</button>
          ))}
        </div>
      </div>

      <div className="set-field">
        <label className="flabel">{c.mode === 'hours' ? '간격' : c.mode === 'raw' ? 'cron 표현식' : '시각'}</label>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          {c.mode === 'weekly' && (
            <select className="fld" style={{ width: 'auto' }} value={c.dow} onChange={(e) => setC((v) => ({ ...v, dow: +e.target.value }))}>
              {DOW.map((d, i) => <option key={i} value={i}>{d}요일</option>)}
            </select>
          )}
          {(c.mode === 'daily' || c.mode === 'weekly') && (
            <input className="fld" type="time" style={{ width: 'auto' }} value={c.time} onChange={(e) => setC((v) => ({ ...v, time: e.target.value }))} />
          )}
          {c.mode === 'hours' && (
            <select className="fld" style={{ width: 'auto' }} value={c.every} onChange={(e) => setC((v) => ({ ...v, every: +e.target.value }))}>
              {HOUR_OPTS.map((n) => <option key={n} value={n}>{n}시간마다</option>)}
            </select>
          )}
          {c.mode === 'raw' && (
            <input className="fld mono" style={{ maxWidth: 260 }} value={c.raw} onChange={(e) => setC((v) => ({ ...v, raw: e.target.value }))}
              placeholder="분 시 일 월 요일 (예: 30 6 * * *)" />
          )}
          <div className="set-cronprev">
            <span className="mono">{cron}</span><span className="arw">→</span><b>{cronText(cron)}</b>
          </div>
        </div>
      </div>

      {!s.scheduler.oc_configured && (
        <div className="set-warn">⚠ <b>LAW_API_OC 미설정</b> — 인증키가 없으면 스케줄이 있어도 자동 점검이 실제로 돌지 않습니다(수동 점검만).</div>
      )}

      <div className="set-actions">
        <button className="btn primary" onClick={save} disabled={busy || !dirty || ro}>{busy ? '저장 중…' : '스케줄 저장'}</button>
        <span className="set-hint">{dirty ? '저장하면 즉시 재예약됩니다.' : `현재: ${cronText(s.scheduler.cron)}`}</span>
      </div>
    </Card>
  );
}

/* ── 3) 프로젝트 저장 경로 ────────────────────────────── */
function PathRow({ label, value }) {
  const [copied, setCopied] = useState(false);
  const copy = () => navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }).catch(() => {});
  return (
    <div className="set-path">
      <span className="l">{label}</span>
      <code className="v" title={value}>{value}</code>
      <button className={'btn xs ' + (copied ? 'pass' : 'ghost')} onClick={copy}>{copied ? '복사됨 ✓' : '복사'}</button>
    </div>
  );
}
function PathSection({ paths }) {
  return (
    <Card icon="📁" title="프로젝트 경로" desc="서버가 실행 중인 파일 시스템 경로입니다 (읽기 전용).">
      <PathRow label="프로젝트 루트" value={paths.project} />
      <PathRow label="서버 디렉터리" value={paths.server} />
      <PathRow label="데이터베이스" value={paths.db} />
    </Card>
  );
}
