import { computeFindingKey } from "../../regression/finding-key.js";
export function insertFinding(db, auditRunId, violation) {
    const findingKey = computeFindingKey(violation.pageUrl, violation.ruleId, violation.ruleVersion);
    const result = db
        .prepare(`INSERT INTO finding (finding_key, audit_run_id, category, rule_id, rule_version, severity, page_url, current_value, recommended_value, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`)
        .run(findingKey, auditRunId, violation.category, violation.ruleId, violation.ruleVersion, violation.severity, violation.pageUrl, violation.currentValue, violation.recommendedValue);
    return findFindingById(db, Number(result.lastInsertRowid));
}
export function insertFindings(db, auditRunId, violations) {
    return violations.map((v) => insertFinding(db, auditRunId, v));
}
export function findFindingById(db, id) {
    return db.prepare(`SELECT * FROM finding WHERE id = ?`).get(id);
}
export function findFindingsByAuditRun(db, auditRunId) {
    return db.prepare(`SELECT * FROM finding WHERE audit_run_id = ?`).all(auditRunId);
}
export function updateFindingStatus(db, id, status) {
    db.prepare(`UPDATE finding SET status = ? WHERE id = ?`).run(status, id);
}
//# sourceMappingURL=finding.js.map