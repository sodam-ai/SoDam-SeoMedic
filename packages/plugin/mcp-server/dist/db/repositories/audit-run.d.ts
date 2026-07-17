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
export declare function startAuditRun(db: SeomedicDb, projectId: number, scope: AuditRunRecord["scope"]): AuditRunRecord;
export declare function finishAuditRun(db: SeomedicDb, auditRunId: number, overallScore: number | null): void;
export declare function setRenderSource(db: SeomedicDb, auditRunId: number, renderSource: string): void;
export declare function findAuditRunById(db: SeomedicDb, id: number): AuditRunRecord | undefined;
export declare function findLatestAuditRunByProject(db: SeomedicDb, projectId: number): AuditRunRecord | undefined;
