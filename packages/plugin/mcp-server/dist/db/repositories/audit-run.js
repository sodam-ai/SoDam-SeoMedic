export function startAuditRun(db, projectId, scope) {
    const now = new Date().toISOString();
    const result = db
        .prepare(`INSERT INTO audit_run (project_id, scope, started_at) VALUES (?, ?, ?)`)
        .run(projectId, scope, now);
    return findAuditRunById(db, Number(result.lastInsertRowid));
}
export function finishAuditRun(db, auditRunId, overallScore) {
    db.prepare(`UPDATE audit_run SET finished_at = ?, overall_score = ? WHERE id = ?`).run(new Date().toISOString(), overallScore, auditRunId);
}
export function setRenderSource(db, auditRunId, renderSource) {
    db.prepare(`UPDATE audit_run SET render_source = ? WHERE id = ?`).run(renderSource, auditRunId);
}
export function findAuditRunById(db, id) {
    return db.prepare(`SELECT * FROM audit_run WHERE id = ?`).get(id);
}
export function findLatestAuditRunByProject(db, projectId) {
    return db
        .prepare(`SELECT * FROM audit_run WHERE project_id = ? AND finished_at IS NOT NULL ORDER BY id DESC LIMIT 1`)
        .get(projectId);
}
//# sourceMappingURL=audit-run.js.map