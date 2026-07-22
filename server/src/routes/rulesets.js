// 룰셋 · 룰 관리 API + 내규 업로드·분석 → 룰셋 자동 생성
import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import db from '../db.js';
import { parseFile } from '../services/parsers.js';
import { analyzeDocument, activeProvider } from '../llm/index.js';
import { PACKS } from '../knowledge/index.js';
import { linkRuleToLaw, lawsForRule } from '../services/lawLink.js';
import { logChange, logRuleEdit, ruleHistory, rulesetHistory } from '../services/history.js';
import { buildGraph, provenance, ensureChunks, linkRulesToChunks } from '../services/graph.js';
import { buildKG, getKG } from '../services/kg/index.js';
import { buildProposals, acceptProposal, dismissProposal } from '../services/kg/proposals.js';
import { rulesetTrust, trustPath } from '../services/trust.js';
import { getTagset, addTag, updateTag, removeTag, ensureTag } from '../services/tagset.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const router = express.Router();

const uid = (prefix) => prefix + crypto.randomBytes(9).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 12).padEnd(12, '0');

// multipart 파일명은 busboy가 latin1로 디코딩하는데 브라우저는 UTF-8 바이트를 보낸다.
// 그대로 두면 한글이 'ÀÚµ¿Â÷'처럼 깨지므로 되돌린다.
// 이미 정상인 이름(ASCII 등)은 건드리지 않도록 디코딩 성공 시에만 교체.
function fixFilename(name) {
  if (!name || ![...name].some((c) => c.charCodeAt(0) >= 0x80 && c.charCodeAt(0) <= 0xff)) return name;
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('�') ? name : decoded;
}

// 내규↔수집법령 대조 노트 — 링크 결과를 근거로 "비교한 사실"을 content 옆에 남긴다.
// lawId 있으면 실제 수집 조문(제목·시행일·발췌)을 근거로 확정, 없으면 근거 공백을 표시.
const articleById = db.prepare('SELECT law_name, article_no, article_title, content, effective_date FROM laws WHERE id=?');
function buildLawCompare(lawBasis, lawId) {
  if (lawId) {
    const a = articleById.get(lawId);
    if (a) {
      const snip = (a.content || '').replace(/\s+/g, ' ').trim().slice(0, 140);
      return `✓ 근거 확인: 내규 인용 "${lawBasis}" ↔ 수집조문 ${a.law_name} ${a.article_no}`
        + `${a.article_title ? `(${a.article_title})` : ''}${a.effective_date ? ` · 시행 ${a.effective_date}` : ''}`
        + `${snip ? `\n조문 발췌: ${snip}…` : ''}`;
    }
  }
  if (lawBasis) return `⚠ 근거 공백: 내규가 "${lawBasis}"를 근거로 들었으나 수집된 법령에 매칭 조문이 없습니다 — 법령 수집 후 재연결 필요.`;
  return '⚠ 근거 없음: 명시된 법령 근거가 없습니다 — 근거 확인 필요.';
}

