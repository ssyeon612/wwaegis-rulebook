import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';

const ACTIONS = [
  { to: '/extract', tone: 'b1', icon: '⬆', title: '룰셋 생성', desc: '내규 업로드 → AI 분석' },
  { to: '/rulesets', tone: 'b2', icon: '☰', title: '룰셋 관리', desc: '검토 · 승인 · 게시' },
  { to: '/api', tone: 'b3', icon: '↔', title: 'RS API', desc: 'ST · STT 연동 확인' },
  { to: '/settings', tone: 'b4', icon: '⚙', title: '설정', desc: '분석 엔진 전환' },
];

export default function Dashboard() {
  const [s, setS] = useState(null);
  useEffect(() => { api.status().then(setS); }, []);
  if (!s) return <div className="muted">로딩 중…</div>;
  const c = s.counts;

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="grid g-4">
        <div className="stat">
          <div className="ic">📄</div>
          <div><div className="n">{c.documents}</div><div className="l">업로드 내규</div></div>
        </div>
        <div className="stat amber">
          <div className="ic">☰</div>
          <div><div className="n">{c.rulesets}</div><div className="l">룰셋(초안 포함)</div></div>
        </div>
        <div className="stat pass">
          <div className="ic">✓</div>
          <div><div className="n">{c.published}</div><div className="l">게시됨</div></div>
        </div>
        <div className="stat law">
          <div className="ic">⚖</div>
          <div><div className="n">{c.rules}</div><div className="l">전체 룰</div></div>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <div>
            <h2>빠른 작업</h2>
          </div>
        </div>
        <div className="card-b">
          <div className="qa">
            {ACTIONS.map((a) => (
              <Link key={a.to} to={a.to} className={'t ' + a.tone}>
                <div className="ic">{a.icon}</div>
                <div><b>{a.title}</b><span>{a.desc}</span></div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
