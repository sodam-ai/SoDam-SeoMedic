import type { SeomedicDb } from "../connection.js";

export interface AuditRunRecord {
  id: number;
  project_id: number;
  scope: "technical" | "on-page" | "all";
  render_source: string | null;
  overall_score: number | null;
  started_at: string;
  finished_at: string | null;
}

export function startAuditRun(db: SeomedicDb, projectId: number, scope: AuditRunRecord["scope"]): AuditRunRecord {
  const now = new Date().toISOString();
  const result = db
    .prepare(`INSERT INTO audit_run (project_id, scope, started_at) VALUES (?, ?, ?)`)
    .run(projectId, scope, now);
  return findAuditRunById(db, Number(result.lastInsertRowid))!;
}

export function finishAuditRun(db: SeomedicDb, auditRunId: number, overallScore: number | null): void {
  db.prepare(`UPDATE audit_run SET finished_at = ?, overall_score = ? WHERE id = ?`).run(
    new Date().toISOString(),
    overallScore,
    auditRunId,
  );
}

export function setRenderSource(db: SeomedicDb, auditRunId: number, renderSource: string): void {
  db.prepare(`UPDATE audit_run SET render_source = ? WHERE id = ?`).run(renderSource, auditRunId);
}

export function findAuditRunById(db: SeomedicDb, id: number): AuditRunRecord | undefined {
  return db.prepare(`SELECT * FROM audit_run WHERE id = ?`).get(id) as AuditRunRecord | undefined;
}

export function findLatestAuditRunByProject(db: SeomedicDb, projectId: number): AuditRunRecord | undefined {
  return db
    .prepare(`SELECT * FROM audit_run WHERE project_id = ? AND finished_at IS NOT NULL ORDER BY id DESC LIMIT 1`)
    .get(projectId) as AuditRunRecord | undefined;
}