// --- 업로드 → 파싱 → 도메인 감지 → 분석 → 룰셋(초안) 저장 ---
router.post('/extract', upload.single('file'), async (req, res) => {
  try {
    let content = req.body.text || '';
    let fname = req.body.name || '붙여넣기 내규';
    let format = 'text';
    if (req.file) {
      fname = fixFilename(req.file.originalname);
      format = fname.split('.').pop().toLowerCase();
      content = await parseFile(req.file.buffer, fname);
    }
    if (!content.trim()) {
      return res.status(422).json({ error: 'empty', message: '내용을 추출하지 못했습니다. PDF 스캔본이면 서버측 OCR가 필요합니다.' });
    }
    const productName = (req.body.productName || '').trim();
    const productId = (req.body.product_id || '').trim();  // 외부 상품마스터 코드(선택) — 표시·참조용, 매칭 키 아님
    const hint = (req.body.hint || '').trim();
    const target = req.body.target_ruleset_id ? Number(req.body.target_ruleset_id) : null;
    const analysis = await analyzeDocument(content, productName, hint);

    const docRow = db.prepare('INSERT INTO documents (name, format, content, hint) VALUES (?,?,?,?)')
      .run(fname, format, content, hint || null);

    // 대상 룰셋: 지정되면 그 룰셋에 "추가"(같은 ruleset_id 유지), 아니면 새 룰셋 생성
    let rulesetId, appended = false, domain = analysis.domain;
    if (target) {
      const trs = db.prepare('SELECT * FROM rulesets WHERE id=?').get(target);
      if (!trs) return res.status(404).json({ error: 'target_not_found', message: '대상 룰셋이 없습니다.' });
      rulesetId = trs.id; domain = trs.domain; appended = true;
    } else {
      const pack = PACKS[analysis.domain];
      // 상품명이 있으면 STT 목록에 뜨는 이름으로 쓴다 — 없으면 도메인 기본명.
      const rsName = productName ? `${productName} 룰셋` : `${pack.label} 내규 룰셋`;
      const rs = db.prepare('INSERT INTO rulesets (name, domain, engine, document_id, source_hint, product_id, product_name) VALUES (?,?,?,?,?,?,?)')
        .run(rsName, analysis.domain, analysis.engine, docRow.lastInsertRowid, hint || null, productId || null, productName || null);
      rulesetId = rs.lastInsertRowid;
    }

    const startIdx = db.prepare('SELECT COALESCE(MAX(order_idx),-1) m FROM rules WHERE ruleset_id=?').get(rulesetId).m + 1;
    // 중복 판정은 개념(tag)+제목 기준 — source_rule_id 는 추출마다 재번호되므로 신뢰 불가
    const dup = db.prepare('SELECT 1 FROM rules WHERE ruleset_id=? AND tag=? AND title=?');
    const renumber = (sid, n) => `${String(sid || 'RULE').split('-')[0]}-${String(n).padStart(2, '0')}`;
    const ins = db.prepare(
      `INSERT INTO rules (ruleset_id, order_idx, tag, action_tags, title, severity, speaker, source_rule_id, internal_source, law_basis, knowledge)
       VALUES (@ruleset_id,@order_idx,@tag,@action_tags,@title,@severity,@speaker,@source_rule_id,@internal_source,@law_basis,@knowledge)`
    );
    const setCompare = db.prepare('UPDATE rules SET law_compare=? WHERE id=?');
    let inserted = 0, skipped = 0;
    db.transaction((rules) => {
      let idx = startIdx;
      for (const r of rules) {
        // 추가 모드: 같은 개념+제목이 이미 있으면 건너뛴다(중복 방지)
        if (appended && dup.get(rulesetId, r.tag, r.title)) { skipped++; continue; }
        // 추가 룰은 source_rule_id 를 이어서 재번호(룰셋 내 유일)
        const sid = appended ? renumber(r.source_rule_id, idx + 1) : r.source_rule_id;
        const ruleId = ins.run({
          ruleset_id: rulesetId, order_idx: idx++, ...r, source_rule_id: sid,
          action_tags: JSON.stringify(r.action_tags || []),   // 배열은 그대로 못 바인딩 → JSON 문자열
        }).lastInsertRowid;
        logChange({ rule_id: ruleId, ruleset_id: rulesetId, field: 'created', new_value: r.title, source: 'ai_extract', actor: analysis.engine });
        // 내규↔법령 대조: 링크 시도 결과(law_id 또는 null)로 대조 노트를 남긴다
        const lawId = linkRuleToLaw(ruleId, r.law_basis, 'ai');
        setCompare.run(buildLawCompare(r.law_basis, lawId), ruleId);
        inserted++;
      }
    })(analysis.rules);

    // 지식그래프 층: 새 문서 청크화 + (새로 추가된)룰↔청크 연결
    ensureChunks(docRow.lastInsertRowid);
    linkRulesToChunks(rulesetId, docRow.lastInsertRowid);

    res.json({
      ruleset_id: rulesetId,
      appended,
      domain,
      detection: analysis.detection,
      engine: analysis.engine,
      provider: activeProvider(),
      rule_count: inserted,
      skipped,
      unmatched: analysis.unmatched,
      log: analysis.log,
    });
  } catch (err) {
    res.status(500).json({ error: 'extract_failed', message: err.message });
  }
});

// --- 룰셋 목록 ---
router.get('/', (req, res) => {
  // updated_at: 생성·게시·이력(생성/편집/법령반영) 중 가장 최근 시각.
  // rule_history.ruleset_id가 비어있는 행도 있어 rules를 통해서도 훑는다.
  // MAX()는 인자에 NULL이 하나라도 있으면 NULL이므로 COALESCE로 막는다.
  const rows = db.prepare(`
    SELECT rs.*, (SELECT COUNT(*) FROM rules WHERE ruleset_id = rs.id) AS rule_count,
           (SELECT COUNT(*) FROM rules WHERE ruleset_id = rs.id AND status='approved') AS approved_count,
           MAX(
             rs.created_at,
             COALESCE(rs.published_at, rs.created_at),
             COALESCE((SELECT MAX(h.changed_at) FROM rule_history h
                        LEFT JOIN rules r2 ON r2.id = h.rule_id
                       WHERE h.ruleset_id = rs.id OR r2.ruleset_id = rs.id), rs.created_at)
           ) AS updated_at
    FROM rulesets rs ORDER BY rs.id DESC`).all();
  res.json(rows);
});

