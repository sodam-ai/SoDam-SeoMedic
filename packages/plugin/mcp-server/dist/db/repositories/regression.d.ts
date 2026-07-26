import type { SeomedicDb } from "../connection.js";
export type RegressionClassification = Record<string, "regression" | "intended">;
export interface RegressionRecord {
    id: number;
    project_id: number;
    baseline_id: number;
    reverted_keys: string;
    classification: string;
    detected_at: string;
}
/** 분류 로직(regression vs intended 판정) 자체는 M6 classify.ts의 책임 — 여기는 결과 저장만 담당. */
export declare function createRegressionRecord(db: SeomedicDb, projectId: number, baselineId: number, revertedKeys: string[], classification: RegressionClassification): RegressionRecord;
export declare function findRegressionById(db: SeomedicDb, id: number): RegressionRecord | undefined;
export declare function findRegressionsByProject(db: SeomedicDb, projectId: number): RegressionRecord[];
