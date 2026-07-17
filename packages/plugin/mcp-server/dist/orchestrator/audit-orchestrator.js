import { crawl } from "../crawler/crawler.js";
import { loadAiCrawlerAccess } from "../crawler/robots.js";
import { buildAiCrawlerPolicyViolation } from "../crawler/ai-crawler-finding.js";
import { launchGuardedBrowser, renderAndExtractSignals } from "../render/browser-pool.js";
import { extractSignalsFromHtml } from "../render/dom-signals.js";
import { evaluateAllRules } from "../rules/registry.js";
import { measureCoreWebVitals } from "../cwv/lighthouse-runner.js";
import { openSeomedicDb } from "../db/connection.js";
import { findOrCreateProject } from "../db/repositories/project.js";
import { startAuditRun, finishAuditRun, findAuditRunById } from "../db/repositories/audit-run.js";
import { createPage } from "../db/repositories/page.js";
import { insertFindings, findFindingsByAuditRun } from "../db/repositories/finding.js";
/**
 * 크롤→렌더→규칙평가→DB저장까지 한 번의 audit 실행을 오케스트레이션한다.
 * seomedic_audit·seomedic_check 툴이 공통으로 이 함수를 쓴다(로직 중복 방지).
 *
 * CWV(Lighthouse) 샘플링 정책(M4에서 M8로 미뤄뒀던 결정, 지금 확정):
 * 사이트모드(최대 200페이지)에서 모든 페이지를 Lighthouse 3회씩 측정하면 비현실적으로 오래 걸린다
 * (페이지당 수초~수십초 x 200). 그래서 **진입 페이지(depth=0)에서만** CWV를 측정하고,
 * 나머지 페이지는 CWV 없이 규칙 검사만 한다 — 이 사실을 리포트에서 숨기지 않는다(각 페이지 cwv 필드로 명시).
 */
export async function runAudit(options) {
    const db = options.db ?? openSeomedicDb(options.projectRoot);
    const project = findOrCreateProject(db, { target: options.url, mode: "analyze", sourceAvailable: false });
    const auditRun = startAuditRun(db, project.id, "technical");
    const crawlOptions = {
        siteMode: options.siteMode ?? false,
        maxPages: options.maxPages,
        maxDepth: options.maxDepth,
        requestsPerSecond: options.requestsPerSecond,
    };
    const crawlResult = await crawl(options.url, crawlOptions);
    const browser = await launchGuardedBrowser();
    const pageReportInputs = [];
    const allViolations = [];
    // AI 크롤러(GPTBot 등) 정책은 사이트 전역 판정이라 페이지 단위 RuleContext로 표현할 수 없다
    // (fix-orchestrator/plan.ts의 sitemap 완전성 검사와 동일한 이유). robots.txt를 "가상의 페이지"로
    // 취급해 리포트에 노출한다 — 실제로 HTTP 요청해 받은 진짜 상태 코드(200/404)를 그대로 쓴다.
    // 조회 자체가 실패(5xx·네트워크오류)하면 정책을 알 수 없으므로 아무것도 만들지 않는다(추측 금지).
    const origin = new URL(options.url).origin;
    const aiCrawlerAccess = await loadAiCrawlerAccess(origin);
    if (aiCrawlerAccess) {
        const violation = buildAiCrawlerPolicyViolation(origin, aiCrawlerAccess);
        allViolations.push(violation);
        pageReportInputs.push({
            url: violation.pageUrl,
            statusCode: aiCrawlerAccess.robotsTxtFound ? 200 : 404,
            violations: [violation],
        });
    }
    try {
        for (const page of crawlResult.pages) {
            const rawSignals = extractSignalsFromHtml(page.html);
            let renderedSignals = rawSignals; // 렌더 실패 시 raw로 대체(전체 audit을 막지 않음)
            try {
                const rendered = await renderAndExtractSignals(browser, page.finalUrl);
                renderedSignals = rendered.signals;
            }
            catch {
                // 렌더링 실패(타임아웃 등)는 이 페이지의 raw/rendered 비교만 건너뛴다
            }
            let cwv;
            if (page.depth === 0) {
                try {
                    cwv = await measureCoreWebVitals(page.finalUrl);
                }
                catch {
                    // CWV 측정 실패해도 나머지 규칙 검사 결과는 유효하다
                }
            }
            const ctx = {
                pageUrl: page.url,
                statusCode: page.statusCode,
                finalUrl: page.finalUrl,
                redirectChain: page.redirectChain,
                rawSignals,
                renderedSignals,
                cwv,
            };
            const violations = evaluateAllRules(ctx);
            allViolations.push(...violations);
            createPage(db, {
                auditRunId: auditRun.id,
                url: page.url,
                statusCode: page.statusCode,
                rawHasContent: Boolean(rawSignals.title || rawSignals.h1Count > 0),
                rawHtml: page.html,
                lcpMs: cwv?.lcpMs ?? null,
                inpProxyTbtMs: cwv?.inpProxyTbtMs ?? null,
                clsUnitless: cwv?.clsUnitless ?? null,
            });
            pageReportInputs.push({ url: page.url, statusCode: page.statusCode, violations, cwv });
        }
    }
    finally {
        await browser.close();
    }
    const findings = insertFindings(db, auditRun.id, allViolations);
    finishAuditRun(db, auditRun.id, null); // overall_score는 리포트 계층에서 라벨로만 계산(DB엔 저장 안 해도 됨)
    // finishAuditRun은 UPDATE만 하고 갱신된 레코드를 반환하지 않으므로, 여기서 다시 조회해야 한다
    // (재현된 실제 버그: 재조회 없이 옛 auditRun 변수를 그대로 반환했더니 finished_at이 계속 null로 보였음).
    const finishedAuditRun = findAuditRunById(db, auditRun.id);
    const reportInput = {
        target: options.url,
        generatedAt: new Date().toISOString(),
        pages: pageReportInputs,
    };
    return {
        db,
        project,
        auditRun: finishedAuditRun,
        findings: findFindingsByAuditRun(db, auditRun.id) ?? findings,
        reportInput,
        skippedByRobots: crawlResult.skippedByRobots,
        truncated: crawlResult.truncated,
    };
}
//# sourceMappingURL=audit-orchestrator.js.map