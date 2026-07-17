const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
/** 임팩트(심각도) 순 정렬 — critical > high > medium > low. 같은 심각도끼리는 원래 순서 유지(안정 정렬). */
export function sortByImpact(violations) {
    return [...violations].sort((a, b) => (SEVERITY_RANK[a.severity] ?? 99) - (SEVERITY_RANK[b.severity] ?? 99));
}
function computeOverallLabel(bySeverity) {
    if ((bySeverity.critical ?? 0) > 0)
        return "위험";
    if ((bySeverity.high ?? 0) > 0)
        return "주의";
    return "양호";
}
export function buildSummary(input) {
    const bySeverity = {};
    let totalViolations = 0;
    for (const page of input.pages) {
        for (const v of page.violations) {
            bySeverity[v.severity] = (bySeverity[v.severity] ?? 0) + 1;
            totalViolations++;
        }
    }
    return {
        totalPages: input.pages.length,
        totalViolations,
        bySeverity,
        overallLabel: computeOverallLabel(bySeverity),
    };
}
//# sourceMappingURL=summary.js.map