// --- 룰셋 상세 (룰 포함) ---
router.get('/:id', (req, res) => {
  const rs = db.prepare('SELECT * FROM rulesets WHERE id=?').get(req.params.id);
  if (!rs) return res.status(404).json({ error: 'not_found' });
  rs.rules = db.prepare('SELECT * FROM rules WHERE ruleset_id=? ORDER BY order_idx').all(req.params.id);
  res.json(rs);
});

// --- 룰 수정 (변경 이력 기록) ---
router.patch('/rules/:ruleId', (req, res) => {
  const fields = ['title', 'tag', 'action_tags', 'severity', 'speaker', 'knowledge', 'law_basis', 'internal_source', 'status'];
  const set = fields.filter((f) => f in req.body);
  if (!set.length) return res.json({ ok: true });
  // action_tags 는 배열로 오면 JSON 문자열로 저장 (better-sqlite3는 배열 바인딩 불가)
  const val = (f) => (f === 'action_tags' && Array.isArray(req.body[f])) ? JSON.stringify(req.body[f]) : req.body[f];
  const before = db.prepare('SELECT * FROM rules WHERE id=?').get(req.params.ruleId);
  db.prepare(`UPDATE rules SET ${set.map((f) => `${f}=?`).join(',')} WHERE id=?`)
    .run(...set.map(val), req.params.ruleId);
  if (before) logRuleEdit(req.params.ruleId, before, { ...before, ...req.body }, req.body.actor || 'admin');
  res.json({ ok: true });
});

// --- 의미태그 일괄 교정/병합 — 룰셋 내 from 태그를 to 태그로 (표준 정합) ---
router.post('/:id/retag', (req, res) => {
  const from = String(req.body?.from || '').trim();
  const to = String(req.body?.to || '').trim();
  if (!from || !to) return res.status(400).json({ error: 'bad_request', message: 'from·to 태그가 필요합니다.' });
  if (from === to) return res.json({ ok: true, changed: 0, from, to });
  const rules = db.prepare('SELECT id, title FROM rules WHERE ruleset_id=? AND tag=?').all(req.params.id, from);
  const upd = db.prepare('UPDATE rules SET tag=? WHERE id=?');
  db.transaction(() => rules.forEach((r) => {
    upd.run(to, r.id);
    logChange({ rule_id: r.id, ruleset_id: req.params.id, field: 'tag', old_value: from, new_value: to, source: 'user_edit' });
  }))();
  ensureTag(req.params.id, 'meaning', to);   // 대상 코드를 룰셋 사전에 보장 (orphan 방지)
  res.json({ ok: true, changed: rules.length, from, to });
});

// --- 룰셋별 태그 사전 (표준 복제 후 편집 · 옵션3) ---
router.get('/:id/tagset', (req, res) => res.json(getTagset(Number(req.params.id))));
router.post('/:id/tagset', (req, res) => {
  try { res.json(addTag(Number(req.params.id), req.body || {})); }
  catch (err) { res.status(400).json({ error: 'add_failed', message: err.message }); }
});
router.patch('/:id/tagset/:tagId', (req, res) => {
  try { res.json(updateTag(Number(req.params.id), Number(req.params.tagId), req.body || {})); }
  catch (err) { res.status(400).json({ error: 'update_failed', message: err.message }); }
});
router.delete('/:id/tagset/:tagId', (req, res) => {
  try { res.json(removeTag(Number(req.params.id), Number(req.params.tagId))); }
  catch (err) { res.status(400).json({ error: 'delete_failed', message: err.message }); }
});

// 룰별 이력 · 연결 법령
router.get('/rules/:ruleId/history', (req, res) => res.json(ruleHistory(req.params.ruleId)));
router.get('/rules/:ruleId/laws', (req, res) => res.json(lawsForRule(req.params.ruleId)));

router.delete('/rules/:ruleId', (req, res) => {
  const before = db.prepare('SELECT * FROM rules WHERE id=?').get(req.params.ruleId);
  db.prepare('DELETE FROM rules WHERE id=?').run(req.params.ruleId);
  if (before) logChange({ rule_id: req.params.ruleId, ruleset_id: before.ruleset_id, field: 'deleted', old_value: before.title, source: 'user_edit' });
  res.json({ ok: true });
});

// 룰셋 전체 이력
router.get('/:id/history', (req, res) => res.json(rulesetHistory(req.params.id)));

