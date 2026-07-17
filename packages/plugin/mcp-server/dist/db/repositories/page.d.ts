import type { SeomedicDb } from "../connection.js";
export interface PageRecord {
    id: number;
    audit_run_id: number;
    url: string;
    status_code: number;
    raw_has_content: number;
    rendered_diff: string | null;
    html_hash: string;
    html_excerpt: string | null;
    lcp_ms: number | null;
    inp_proxy_tbt_ms: number | null;
    cls_unitless: number | null;
}
export interface CreatePageInput {
    auditRunId: number;
    url: string;
    statusCode: number;
    rawHasContent: boolean;
    /** 원문 전체는 절대 저장하지 않는다(법률 L4) — 이 함수 내부에서 해시+짧은 요약으로만 변환한다. */
    rawHtml: string;
    renderedDiff?: string | null;
    lcpMs?: number | null;
    inpProxyTbtMs?: number | null;
    clsUnitless?: number | null;
}
export declare function createPage(db: SeomedicDb, input: CreatePageInput): PageRecord;
export declare function findPageById(db: SeomedicDb, id: number): PageRecord | undefined;
export declare function findPagesByAuditRun(db: SeomedicDb, auditRunId: number): PageRecord[];
