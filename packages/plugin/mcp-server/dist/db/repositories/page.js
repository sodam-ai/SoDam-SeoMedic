import { createHash } from "node:crypto";
const EXCERPT_MAX_CHARS = 500;
export function createPage(db, input) {
    const htmlHash = createHash("sha256").update(input.rawHtml).digest("hex");
    const htmlExcerpt = input.rawHtml.slice(0, EXCERPT_MAX_CHARS);
    const result = db
        .prepare(`INSERT INTO page (audit_run_id, url, status_code, raw_has_content, rendered_diff, html_hash, html_excerpt, lcp_ms, inp_proxy_tbt_ms, cls_unitless)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(input.auditRunId, input.url, input.statusCode, input.rawHasContent ? 1 : 0, input.renderedDiff ?? null, htmlHash, htmlExcerpt, input.lcpMs ?? null, input.inpProxyTbtMs ?? null, input.clsUnitless ?? null);
    return findPageById(db, Number(result.lastInsertRowid));
}
export function findPageById(db, id) {
    return db.prepare(`SELECT * FROM page WHERE id = ?`).get(id);
}
export function findPagesByAuditRun(db, auditRunId) {
    return db.prepare(`SELECT * FROM page WHERE audit_run_id = ?`).all(auditRunId);
}
//# sourceMappingURL=page.js.map