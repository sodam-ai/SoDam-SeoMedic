import type { SeomedicDb } from "../connection.js";
import type { RuleViolation } from "../../rules/types.js";
import { computeFindingKey } from "../../regression/finding-key.js";

export type FindingStatus = "open" | "fixed" | "reverted" | "acknowledged" | "ignored";

export interface FindingRecord {
  id: number;
  finding_key: string;
  audit_run_id: number;
  category: string;
  rule_id: string;
  rule_version: number;
  severity: string;
  page_url: string;
  current_value: string | null;
  recommended_value: string | null;
  status: FindingStatus;
}

export function insertFinding(db: SeomedicDb, auditRunId: number, violation: RuleViolation): FindingRecord {
  const findingKey = computeFindingKey(violation.pageUrl, violation.ruleId, violation.ruleVersion);
  const result = db
    .prepare(
      `INSERT INTO finding (finding_key, audit_run_id, category, rule_id, rule_version, severity, page_url, current_value, recommended_value, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
    )
    .run(
      findingKey,
      auditRunId,
      violation.category,
      violation.ruleId,
      violation.ruleVersion,
      violation.severity,
      violation.pageUrl,
      violation.currentValue,
      violation.recommendedValue,
    );
  return findFindingById(db, Number(result.lastInsertRowid))!;
}

export function insertFindings(db: SeomedicDb, auditRunId: number, violations: RuleViolation[]): FindingRecord[] {
  return violations.map((v) => insertFinding(db, auditRunId, v));
}

export function findFindingById(db: SeomedicDb, id: number): FindingRecord | undefined {
  return db.prepare(`SELECT * FROM finding WHERE id = ?`).get(id) as FindingRecord | undefined;
}

export function findFindingsByAuditRun(db: SeomedicDb, auditRunId: number): FindingRecord[] {
  return db.prepare(`SELECT * FROM finding WHERE audit_run_id = ?`).all(auditRunId) as FindingRecord[];
}

export function updateFindingStatus(db: SeomedicDb, id: number, status: FindingStatus): void {
  db.prepare(`UPDATE finding SET status = ? WHERE id = ?`).run(status, id);
}
