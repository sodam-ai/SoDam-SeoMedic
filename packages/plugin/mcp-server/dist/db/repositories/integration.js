export function insertIntegration(db, input) {
    const result = db
        .prepare(`INSERT INTO integration (project_id, type, auth_method, credential_env_ref, property_scope)
       VALUES (?, ?, ?, ?, ?)`)
        .run(input.projectId, input.type, input.authMethod, input.credentialEnvRef, input.propertyScope);
    return findIntegrationById(db, Number(result.lastInsertRowid));
}
export function findIntegrationById(db, id) {
    return db.prepare(`SELECT * FROM integration WHERE id = ?`).get(id);
}
export function findIntegrationsByProject(db, projectId) {
    return db.prepare(`SELECT * FROM integration WHERE project_id = ?`).all(projectId);
}
//# sourceMappingURL=integration.js.map