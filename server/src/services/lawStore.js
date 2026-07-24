// 법령 저장·변경감지 — API에서 받은 조문을 laws에 적재하고 개정을 즉시 반영한다.
//
// 정책: 개정이 감지되면 승인 단계 없이 laws 본문을 바로 교체한다.
// 각 개정은 law_updates(status='applied')에 as-is(old_content)/to-be(new_content)로 기록되어
// 변경 이력 탭에서 확인할 수 있고, 참조 룰에는 rule_history 이력이 남는다.
import db from '../db.js';

const sel = db.prepare('SELECT * FROM laws WHERE law_key=? AND article_no=?');
const insLaw = db.prepare(`
  INSERT INTO laws (law_key, law_name, article_no, article_title, content,
                    effective_date, promulgation_date, source_url, content_hash)
  VALUES (@law_key,@law_name,@article_no,@article_title,@content,
          @effective_date,@promulgation_date,@source_url,@content_hash)`);
const insVer = db.prepare(`
  INSERT INTO law_versions (law_id, content, effective_date, content_hash)
  VALUES (?,?,?,?)`);
const touch = db.prepare("UPDATE laws SET fetched_at=datetime('now') WHERE id=?");
const updLawContent = db.prepare(
  "UPDATE laws SET content=?, content_hash=?, effective_date=?, fetched_at=datetime('now') WHERE id=?"
);
const insApplied = db.prepare(`
  INSERT INTO law_updates (law_id, old_hash, new_hash, old_content, new_content, affected_rules, status, detected_at, reviewed_at, reviewed_by)
  VALUES (@law_id,@old_hash,@new_hash,@old_content,@new_content,@affected_rules,'applied',datetime('now'),datetime('now'),'auto')`);
const insRuleHist = db.prepare(`
  INSERT INTO rule_history (rule_id, field, old_value, new_value, source, law_update_id, actor)
  VALUES (?,?,?,?,'law_update',?,'auto')`);
const affectedRuleIds = db.prepare('SELECT rule_id FROM rule_laws WHERE law_id=?');
const countRules = db.prepare('SELECT COUNT(*) c FROM rule_laws WHERE law_id=?');

// 개정 즉시 반영 — 본문 교체 · 스냅샷 · applied 기록(as-is/to-be) · 참조 룰 이력.
// 트랜잭션 안에서 호출된다.
function applyAmendment(cur, newContent, newHash, effectiveDate) {
  const affected = countRules.get(cur.id).c;
  updLawContent.run(newContent, newHash, effectiveDate ?? cur.effective_date, cur.id);
  insVer.run(cur.id, newContent, effectiveDate ?? cur.effective_date, newHash);
  const up = insApplied.run({
    law_id: cur.id, old_hash: cur.content_hash, new_hash: newHash,
    old_content: cur.content, new_content: newContent, affected_rules: affected,
  });
  for (const { rule_id } of affectedRuleIds.all(cur.id)) {
    insRuleHist.run(rule_id, 'law_basis',
      `${cur.law_name} ${cur.article_no} (개정 전)`,
      `${cur.law_name} ${cur.article_no} (개정 반영)`, up.lastInsertRowid);
  }
}

// meta/articles는 lawApi.fetchLawArticles() 결과를 그대로 받는다.
export function syncLaw(meta, articles) {
  const result = { added: 0, changed: 0, unchanged: 0, law_name: meta.law_name, details: [] };

  const tx = db.transaction(() => {
    for (const a of articles) {
      const row = {
        law_key: meta.law_key,
        law_name: meta.law_name,
        article_no: a.article_no,
        article_title: a.article_title,
        content: a.content,
        effective_date: a.effective_date,
        promulgation_date: meta.promulgation_date,
        source_url: a.source_url,
        content_hash: a.content_hash,
      };
      const cur = sel.get(meta.law_key, a.article_no);

      if (!cur) {
        const r = insLaw.run(row);
        insVer.run(r.lastInsertRowid, a.content, a.effective_date, a.content_hash); // 최초 스냅샷
        result.added++;
        continue;
      }
      if (cur.content_hash === a.content_hash) {
        touch.run(cur.id);
        result.unchanged++;
        continue;
      }
      // 개정 감지 → 즉시 반영 (승인 단계 없음)
      applyAmendment(cur, a.content, a.content_hash, a.effective_date);
      result.changed++;
      result.details.push({ article_no: a.article_no, title: a.article_title });
    }
  });
  tx();
  return result;
}

