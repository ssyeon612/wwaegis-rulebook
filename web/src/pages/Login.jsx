import { useState } from 'react';
import { useAuth } from '../lib/auth.jsx';

export default function Login() {
  const { login } = useAuth();
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setBusy(true); setErr('');
    const r = await login(username.trim(), password);
    setBusy(false);
    if (r?.error) setErr(r.message || '로그인에 실패했습니다.');
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <div className="mk">W</div>
          <div><b>WiseAegis</b><span>Rulebook 관리 콘솔</span></div>
        </div>
        <h1>로그인</h1>
        <p className="login-sub">계정으로 로그인하세요. 권한에 따라 사용 가능한 기능이 달라집니다.</p>

        <label className="flabel">아이디</label>
        <input className="fld" value={username} onChange={(e) => setU(e.target.value)} autoFocus autoComplete="username" placeholder="아이디" />

        <label className="flabel" style={{ marginTop: 12 }}>비밀번호</label>
        <input className="fld" type="password" value={password} onChange={(e) => setP(e.target.value)} autoComplete="current-password" placeholder="비밀번호" />

        {err && <div className="login-err">⚠ {err}</div>}

        <button className="btn primary" type="submit" disabled={busy || !username.trim() || !password} style={{ width: '100%', justifyContent: 'center', marginTop: 16, height: 44 }}>
          {busy ? '로그인 중…' : '로그인'}
        </button>
      </form>
    </div>
  );
}
