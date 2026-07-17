export function buildSnapshot(findings) {
    const snapshot = {};
    for (const f of findings) {
        snapshot[f.finding_key] = { category: f.category, severity: f.severity, status: f.status };
    }
    return snapshot;
}
/**
 * 이 함수는 오직 사용자가 명시적으로 요청했을 때만 호출해야 한다(02_DATA_MODEL 결정:
 * "Baseline → 사용자 명시 저장, 자동 생성 X — 실수 베이스라인 방지"). audit 완료 후
 * 자동으로 이 함수를 부르면 안 된다 — 호출 시점 판단은 이 리포지토리가 아니라
 * 상위 오케스트레이션(M8 CLI/MCP)의 책임이다.
 */
export function createBaseline(db, projectId, findings, createdBy) {
    const snapshot = JSON.stringify(buildSnapshot(findings));
    const now = new Date().toISOString();
    const result = db
        .prepare(`INSERT INTO baseline (project_id, snapshot, created_by, created_at) VALUES (?, ?, ?, ?)`)
        .run(projectId, snapshot, createdBy, now);
    return findBaselineById(db, Number(result.lastInsertRowid));
}
export function findBaselineById(db, id) {
    return db.prepare(`SELECT * FROM baseline WHERE id = ?`).get(id);
}
export function findLatestBaseline(db, projectId) {
    return db.prepare(`SELECT * FROM baseline WHERE project_id = ? ORDER BY id DESC LIMIT 1`).get(projectId);
}
//# sourceMappingURL=baseline.js.map