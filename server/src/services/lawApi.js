// 국가법령정보센터 OPEN API 클라이언트 (open.law.go.kr)
// 인증은 OC 파라미터(신청 시 등록한 이메일 ID) 하나로 이뤄진다.
// ※ 폐쇄망 배포 시 law.go.kr 아웃바운드 허용 필요.
import crypto from 'crypto';

const BASE = 'https://www.law.go.kr/DRF';
const oc = () => {
  const v = process.env.LAW_API_OC;
  if (!v) throw new Error('LAW_API_OC 미설정 (국가법령정보센터 인증키)');
  return v;
};

async function callApi(path, params) {
  const qs = new URLSearchParams({ OC: oc(), type: 'JSON', ...params });
  const res = await fetch(`${BASE}/${path}?${qs}`);
  if (!res.ok) throw new Error(`법령API HTTP ${res.status}`);
  const text = await res.text();
  // 인증 실패·쿼터 초과 시 JSON 대신 HTML 안내 페이지가 온다.
  if (text.trim().startsWith('<')) {
    throw new Error('법령API가 JSON 대신 HTML을 반환 — OC(인증키) 또는 파라미터를 확인하세요');
  }
  return JSON.parse(text);
}

// 법령명으로 검색 → [{ law_key(MST), law_id, name, short_name, dept, promulgated, effective }]
export async function searchLaws(query, display = 20) {
  const d = await callApi('lawSearch.do', { target: 'law', query, display: String(display) });
  const raw = d?.LawSearch?.law;
  if (!raw) return [];
  return (Array.isArray(raw) ? raw : [raw]).map((l) => ({
    law_key: String(l['법령일련번호']),
    law_id: String(l['법령ID']),
    name: l['법령명한글'],
    dept: l['소관부처명'],
    kind: l['법령구분명'],
    promulgated: l['공포일자'] ? String(l['공포일자']) : null,
    effective: l['시행일자'] ? String(l['시행일자']) : null,
    current: l['현행연혁코드'] === '현행',
  }));
}

// 법령 본문 → 조문 단위 배열
// 응답은 조문 > 항 > 호 > 목 중첩이라 평문으로 펼친다.
export async function fetchLawArticles(lawKey) {
  const d = await callApi('lawService.do', { target: 'law', MST: String(lawKey) });
  const root = d?.['법령'];
  if (!root) throw new Error(`법령 본문 없음 (MST=${lawKey})`);

  const info = root['기본정보'] || {};
  const meta = {
    law_key: String(lawKey),
    law_id: String(info['법령ID'] || ''),
    law_name: info['법령명_한글'] || '',
    short_name: info['법령명약칭'] || null,
    effective_date: info['시행일자'] ? String(info['시행일자']) : null,
    promulgation_date: info['공포일자'] ? String(info['공포일자']) : null,
  };

  const units = toArray(root['조문']?.['조문단위']);
  const articles = units
    .filter((u) => u['조문여부'] === '조문') // '전문'은 장·절 제목이라 제외
    .map((u) => {
      const no = articleNo(u);
      const body = [clean(u['조문내용']), ...toArray(u['항']).map(flattenHang)]
        .filter(Boolean)
        .join('\n');
      return {
        article_no: no,
        article_title: u['조문제목'] || null,
        content: body,
        content_hash: sha256(body),
        effective_date: u['조문시행일자'] ? String(u['조문시행일자']) : meta.effective_date,
        source_url: `https://www.law.go.kr/DRF/lawService.do?OC=${oc()}&target=law&MST=${lawKey}&type=HTML`,
      };
    });

  return { meta, articles };
}

// 제19조 / 제19조의2 (가지번호)
function articleNo(u) {
  const branch = u['조문가지번호'];
  return `제${u['조문번호']}조` + (branch ? `의${branch}` : '');
}

// 항 → 호 → 목 재귀 평문화. 목내용은 배열이 중첩되는 경우가 있다.
function flattenHang(h) {
  return [
    clean(h['항내용']),
    ...toArray(h['호']).map((ho) =>
      [clean(ho['호내용']), ...toArray(ho['목']).map((m) => clean(m['목내용']))]
        .filter(Boolean)
        .join('\n')
    ),
  ]
    .filter(Boolean)
    .join('\n');
}

function toArray(v) {
  return v == null ? [] : Array.isArray(v) ? v : [v];
}

// 문자열 / 배열 / 중첩배열을 모두 받아 정리된 한 덩어리로 만든다.
function clean(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return v.flat(Infinity).map(clean).filter(Boolean).join('\n');
  return String(v).replace(/\s+$/gm, '').replace(/^\s{2,}/gm, '  ').trim();
}

function sha256(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}