// 기존에 승인 대기(pending)로 쌓여 있던 개정을 일괄 즉시 반영한다(정책 전환 마이그레이션).
// 서버 기동 시 한 번 호출 — 이미 반영된 건이 없으면 no-op.
export function applyPendingAmendments() {
  const pend = db.prepare("SELECT * FROM law_updates WHERE status='pending'").all();
  if (!pend.length) return 0;
  const tx = db.transaction(() => {
    for (const u of pend) {
      const law = db.prepare('SELECT * FROM laws WHERE id=?').get(u.law_id);
      if (law) {
        updLawContent.run(u.new_content, u.new_hash, law.effective_date, u.law_id);
        insVer.run(u.law_id, u.new_content, law.effective_date, u.new_hash);
        for (const { rule_id } of affectedRuleIds.all(u.law_id))
          insRuleHist.run(rule_id, 'law_basis',
            `${law.law_name} ${law.article_no} (개정 전)`,
            `${law.law_name} ${law.article_no} (개정 반영)`, u.id);
      }
      db.prepare("UPDATE law_updates SET status='applied', reviewed_at=datetime('now'), reviewed_by='auto' WHERE id=?").run(u.id);
    }
  });
  tx();
  return pend.length;
}

export function listLaws() {
  // 연결된 룰 수와 대기 중 개정 건수를 함께 — 어느 법령이 실제로 쓰이고 손볼 게 있는지
  // 목록에서 바로 보이게 한다(조문을 펼쳐야만 알 수 있던 문제).
  return db.prepare(`
    SELECT l.law_key, l.law_name, COUNT(*) articles, MAX(l.fetched_at) fetched_at,
           MIN(l.effective_date) effective_date,
           (SELECT COUNT(*) FROM rule_laws rl JOIN laws l2 ON l2.id = rl.law_id
             WHERE l2.law_key = l.law_key) linked_rules,
           (SELECT COUNT(*) FROM law_updates u JOIN laws l3 ON l3.id = u.law_id
             WHERE l3.law_key = l.law_key AND u.status='pending') pending
    FROM laws l WHERE l.status='active'
    GROUP BY l.law_key, l.law_name ORDER BY l.law_name`).all();
}

export function listArticles(lawKey) {
  return db.prepare(`
    SELECT l.id, l.article_no, l.article_title, l.effective_date, l.content_hash, l.content,
           (SELECT COUNT(*) FROM rule_laws WHERE law_id=l.id) linked_rules
    FROM laws l WHERE l.law_key=? ORDER BY l.id`).all(lawKey);
}

// 법령 변경 이력 타임라인 — 수집 + 개정 반영(즉시)을 한 줄기로 합친다.
// 최초 수집은 한 법령당 조문 수만큼(수십~수백 건) 스냅샷이 동시에 생기므로
// 분 단위로 묶어 "n개 조문 수집" 한 건으로 보여준다.
// 개정 반영은 조문 단위로 as-is(old_content)/to-be(new_content) 를 함께 실어 보낸다.
export function lawHistory(limit = 200) {
  const collected = db.prepare(`
    SELECT l.law_key, l.law_name, substr(v.captured_at, 1, 16) at, COUNT(*) n
    FROM law_versions v JOIN laws l ON l.id = v.law_id
    WHERE v.id = (SELECT MIN(id) FROM law_versions WHERE law_id = v.law_id)
    GROUP BY l.law_key, l.law_name, substr(v.captured_at, 1, 16)`).all();

  // 즉시 반영된 개정 — as-is/to-be 본문 포함. (과거 수동 'approved' 건도 함께 노출)
  const updated = db.prepare(`
    SELECT u.id update_id, u.old_content, u.new_content, u.affected_rules, u.reviewed_by actor,
           COALESCE(u.reviewed_at, u.detected_at) at,
           l.law_key, l.law_name, l.article_no, l.article_title, l.id law_id
    FROM law_updates u JOIN laws l ON l.id = u.law_id
    WHERE u.status IN ('applied', 'approved')`).all();

  return [
    ...collected.map((r) => ({ kind: 'collected', ...r })),
    ...updated.map((r) => ({ kind: 'updated', ...r })),
  ]
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, limit);
}
