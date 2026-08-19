import type { RuleViolation } from "../rules/types.js";
import { type MissingSitemapResult } from "../fixers/sitemap-finding.js";
import { type AiCrawlerAccessReport } from "../crawler/ai-crawler-policy.js";
export interface ScannedPage {
    logicalUrl: string;
    realUrl: string;
    statusCode: number;
    rawHtml: string;
    violations: RuleViolation[];
    /** 렌더링된 DOM의 canonical 값(R-CANONICAL-JS-ONLY fixer가 raw HTML로 이전할 때 그대로 보존해야
     * 하는 값 — 렌더 실패 시 rawSignals로 폴백되므로 그 경우 raw canonical과 동일해진다). */
    renderedCanonical: string | null;
    /** 렌더링된 DOM의 title 값(R-OG-BASIC-MISSING fixer가 openGraph.title로 복사할 소스 — 동일하게
     * 렌더 실패 시 rawSignals로 폴백된다). */
    renderedTitle: string | null;
}
export interface LocalFixScanResult {
    pages: ScannedPage[];
    allViolations: RuleViolation[];
    sitemap: MissingSitemapResult;
    aiCrawlerAccess: AiCrawlerAccessReport | null;
    truncated: boolean;
}
/**
 * 로컬 렌더 브릿지(origin)를 대상으로 크롤+렌더+규칙평가를 수행한다(Phase 1 audit-orchestrator.ts의
 * runAudit()과 같은 구조지만, safeFetch/assertSafeUrl 대신 로컬 브릿지 전용 경로를 쓴다 — 그 경로들이
 * 127.0.0.1을 SSRF로 차단해 그대로 재사용할 수 없음이 설계 검토에서 확인됨).
 *
 * CWV(Lighthouse)는 의도적으로 측정하지 않는다 — 지금 유일한 fixer(sitemap 누락 URL 추가)는 CWV와
 * 무관하고, RuleContext.cwv는 optional이라 없어도 cwv 규칙만 조용히 skip된다(Phase 1의 depth>0 페이지
 * 처리와 동일 원칙). CWV에 실제 영향을 주는 fixer가 생기면 그때 추가한다(과잉 구현 방지 결정).
 */
export declare function scanLocalFix(origin: string, opts?: {
    maxPages?: number;
    maxDepth?: number;
}): Promise<LocalFixScanResult>;
