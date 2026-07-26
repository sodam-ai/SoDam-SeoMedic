import { type SeomedicDb } from "../db/connection.js";
import { type ProjectRecord } from "../db/repositories/project.js";
import { type AuditRunRecord } from "../db/repositories/audit-run.js";
import { type FindingRecord } from "../db/repositories/finding.js";
import type { AuditReportInput } from "../report/types.js";
export interface RunAuditOptions {
    url: string;
    projectRoot: string;
    siteMode?: boolean;
    maxPages?: number;
    maxDepth?: number;
    requestsPerSecond?: number;
    /** 이미 열린 DB 핸들이 있으면 재사용한다(같은 파일에 커넥션을 중복으로 열지 않기 위함).
     *  넘기면 이 함수는 db를 닫지 않는다 — 닫기는 항상 호출자 책임(넘겼든 안 넘겼든 result.db.close()). */
    db?: SeomedicDb;
}
export interface RunAuditResult {
    db: SeomedicDb;
    project: ProjectRecord;
    auditRun: AuditRunRecord;
    findings: FindingRecord[];
    reportInput: AuditReportInput;
    skippedByRobots: string[];
    truncated: boolean;
}
/**
 * 크롤→렌더→규칙평가→DB저장까지 한 번의 audit 실행을 오케스트레이션한다.
 * seomedic_audit·seomedic_check 툴이 공통으로 이 함수를 쓴다(로직 중복 방지).
 *
 * CWV(Lighthouse) 샘플링 정책(M4에서 M8로 미뤄뒀던 결정, 지금 확정):
 * 사이트모드(최대 200페이지)에서 모든 페이지를 Lighthouse 3회씩 측정하면 비현실적으로 오래 걸린다
 * (페이지당 수초~수십초 x 200). 그래서 **진입 페이지(depth=0)에서만** CWV를 측정하고,
 * 나머지 페이지는 CWV 없이 규칙 검사만 한다 — 이 사실을 리포트에서 숨기지 않는다(각 페이지 cwv 필드로 명시).
 */
export declare function runAudit(options: RunAuditOptions): Promise<RunAuditResult>;