// 지식그래프 · 근거 추적 (요구사항 B)
router.get('/:id/graph', (req, res) => {
  const g = buildGraph(req.params.id);
  if (!g) return res.status(404).json({ error: 'not_found' });
  res.json(g);
});
router.get('/rules/:ruleId/provenance', (req, res) => {
  const p = provenance(req.params.ruleId);
  if (!p) return res.status(404).json({ error: 'not_found' });
  res.json(p);
});

// AI 스키마 제안 (AutoSchemaKG 방법론 · 저작 보조) — 내규 DIFF로 빠진 개념 제안
router.get('/:id/proposals', (req, res) => {
  const p = buildProposals(req.params.id);
  if (!p) return res.status(404).json({ error: 'not_found' });
  res.json(p);
});
router.post('/:id/proposals/accept', (req, res) => {
  try { res.json(acceptProposal(Number(req.params.id), req.body?.tag, req.body?.chunk_id)); }
  catch (err) { res.status(400).json({ error: 'accept_failed', message: err.message }); }
});
router.post('/:id/proposals/dismiss', (req, res) => res.json(dismissProposal(Number(req.params.id), req.body?.tag)));

// 근거 신뢰도 · 근거 경로 (TrustGraph 개념)
router.get('/:id/trust', (req, res) => res.json(rulesetTrust(req.params.id)));
router.get('/rules/:ruleId/trustpath', (req, res) => {
  const t = trustPath(req.params.ruleId);
  if (!t) return res.status(404).json({ error: 'not_found' });
  res.json(t);
});

// 지식그래프(AutoSchemaKG 방법론) — 스키마 유도·조회
router.post('/:id/kg/build', (req, res) => {
  const r = buildKG(req.params.id);
  if (!r) return res.status(404).json({ error: 'not_found' });
  res.json(r);
});
router.get('/:id/kg', (req, res) => {
  const g = getKG(req.params.id);
  if (!g) return res.status(404).json({ error: 'not_found' });
  res.json(g);
});

// --- 룰셋 메타 수정 ---
router.patch('/:id', (req, res) => {
  const fields = ['name', 'version', 'aggregate_method', 'block_threshold'];
  const set = fields.filter((f) => f in req.body);
  if (set.length)
    db.prepare(`UPDATE rulesets SET ${set.map((f) => `${f}=?`).join(',')} WHERE id=?`)
      .run(...set.map((f) => req.body[f]), req.params.id);
  res.json({ ok: true });
});

// --- 전체 승인 / 게시 ---
router.post('/:id/approve-all', (req, res) => {
  db.prepare("UPDATE rules SET status='approved' WHERE ruleset_id=?").run(req.params.id);
  res.json({ ok: true });
});

// semver patch 증가 (0.1.0 → 0.1.1)
function bumpPatch(v) {
  const m = String(v || '0.1.0').match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return '0.1.1';
  return `${m[1]}.${m[2]}.${+m[3] + 1}`;
}

router.post('/:id/publish', (req, res) => {
  const rs = db.prepare('SELECT * FROM rulesets WHERE id=?').get(req.params.id);
  if (!rs) return res.status(404).json({ error: 'not_found' });
  const approved = db.prepare("SELECT COUNT(*) c FROM rules WHERE ruleset_id=? AND status='approved'").get(req.params.id);
  if (!approved.c) return res.status(400).json({ error: 'no_approved', message: '승인된 룰이 없습니다.' });

  // ruleset_id·panel_id 는 최초 1회만 발급하고 재게시 시 유지 → ST가 같은 id로 계속 로드
  const rsUid = rs.ruleset_id || uid('RSET');
  const panelUid = rs.panel_id || uid('JPNL');
  const version = rs.status === 'published' ? bumpPatch(rs.version) : rs.version; // 재게시면 버전만 올림
  db.prepare("UPDATE rulesets SET status='published', ruleset_id=?, panel_id=?, version=?, published_at=datetime('now') WHERE id=?")
    .run(rsUid, panelUid, version, req.params.id);

  // rule_uid 는 아직 없는 승인 룰만 발급(기존 룰 id 유지)
  const rules = db.prepare("SELECT id FROM rules WHERE ruleset_id=? AND status='approved' AND (rule_uid IS NULL OR rule_uid='')").all(req.params.id);
  const setUid = db.prepare('UPDATE rules SET rule_uid=? WHERE id=?');
  db.transaction(() => rules.forEach((r) => setUid.run(uid('RULE'), r.id)))();

  res.json({ ok: true, ruleset_id: rsUid, version, republished: rs.status === 'published' });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM rules WHERE ruleset_id=?').run(req.params.id);
  db.prepare('DELETE FROM rulesets WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
