/** 분류 로직(regression vs intended 판정) 자체는 M6 classify.ts의 책임 — 여기는 결과 저장만 담당. */
export function createRegressionRecord(db, projectId, baselineId, revertedKeys, classification) {
    const now = new Date().toISOString();
    const result = db
        .prepare(`INSERT INTO regression (project_id, baseline_id, reverted_keys, classification, detected_at) VALUES (?, ?, ?, ?, ?)`)
        .run(projectId, baselineId, JSON.stringify(revertedKeys), JSON.stringify(classification), now);
    return findRegressionById(db, Number(result.lastInsertRowid));
}
export function findRegressionById(db, id) {
    return db.prepare(`SELECT * FROM regression WHERE id = ?`).get(id);
}
export function findRegressionsByProject(db, projectId) {
    return db.prepare(`SELECT * FROM regression WHERE project_id = ? ORDER BY id DESC`).all(projectId);
}
//# sourceMappingURL=regression.js.map