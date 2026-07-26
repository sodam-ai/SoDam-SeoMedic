import type { SeomedicDb } from "../connection.js";
import type { RuleViolation } from "../../rules/types.js";
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
export declare function insertFinding(db: SeomedicDb, auditRunId: number, violation: RuleViolation): FindingRecord;
export declare function insertFindings(db: SeomedicDb, auditRunId: number, violations: RuleViolation[]): FindingRecord[];
export declare function findFindingById(db: SeomedicDb, id: number): FindingRecord | undefined;
export declare function findFindingsByAuditRun(db: SeomedicDb, auditRunId: number): FindingRecord[];
export declare function updateFindingStatus(db: SeomedicDb, id: number, status: FindingStatus): void;
