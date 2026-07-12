import type { SeomedicDb } from "../connection.js";
import type { IntegrationRecord, InsertIntegrationInput } from "../../integrations/types.js";

export function insertIntegration(db: SeomedicDb, input: InsertIntegrationInput): IntegrationRecord {
  const result = db
    .prepare(
      `INSERT INTO integration (project_id, type, auth_method, credential_env_ref, property_scope)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(input.projectId, input.type, input.authMethod, input.credentialEnvRef, input.propertyScope);
  return findIntegrationById(db, Number(result.lastInsertRowid))!;
}

export function findIntegrationById(db: SeomedicDb, id: number): IntegrationRecord | undefined {
  return db.prepare(`SELECT * FROM integration WHERE id = ?`).get(id) as IntegrationRecord | undefined;
}

export function findIntegrationsByProject(db: SeomedicDb, projectId: number): IntegrationRecord[] {
  return db.prepare(`SELECT * FROM integration WHERE project_id = ?`).all(projectId) as IntegrationRecord[];
}
