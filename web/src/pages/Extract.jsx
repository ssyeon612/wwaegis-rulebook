import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';

export default function Extract() {
  const nav = useNavigate();
  const [hint, setHint] = useState('');
  const [fname, setFname] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [drag, setDrag] = useState(false);
  const [targets, setTargets] = useState([]);
  const [target, setTarget] = useState(''); // '' = 새 룰셋, 아니면 기존 룰셋 db id

  useEffect(() => { api.listRulesets().then(setTargets).catch(() => {}); }, []);

  function pick(f) {
    if (!f) return;
    setFile(f); setFname(f.name); setErr('');
  }

  async function run() {
    setBusy(true); setErr('');
    try {
      const form = new FormData();
      form.append('file', file);
      if (hint.trim()) form.append('hint', hint);
      if (target) form.append('target_ruleset_id', target); // 기존 룰셋에 추가
      const res = await api.extract(form);
      if (res.error) { setErr(res.message || res.error); setBusy(false); return; }
      nav(`/rulesets/${res.ruleset_id}`);
    } catch (e) { setErr(String(e)); }
    setBusy(false);
  }

  return (
    <div className="grid g-2" style={{ alignItems: 'start' }}>
      <div className="card">
        <div className="card-h"><h2>① 내규 업로드</h2><span className="tag">엑셀·PDF·CSV·텍스트</span></div>
        <div className="card-b">
          <p className="lead">회사 <b>내규·매뉴얼·체크리스트</b> 파일을 올려주세요</p>
          <div className={'drop' + (drag ? ' drag' : '')}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}>
            <label className="fbtn">📄 파일 선택
              <input type="file" hidden accept=".xlsx,.xls,.csv,.pdf,.txt,.md"
                onChange={(e) => pick(e.target.files[0])} />
            </label>
            <div className="fname">{fname ? `✓ ${fname}` : '여기로 파일을 끌어다 놓거나 선택하세요'}</div>
          </div>

          <label className="flabel">AI 보충 설명 (선택)</label>
          <p className="lead" style={{ fontSize: 12, margin: '0 0 6px' }}>
            내규만으로 알기 어려운 배경·사내 용어·판단 기준을 적어두면 AI가 해석에 반영합니다.
          </p>
          <textarea className="fld" value={hint} onChange={(e) => setHint(e.target.value)}
            style={{ minHeight: 130, marginBottom: 0 }}
            placeholder={'예)\n· 우리는 대면 판매만 하므로 TM 관련 조항은 제외\n· "핵심설명서"는 상품설명서와 같은 문서를 뜻함\n· 고령자 기준은 만 65세 이상'} />
        </div>
      </div>

      <div className="card">
        <div className="card-h"><h2>② AI 분석 · 자동 감지</h2><span className="tag">F1-3</span></div>
        <div className="card-b">
          <p className="lead">업로드 후 실행하면 AI가 <b>도메인을 자동 판별</b>하고, 각 항목의 개념을 식별해 <b>관련 법령을 붙여</b> 편집 가능한 룰셋으로 만듭니다.</p>

          <label className="flabel">대상 룰셋</label>
          <select className="fld" value={target} onChange={(e) => setTarget(e.target.value)} style={{ marginBottom: 6 }}>
            <option value="">＋ 새 룰셋 생성 (새 ruleset_id 발급)</option>
            {targets.map((r) => (
              <option key={r.id} value={r.id}>기존에 추가 — {r.name} · {r.ruleset_id || '(미게시)'} (룰 {r.rule_count})</option>
            ))}
          </select>
          <p className="lead" style={{ fontSize: 12, margin: '0 0 12px' }}>
            같은 상품의 내규가 여러 파일이면 <b>기존 룰셋에 추가</b>하세요. <b>ruleset_id가 고정</b>되어 ST가 한 번의 <span className="mono">loadRuleSet</span>으로 전부 받습니다. (중복 개념은 자동 제외)
          </p>
          <div className="warn">분석 엔진은 <b>교체형 슬롯</b>입니다. 폐쇄망 배포 시 이 자리에 사내 LLM(<span className="mono">LLM_PROVIDER=local</span>)이 들어갑니다.</div>
          {err && <div className="warn" style={{ background: 'var(--fail-bg)', borderColor: 'var(--fail-line)', color: 'var(--fail)' }}>⚠ {err}</div>}
          <button className="btn primary" disabled={busy || !file} onClick={run} style={{ width: '100%', justifyContent: 'center' }}>
            {busy ? '분석 중…' : '⚙ AI 분석 실행 → 룰셋 생성'}
          </button>
          <p className="lead" style={{ marginTop: 12, marginBottom: 0 }}>생성된 룰셋은 다음 화면에서 <b>검토·수정·승인·게시</b>합니다.</p>
        </div>
      </div>
    </div>
  );
}
