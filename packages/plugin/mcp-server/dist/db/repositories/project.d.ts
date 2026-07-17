import type { SeomedicDb } from "../connection.js";
export interface ProjectRecord {
    id: number;
    target: string;
    mode: "analyze" | "analyze-fix";
    source_available: number;
    detected_stack: string | null;
    local_server_cmd: string | null;
    created_at: string;
}
export interface CreateProjectInput {
    target: string;
    mode: "analyze" | "analyze-fix";
    sourceAvailable: boolean;
    detectedStack?: string | null;
    localServerCmd?: string | null;
}
/** 모든 쿼리는 파라미터 바인딩만 사용한다(문자열 결합 절대 금지 — 보안 M8). */
export declare function createProject(db: SeomedicDb, input: CreateProjectInput): ProjectRecord;
export declare function findProjectById(db: SeomedicDb, id: number): ProjectRecord | undefined;
export declare function findProjectByTarget(db: SeomedicDb, target: string): ProjectRecord | undefined;
/** target(진단 대상)이 이미 있으면 그 프로젝트를 재사용하고, 없으면 새로 만든다(중복 프로젝트 방지). */
export declare function findOrCreateProject(db: SeomedicDb, input: CreateProjectInput): ProjectRecord;
