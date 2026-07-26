import type { SeomedicDb } from "../connection.js";
export type FixType = "file_edit" | "pr" | "report_only";
export type FixRiskLevel = "add_safe" | "gated";
export type FixApprovalStatus = "pending" | "approved" | "rejected" | "auto";
export interface FixRecord {
    id: number;
    finding_id: number;
    fix_type: FixType;
    risk_level: FixRiskLevel;
    target_path: string | null;
    dry_run_diff: string;
    validation: string | null;
    idempotency_marker: string | null;
    approval_status: FixApprovalStatus;
    applied_at: string | null;
    backup_path: string | null;
}
export interface InsertFixInput {
    findingId: number;
    fixType: FixType;
    riskLevel: FixRiskLevel;
    /** add_safe는 오케스트레이터가 'auto'로, gated는 'pending'으로 넣는다(호출부 책임 — 이 함수는 강제하지 않음). */
    approvalStatus: FixApprovalStatus;
    dryRunDiff: string;
    targetPath?: string | null;
    validation?: string | null;
    idempotencyMarker?: string | null;
}
export declare function insertFix(db: SeomedicDb, input: InsertFixInput): FixRecord;
export declare function findFixById(db: SeomedicDb, id: number): FixRecord | undefined;
export declare function findFixesByFinding(db: SeomedicDb, findingId: number): FixRecord[];
export declare function findPendingFixes(db: SeomedicDb): FixRecord[];
export interface FixWithFindingRecord extends FixRecord {
    finding_key: string;
    page_url: string;
    rule_id: string;
}
/**
 * apply 단계가 "이번 plan에서 지금 적용 가능한 fix"를 한 번에 조회하는 용도(finding을 JOIN해
 * audit_run_id로 스코프한다). auto/approved이면서 아직 적용 안 된(applied_at IS NULL) 것만 반환 —
 * apply 재호출 시 이미 적용된 fix를 중복으로 다시 쓰지 않기 위한 멱등성 보장의 일부.
 */
export declare function findApplicableFixesByAuditRun(db: SeomedicDb, auditRunId: number): FixWithFindingRecord[];
/**
 * pending 상태에서만 approved/rejected로 전이 가능(상태머신 보호 — 이미 처리된 fix의 재승인/재거부 차단).
 * changed=false면 이미 pending이 아니었다는 뜻(호출부가 "이미 처리됨"으로 안내해야 함).
 */
export declare function setApprovalStatus(db: SeomedicDb, id: number, newStatus: "approved" | "rejected"): {
    changed: boolean;
    fix: FixRecord | undefined;
};
/**
 * approval_status가 auto/approved일 때만 적용 상태를 기록한다(승인 게이트를 이 UPDATE 자체에도 걸어
 * 오케스트레이터의 조회 실수에 대한 방어를 이중화). changed=false면 승인되지 않은 fix에 대한 적용 시도.
 */
export declare function markApplied(db: SeomedicDb, id: number, appliedAt: string, backupPath: string | null): {
    changed: boolean;
    fix: FixRecord | undefined;
};
/** rollback 전용 — 적용됐던 fix를 "미적용" 상태로 되돌린다(이력은 dry_run_diff/backup_path에 남는다). */
export declare function clearApplied(db: SeomedicDb, id: number): void;
