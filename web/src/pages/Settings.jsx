import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const PROVIDERS = [
  { id: 'ruleBased', label: '규칙기반 (오프라인)', note: '키 불필요 · 폐쇄망에서 즉시 동작 · 기본값', tone: 'pass' },
  { id: 'local', label: '사내 자체 호스팅 (Ollama/vLLM·Gemma)', note: '진짜 온프레미스 권장 · 데이터 외부 반출 없음', tone: 'pass' },
  { id: 'gemini', label: 'Google Gemini (클라우드)', note: '데이터 외부 반출 — 준법 승인 후에만(F1-6)', tone: 'amber' },
  { id: 'claude', label: 'Anthropic Claude (클라우드)', note: '데이터 외부 반출 — 준법 승인 후에만(F1-6)', tone: 'amber' },
];

export default function Settings() {
  const [s, setS] = useState(null);
  useEffect(() => { api.status().then(setS); }, []);
  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="card">
        <div className="card-h"><h2>LLM Provider</h2><span className="tag">현재: {s?.provider}</span></div>
        <div className="card-b">
          <p className="lead">분석 엔진은 <b>교체형 어댑터</b>입니다. 서버 <span className="mono">.env</span>의 <span className="mono">LLM_PROVIDER</span>로 전환하고 재시작하세요. 코드 변경 없이 폐쇄망↔클라우드 이동.</p>
          {PROVIDERS.map((p) => (
            <div key={p.id} className="row" style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
              <span className={'pill ' + (p.tone === 'pass' ? 'published' : 'draft')} style={{ minWidth: 66, textAlign: 'center' }}>
                {s?.provider === p.id ? '● 사용중' : p.id}
              </span>
              <div>
                <b>{p.label}</b>
                <div className="muted" style={{ fontSize: 12 }}>{p.note}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-h"><h2>.env 설정 예시</h2></div>
        <div className="card-b">
          <pre className="json">{`# 기본(폐쇄망 즉시 동작)
LLM_PROVIDER=ruleBased

# 진짜 온프레미스 — 사내 호스팅
LLM_PROVIDER=local
LOCAL_LLM_URL=http://localhost:11434
LOCAL_LLM_MODEL=gemma2

# 클라우드(준법 승인 후) — 데이터 외부 반출 주의
LLM_PROVIDER=gemini
GEMINI_API_KEY=...`}</pre>
          <p className="lead" style={{ marginTop: 12, marginBottom: 0 }}>
            ⚠ 금융/보험 내규는 망분리·데이터 반출 규제 대상일 수 있습니다. 클라우드(gemini/claude) 사용은 <b>준법·고객사 승인</b> 후에만.
          </p>
        </div>
      </div>
    </div>
  );
}
