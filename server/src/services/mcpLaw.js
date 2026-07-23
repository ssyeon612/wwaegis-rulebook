// korean-law-mcp(법제처 42개 API 래퍼)를 stdio MCP로 붙인 법령 검색 엔진.
// ※ 하이브리드 정책:
//   · 검색(search_law) 은 이 래퍼로 — 약칭 인식·현행 우선 랭킹·시행예정 표시 이점.
//   · 조문 수집·개정 diff 는 여전히 lawApi.js(lawService.do 직파싱)를 쓴다.
//     MCP get_law_text 는 라벨·전역절단이 섞인 LLM용 텍스트라 조문 해시가 흔들린다.
// ※ 폐쇄망: 로컬 stdio 로만 스폰한다(law.go.kr 아웃바운드는 기존과 동일). 원격 호스트 미사용.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';

// bin(build/index.js)을 cwd 와 무관하게 해석한다.
// 패키지 exports 가 './package.json' 을 안 열고 '.' 는 import 조건만 열어서
// CJS require.resolve 는 막힌다 — ESM import.meta.resolve 로 '.'(=build/index.js) 을 잡는다.
function binPath() {
  return fileURLToPath(import.meta.resolve('korean-law-mcp'));
}

// 자식 프로세스는 서버 수명 동안 하나만 띄워 재사용한다(콜드스타트 ~0.7s 회피).
let clientP = null;

async function connect() {
  const oc = process.env.LAW_API_OC;
  if (!oc) throw new Error('LAW_API_OC 미설정 — MCP 검색 엔진에 넘길 인증키가 없습니다');
  const transport = new StdioClientTransport({
    command: process.execPath,           // 현재 node 로 bin 실행
    args: [binPath()],
    env: { ...process.env, LAW_OC: oc }, // 래퍼는 LAW_OC 를 읽는다
    stderr: 'ignore',
  });
  const client = new Client({ name: 'rulebook-admin', version: '1.0.0' }, { capabilities: {} });
  // 프로세스가 죽으면 다음 호출에서 다시 스폰되도록 캐시를 비운다.
  transport.onclose = () => { if (clientP) clientP = null; };
  await client.connect(transport);
  return client;
}

function getClient() {
  if (!clientP) clientP = connect().catch((e) => { clientP = null; throw e; });
  return clientP;
}

// formatHit() 출력 파싱 — 한 히트 블록:
//   1. {법령명} [현행]|⚠️[연혁-과거버전]
//      - 법령ID: 013704
//      - MST: 277247
//      - 공포일: 20251001 / 시행일: 20260102
//      - 구분: 법률
export function parseSearchText(text) {
  const lines = String(text || '').split('\n');
  const hits = [];
  let cur = null;
  const push = () => { if (cur && cur.law_key && cur.name) hits.push(cur); cur = null; };

  for (const line of lines) {
    const head = line.match(/^\s*\d+\.\s+(.+?)\s*$/);
    if (head) {
      push();
      let name = head[1];
      let current = false;
      if (/\s*\[현행\]$/.test(name)) { current = true; name = name.replace(/\s*\[현행\]$/, ''); }
      else if (/⚠️?\s*\[연혁-과거버전\]$/.test(name)) { name = name.replace(/\s*⚠️?\s*\[연혁-과거버전\]$/, ''); }
      cur = { law_key: '', law_id: '', name: name.trim(), dept: null, kind: null,
        promulgated: null, effective: null, current };
      continue;
    }
    if (!cur) continue;
    let m;
    if ((m = line.match(/-\s*법령ID:\s*(\S+)/))) cur.law_id = m[1];
    else if ((m = line.match(/-\s*MST:\s*(\S+)/))) cur.law_key = m[1];
    else if ((m = line.match(/-\s*공포일:\s*(\d{8})(?:\s*\/\s*시행일:\s*(\d{8}))?/))) {
      cur.promulgated = m[1]; if (m[2]) cur.effective = m[2];
    } else if ((m = line.match(/-\s*구분:\s*(.+?)\s*$/))) cur.kind = m[1];
    // 다음 섹션 헤더(📍/📂)나 안내(💡)를 만나면 현재 히트를 마감
    else if (/^\s*(📍|📂|💡|검색 결과)/.test(line)) push();
  }
  push();
  return hits;
}

// 법령명 검색 → lawApi.searchLaws 와 같은 형태의 배열.
// 소관부처(dept)는 MCP 가 주지 않아 null. 이후 fetchLawArticles(MST)로 조문을 수집한다.
export async function mcpSearchLaws(query, display = 20) {
  const client = await getClient();
  const res = await client.callTool({ name: 'search_law', arguments: { query, display } });
  if (res.isError) throw new Error('search_law 오류: ' + summarize(res));
  const text = (res.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  return parseSearchText(text).slice(0, display);
}

function summarize(res) {
  return (res.content || []).map((c) => c.text || '').join(' ').slice(0, 200);
}

export function mcpEnabled() {
  return (process.env.LAW_SEARCH_ENGINE || 'mcp') !== 'direct';
}
