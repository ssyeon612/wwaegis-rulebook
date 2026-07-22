// 내규 파일 파서 — 서버 환경이라 검증된 라이브러리 사용
import * as XLSX from 'xlsx';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { fileURLToPath } from 'url';
import path from 'path';

// pdf.js 리소스 경로 — 한국어 CID 폰트(HYSMyeongJo 등) PDF는 cmaps가 있어야
// 글리프를 유니코드로 되돌릴 수 있다. Windows 역슬래시는 pdf.js가 거부하므로 정슬래시.
const PDFJS_DIR =
  path.join(fileURLToPath(new URL('../../node_modules/pdfjs-dist/', import.meta.url)))
    .replace(/\\/g, '/') + '/';

// 확장자/버퍼로부터 평문 텍스트(줄 단위) 추출
export async function parseFile(buffer, filename) {
  const name = (filename || '').toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) return parseXlsx(buffer);
  if (name.endsWith('.csv')) return parseCsv(buffer.toString('utf-8'));
  if (name.endsWith('.pdf')) return parsePdf(buffer);
  return buffer.toString('utf-8');
}

function parseXlsx(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const lines = [];
  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, blankrows: false });
    for (const row of rows) {
      const line = row.map((c) => (c == null ? '' : String(c)).trim()).filter(Boolean).join('  ').trim();
      if (line) lines.push(line);
    }
  }
  return lines.join('\n');
}

function parseCsv(text) {
  return text.split(/\r?\n/).map((row) => {
    const cells = []; let cur = '', q = false;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (q) { if (ch === '"') { if (row[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else { if (ch === '"') q = true; else if (ch === ',') { cells.push(cur); cur = ''; } else cur += ch; }
    }
    cells.push(cur);
    return cells.map((c) => c.trim()).filter(Boolean).join('  ');
  }).filter(Boolean).join('\n');
}

// 텍스트레이어 PDF 추출. 스캔본은 빈 결과 → 상위에서 OCR 안내.
// 파싱 자체가 실패하면 throw — 스캔본과 구분되어야 원인을 알 수 있다.
async function parsePdf(buffer) {
  let doc;
  try {
    doc = await getDocument({
      data: new Uint8Array(buffer),
      cMapUrl: PDFJS_DIR + 'cmaps/',
      cMapPacked: true,
      standardFontDataUrl: PDFJS_DIR + 'standard_fonts/',
      useSystemFonts: true,
    }).promise;
  } catch (err) {
    throw new Error(`PDF를 열 수 없습니다: ${err.message}`);
  }

  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const { items } = await (await doc.getPage(p)).getTextContent();
    lines.push(...itemsToLines(items));
  }
  await doc.cleanup();
  return lines.join('\n');
}

// pdf.js는 글자 조각 단위로 주므로 y좌표로 줄을 복원한다.
// 이 앱은 줄 단위로 룰을 뽑기 때문에(mapConcepts) 줄 구분이 정확해야 한다.
function itemsToLines(items) {
  const rows = [];
  let cur = null;
  for (const it of items) {
    if (it.str) {
      const y = Math.round(it.transform[5]);
      if (!cur || Math.abs(cur.y - y) > 2) {
        if (cur) rows.push(cur);
        cur = { y, parts: [] };
      }
      cur.parts.push(it.str);
    }
    if (it.hasEOL && cur) { rows.push(cur); cur = null; }
  }
  if (cur) rows.push(cur);
  return rows.map((r) => r.parts.join('').replace(/\s+/g, ' ').trim()).filter(Boolean);
}
