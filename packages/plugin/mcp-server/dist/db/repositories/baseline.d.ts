import type { SeomedicDb } from "../connection.js";
import type { FindingRecord } from "./finding.js";
export interface BaselineSnapshotEntry {
    category: string;
    severity: string;
    status: string;
}
export type BaselineSnapshot = Record<string, BaselineSnapshotEntry>;
export interface BaselineRecord {
    id: number;
    project_id: number;
    snapshot: string;
    created_by: "auto" | "user_ack";
    created_at: string;
}
export declare function buildSnapshot(findings: FindingRecord[]): BaselineSnapshot;
/**
 * 이 함수는 오직 사용자가 명시적으로 요청했을 때만 호출해야 한다(02_DATA_MODEL 결정:
 * "Baseline → 사용자 명시 저장, 자동 생성 X — 실수 베이스라인 방지"). audit 완료 후
 * 자동으로 이 함수를 부르면 안 된다 — 호출 시점 판단은 이 리포지토리가 아니라
 * 상위 오케스트레이션(M8 CLI/MCP)의 책임이다.
 */
export declare function createBaseline(db: SeomedicDb, projectId: number, findings: FindingRecord[], createdBy: "auto" | "user_ack"): BaselineRecord;
export declare function findBaselineById(db: SeomedicDb, id: number): BaselineRecord | undefined;
export declare function findLatestBaseline(db: SeomedicDb, projectId: number): BaselineRecord | undefined;
