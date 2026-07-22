// 법령 저장·변경감지 — API에서 받은 조문을 laws에 적재하고 개정을 승인 큐로 넘긴다.
//
// 핵심 원칙: 개정이 감지돼도 laws를 즉시 덮어쓰지 않는다.
// law_updates에 pending으로 쌓고, 사용자가 승인해야 본문이 교체된다. (요구사항 4)
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
const insUpd = db.prepare(`
  INSERT INTO law_updates (law_id, old_hash, new_hash, old_content, new_content, affected_rules)
  VALUES (@law_id,@old_hash,@new_hash,@old_content,@new_content,@affected_rules)`);
const dupUpd = db.prepare(
  "SELECT id FROM law_updates WHERE law_id=? AND new_hash=? AND status='pending'"
);
const countRules = db.prepare('SELECT COUNT(*) c FROM rule_laws WHERE law_id=?');

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
      // 개정 감지 — 같은 내용의 pending이 이미 있으면 중복 생성하지 않는다.
      if (!dupUpd.get(cur.id, a.content_hash)) {
        insUpd.run({
          law_id: cur.id,
          old_hash: cur.content_hash,
          new_hash: a.content_hash,
          old_content: cur.content,
          new_content: a.content,
          affected_rules: countRules.get(cur.id).c,
        });
      }
      result.changed++;
      result.details.push({ article_no: a.article_no, title: a.article_title });
    }
  });
  tx();
  return result;
}

// 승인 — 이때 비로소 본문이 교체되고, 스냅샷과 이력이 남는다.
export function approveUpdate(id, actor = 'admin') {
  const u = db.prepare("SELECT * FROM law_updates WHERE id=? AND status='pending'").get(id);
  if (!u) throw new Error('대기 중인 갱신 건이 아닙니다');
  const law = db.prepare('SELECT * FROM laws WHERE id=?').get(u.law_id);

  const tx = db.transaction(() => {
    db.prepare(
      "UPDATE laws SET content=?, content_hash=?, fetched_at=datetime('now') WHERE id=?"
    ).run(u.new_content, u.new_hash, u.law_id);
    insVer.run(u.law_id, u.new_content, law.effective_date, u.new_hash);
    db.prepare(
      "UPDATE law_updates SET status='approved', reviewed_at=datetime('now'), reviewed_by=? WHERE id=?"
    ).run(actor, id);

    // 이 조문을 참조하는 룰에 이력을 남긴다 — 룰 본문은 사람이 판단해 고치도록 둔다.
    const affected = db.prepare('SELECT rule_id FROM rule_laws WHERE law_id=?').all(u.law_id);
    const insHist = db.prepare(`
      INSERT INTO rule_history (rule_id, field, old_value, new_value, source, law_update_id, actor)
      VALUES (?,?,?,?,'law_update',?,?)`);
    for (const { rule_id } of affected) {
      insHist.run(rule_id, 'law_basis', `${law.law_name} ${law.article_no} (개정 전)`,
        `${law.law_name} ${law.article_no} (개정 반영)`, id, actor);
    }
  });
  tx();
  return { ok: true, law: `${law.law_name} ${law.article_no}` };
}

export function rejectUpdate(id, actor = 'admin', note = '') {
  const r = db.prepare(
    "UPDATE law_updates SET status='rejected', reviewed_at=datetime('now'), reviewed_by=?, note=? WHERE id=? AND status='pending'"
  ).run(actor, note, id);
  if (!r.changes) throw new Error('대기 중인 갱신 건이 아닙니다');
  return { ok: true };
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

// 법령 변경 이력 타임라인 — 수집·개정반영·감지·반려를 한 줄기로 합친다.
// 최초 수집은 한 법령당 조문 수만큼(수십~수백 건) 스냅샷이 동시에 생기므로
// 분 단위로 묶어 "n개 조문 수집" 한 건으로 보여준다. 개정은 조문 단위가 의미 있어 개별로 둔다.
export function lawHistory(limit = 200) {
  const collected = db.prepare(`
    SELECT l.law_key, l.law_name, substr(v.captured_at, 1, 16) at, COUNT(*) n
    FROM law_versions v JOIN laws l ON l.id = v.law_id
    WHERE v.id = (SELECT MIN(id) FROM law_versions WHERE law_id = v.law_id)
    GROUP BY l.law_key, l.law_name, substr(v.captured_at, 1, 16)`).all();

  const updated = db.prepare(`
    SELECT l.law_key, l.law_name, l.article_no, l.article_title, l.id law_id,
           v.captured_at at, v.id version_id,
           (SELECT u.reviewed_by FROM law_updates u
             WHERE u.law_id = v.law_id AND u.new_hash = v.content_hash AND u.status = 'approved'
             ORDER BY u.id DESC LIMIT 1) actor,
           (SELECT u.affected_rules FROM law_updates u
             WHERE u.law_id = v.law_id AND u.new_hash = v.content_hash AND u.status = 'approved'
             ORDER BY u.id DESC LIMIT 1) affected_rules
    FROM law_versions v JOIN laws l ON l.id = v.law_id
    WHERE v.id <> (SELECT MIN(id) FROM law_versions WHERE law_id = v.law_id)`).all();

  // 승인된 건은 위 '개정 반영'으로 이미 잡히므로 여기선 대기·반려만
  const queued = db.prepare(`
    SELECT u.id update_id, u.status, u.affected_rules, u.note, u.reviewed_by actor,
           COALESCE(u.reviewed_at, u.detected_at) at,
           l.law_key, l.law_name, l.article_no, l.article_title, l.id law_id
    FROM law_updates u JOIN laws l ON l.id = u.law_id
    WHERE u.status IN ('pending', 'rejected')`).all();

  return [
    ...collected.map((r) => ({ kind: 'collected', ...r })),
    ...updated.map((r) => ({ kind: 'updated', ...r })),
    ...queued.map((r) => ({ kind: r.status === 'pending' ? 'detected' : 'rejected', ...r })),
  ]
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, limit);
}

export function listUpdates(status = 'pending') {
  return db.prepare(`
    SELECT u.*, l.law_name, l.article_no, l.article_title
    FROM law_updates u JOIN laws l ON l.id=u.law_id
    WHERE u.status=? ORDER BY u.detected_at DESC`).all(status);
}
