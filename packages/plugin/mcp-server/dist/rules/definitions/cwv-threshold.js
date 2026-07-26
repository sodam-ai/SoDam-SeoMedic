const VERSION = 1;
// Google 공식 Core Web Vitals 임계값("Good" 상한, 필드/랩 공통 — 디바이스 프로파일 무관)
const LCP_GOOD_THRESHOLD_MS = 2500;
const CLS_GOOD_THRESHOLD = 0.1;
// Lighthouse TBT(진짜 INP 대신 쓰는 lab 근사 프록시) "Good" 상한 — 디바이스 프로파일에 따라 다름
// (모바일 200ms / 데스크톱 150ms, 출처: developer.chrome.com/docs/lighthouse/performance/lighthouse-total-blocking-time).
// 이 프로젝트의 lighthouse-runner.ts는 formFactor: "desktop"으로 고정 측정하므로 데스크톱 값을 쓴다.
const TBT_GOOD_THRESHOLD_MS = 150;
export const cwvLcpPoorRule = {
    id: "R-CWV-LCP-POOR",
    version: VERSION,
    category: "cwv",
    evaluate(ctx) {
        if (ctx.cwv?.lcpMs == null)
            return null; // CWV 미측정 페이지는 조용히 skip(강제 아님)
        if (ctx.cwv.lcpMs <= LCP_GOOD_THRESHOLD_MS)
            return null;
        return {
            ruleId: "R-CWV-LCP-POOR",
            ruleVersion: VERSION,
            category: "cwv",
            severity: "high",
            pageUrl: ctx.pageUrl,
            currentValue: `LCP ${Math.round(ctx.cwv.lcpMs)}ms (lab, 3회 중앙값)`,
            recommendedValue: `${LCP_GOOD_THRESHOLD_MS}ms 이하 목표`,
        };
    },
};
export const cwvClsPoorRule = {
    id: "R-CWV-CLS-POOR",
    version: VERSION,
    category: "cwv",
    evaluate(ctx) {
        if (ctx.cwv?.clsUnitless == null)
            return null;
        if (ctx.cwv.clsUnitless <= CLS_GOOD_THRESHOLD)
            return null;
        return {
            ruleId: "R-CWV-CLS-POOR",
            ruleVersion: VERSION,
            category: "cwv",
            severity: "high",
            pageUrl: ctx.pageUrl,
            currentValue: `CLS ${ctx.cwv.clsUnitless.toFixed(3)} (lab, 3회 중앙값)`,
            recommendedValue: `${CLS_GOOD_THRESHOLD} 이하 목표`,
        };
    },
};
/**
 * rule_id에 "INP"가 아니라 "TBT"를 쓴다 — 실제로 측정하는 값이 진짜 INP(실사용자 상호작용 필요, lab
 * 측정 불가)가 아니라 그 근사 프록시인 Total Blocking Time이기 때문(CwvMeasurement.inpProxyTbtMs
 * 필드명과 동일한 정직성 원칙). "INP를 측정한다"는 오해를 주지 않기 위한 의도적 명명.
 */
export const cwvTbtPoorRule = {
    id: "R-CWV-TBT-POOR",
    version: VERSION,
    category: "cwv",
    evaluate(ctx) {
        if (ctx.cwv?.inpProxyTbtMs == null)
            return null;
        if (ctx.cwv.inpProxyTbtMs <= TBT_GOOD_THRESHOLD_MS)
            return null;
        return {
            ruleId: "R-CWV-TBT-POOR",
            ruleVersion: VERSION,
            category: "cwv",
            severity: "high",
            pageUrl: ctx.pageUrl,
            currentValue: `TBT ${Math.round(ctx.cwv.inpProxyTbtMs)}ms (lab, 3회 중앙값 — 진짜 INP의 근사 프록시)`,
            recommendedValue: `${TBT_GOOD_THRESHOLD_MS}ms 이하 목표(데스크톱 측정 기준)`,
        };
    },
};
//# sourceMappingURL=cwv-threshold.js.map