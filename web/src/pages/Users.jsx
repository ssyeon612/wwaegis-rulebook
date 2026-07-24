import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

const ROLES = [
  { id: 'master', label: '마스터', desc: '모든 기능 + 사용자 관리' },
  { id: 'approver', label: '편집·승인', desc: '사용자 관리 제외 모든 기능' },
  { id: 'viewer', label: '보기 전용', desc: '읽기만 가능' },
];
const roleLabel = (r) => ROLES.find((x) => x.id === r)?.label || r;
const p2 = (n) => String(n).padStart(2, '0');
function localDT(s) {
  if (!s) return '—';
  const d = new Date(String(s).includes('T') ? s : s.replace(' ', 'T') + 'Z');
  return isNaN(d) ? s : `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

export default function Users() {
  const { user: me } = useAuth();
  const [list, setList] = useState(null);
  const [msg, setMsg] = useState(null);   // { tone, text }
  const [adding, setAdding] = useState(false);

  const load = () => api.listUsers().then((r) => setList(Array.isArray(r) ? r : []));
  useEffect(() => { load(); }, []);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 3500); return () => clearTimeout(t); }, [msg]);
  const flash = (tone, text) => setMsg({ tone, text });

  async function changeRole(u, role) {
    if (role === u.role) return;
    const r = await api.updateUser(u.id, { role });
    if (r.error) flash('fail', r.message || '변경 실패'); else { flash('pass', `${u.username} 권한을 ${roleLabel(role)}(으)로 변경했습니다.`); load(); }
  }
  async function resetPw(u) {
    const pw = prompt(`${u.username}의 새 비밀번호를 입력하세요 (최소 4자)`);
    if (pw == null) return;
    if (pw.length < 4) return flash('fail', '비밀번호는 4자 이상이어야 합니다.');
    const r = await api.updateUser(u.id, { password: pw });
    if (r.error) flash('fail', r.message || '재설정 실패'); else flash('pass', `${u.username}의 비밀번호를 재설정했습니다.`);
  }
  async function remove(u) {
    if (!confirm(`사용자 「${u.username}」을(를) 삭제할까요? 되돌릴 수 없습니다.`)) return;
    const r = await api.deleteUser(u.id);
    if (r.error) flash('fail', r.message || '삭제 실패'); else { flash('pass', `${u.username}을(를) 삭제했습니다.`); load(); }
  }

  if (!list) return <div className="muted" style={{ padding: 40 }}>불러오는 중…</div>;
  return (
    <div className="grid" style={{ gap: 16, maxWidth: 1000 }}>
      {msg && <div className={'set-flash ' + msg.tone}>{msg.tone === 'fail' ? '⚠' : '✓'} {msg.text}</div>}

      <div className="card">
        <div className="card-h">
          <div><h2>사용자</h2><div className="sub">계정과 권한을 관리합니다. 권한은 즉시 적용됩니다.</div></div>
          <span className="spacer" />
          <button className="btn primary sm" onClick={() => setAdding((v) => !v)}>{adding ? '닫기' : '＋ 새 사용자'}</button>
        </div>

        {adding && <AddUser onDone={(m) => { setAdding(false); flash('pass', m); load(); }} onError={(t) => flash('fail', t)} />}

        <div className="card-b" style={{ padding: 0 }}>
          <table className="tbl rows">
            <thead><tr>
              <th>아이디</th><th>이름</th><th style={{ width: 260 }}>권한</th>
              <th style={{ width: 170 }}>마지막 로그인</th><th style={{ width: 150 }} />
            </tr></thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id}>
                  <td><b className="mono">{u.username}</b>{u.id === me.id && <span className="chip" style={{ marginLeft: 8 }}>나</span>}</td>
                  <td>{u.name || '—'}</td>
                  <td>
                    <div className="seg sm">
                      {ROLES.map((r) => (
                        <button key={r.id} className={u.role === r.id ? 'on' : ''} title={r.desc} onClick={() => changeRole(u, r.id)}>{r.label}</button>
                      ))}
                    </div>
                  </td>
                  <td className="dt"><b>{localDT(u.last_login)}</b></td>
                  <td className="acts">
                    <div className="rl-acts">
                      <button className="btn xs ghost" onClick={() => resetPw(u)}>비번 재설정</button>
                      <button className="btn xs ghost" onClick={() => remove(u)} disabled={u.id === me.id}>삭제</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-h"><div><h2>권한 안내</h2></div></div>
        <div className="card-b">
          {ROLES.map((r) => (
            <div key={r.id} className="row" style={{ padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
              <span className="pill published" style={{ minWidth: 84, textAlign: 'center' }}>{r.label}</span>
              <span className="muted" style={{ fontSize: 12.5 }}>{r.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AddUser({ onDone, onError }) {
  const [username, setU] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('viewer');
  const [password, setP] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = username.trim() && password.length >= 4;

  async function submit() {
    setBusy(true);
    const r = await api.createUser({ username: username.trim(), name: name.trim(), role, password });
    setBusy(false);
    if (r.error) onError(r.message || '생성 실패'); else onDone(`사용자 ${username.trim()}(${roleLabel(role)})을(를) 추가했습니다.`);
  }

  return (
    <div className="card-b" style={{ borderBottom: '1px solid var(--line)', background: 'var(--field)' }}>
      <div className="adduser">
        <div className="au-f"><label className="flabel">아이디</label><input className="fld" value={username} onChange={(e) => setU(e.target.value)} placeholder="영문·숫자" autoComplete="off" /></div>
        <div className="au-f"><label className="flabel">이름</label><input className="fld" value={name} onChange={(e) => setName(e.target.value)} placeholder="표시 이름 (선택)" /></div>
        <div className="au-f"><label className="flabel">권한</label>
          <select className="fld" value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label} — {r.desc}</option>)}
          </select>
        </div>
        <div className="au-f"><label className="flabel">비밀번호</label><input className="fld" type="password" value={password} onChange={(e) => setP(e.target.value)} placeholder="4자 이상" autoComplete="new-password" /></div>
        <div className="au-f au-act"><button className="btn primary" onClick={submit} disabled={busy || !ok}>{busy ? '추가 중…' : '추가'}</button></div>
      </div>
    </div>
  );
}
