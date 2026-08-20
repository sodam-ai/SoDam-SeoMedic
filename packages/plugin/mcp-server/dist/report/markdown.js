import { buildSummary, sortByImpact } from "./summary.js";
const SEVERITY_EMOJI = { critical: "🔴", high: "🟠", medium: "🟡", low: "⚪" };
function escapeTableCell(value) {
    if (value === null)
        return "-";
    return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
/**
 * overall_score는 숫자로 절대 노출하지 않고 라벨(양호/주의/위험)만 보여준다(02_DATA_MODEL 결정).
 * CWV는 매 페이지 섹션마다 "lab 값이며 field(CrUX)와 다름"을 명시한다(01_PRD 성공기준).
 */
export function buildMarkdownReport(input) {
    const summary = buildSummary(input);
    const lines = [];
    lines.push(`# SEO 진단 리포트 — ${input.target}`);
    lines.push("");
    lines.push(`생성 시각: ${input.generatedAt}`);
    lines.push("");
    lines.push(`**종합 상태: ${summary.overallLabel}** _(참고용 라벨입니다 — 절대 점수가 아닙니다)_`);
    lines.push("");
    lines.push(`- 진단 페이지 수: ${summary.totalPages}`);
    lines.push(`- 총 위반 건수: ${summary.totalViolations}`);
    lines.push("");
    // 진단 페이지가 0개면 위반도 0건이라 종합 상태가 "양호"로 계산되지만, 실제로는 사이트에
    // 접속조차 못 했을 가능성이 크다(실측: 존재하지 않는 도메인 진단 시 재현됨). "양호" 라벨만
    // 보고 오해하지 않도록 별도 경고를 덧붙인다(라벨 자체는 기존 동작 유지 — 하위 호환).
    if (summary.totalPages === 0) {
        lines.push(`> ⚠️ 진단한 페이지가 0개입니다 — "양호"는 위반이 없다는 뜻이 아니라 확인할 페이지 자체를 찾지 못했다는 뜻입니다. URL 철자와 사이트 접속 가능 여부를 확인해주세요.`);
        lines.push("");
    }
    // 사이트 전체 요약값이라 페이지별 섹션보다 앞, summary 바로 다음에 둔다. 설정 안 했으면(gsc·gscError
    // 둘 다 undefined) 아무것도 안 보여준다 — 선택 기능이 안내문으로 리포트를 어지럽히지 않게(YAGNI).
    if (input.gsc) {
        lines.push("## 검색 성과 (Google Search Console, 최근 28일)");
        lines.push("");
        lines.push(`| 지표 | 값 |`);
        lines.push(`|---|---|`);
        lines.push(`| 클릭수 | ${input.gsc.clicks} |`);
        lines.push(`| 노출수 | ${input.gsc.impressions} |`);
        lines.push(`| 평균 게재순위 | ${input.gsc.position.toFixed(1)} |`);
        lines.push("");
    }
    else if (input.gscError) {
        lines.push(`> ⚠️ Google Search Console 연동을 시도했지만 실패했습니다: ${input.gscError}`);
        lines.push("");
    }
    if (input.ga4) {
        lines.push("## 방문자 통계 (Google Analytics 4, 최근 28일)");
        lines.push("");
        lines.push(`| 지표 | 값 |`);
        lines.push(`|---|---|`);
        lines.push(`| 세션수 | ${input.ga4.sessions} |`);
        lines.push(`| 활성 사용자수 | ${input.ga4.activeUsers} |`);
        lines.push("");
    }
    else if (input.ga4Error) {
        lines.push(`> ⚠️ Google Analytics 4 연동을 시도했지만 실패했습니다: ${input.ga4Error}`);
        lines.push("");
    }
    for (const page of input.pages) {
        lines.push(`## ${page.url}`);
        lines.push("");
        lines.push(`HTTP 상태: \`${page.statusCode}\``);
        lines.push("");
        if (page.cwv) {
            lines.push("### Core Web Vitals (lab 측정)");
            lines.push("");
            lines.push(`> ⚠️ 아래 값은 Lighthouse **lab 값**(3회 측정 중앙값)입니다. Google 검색 랭킹에 실제로 쓰이는 **field(CrUX) 데이터와 다를 수 있습니다.**`);
            lines.push("");
            lines.push(`| 지표 | 값 |`);
            lines.push(`|---|---|`);
            lines.push(`| LCP | ${page.cwv.lcpMs != null ? Math.round(page.cwv.lcpMs) + "ms" : "측정 안 됨"} |`);
            lines.push(`| CLS | ${page.cwv.clsUnitless != null ? page.cwv.clsUnitless.toFixed(3) : "측정 안 됨"} |`);
            lines.push(`| INP 근사치(TBT) | ${page.cwv.inpProxyTbtMs != null ? Math.round(page.cwv.inpProxyTbtMs) + "ms" : "측정 안 됨"} |`);
            lines.push("");
        }
        if (page.fieldData) {
            lines.push("### Core Web Vitals (field — 실사용자 CrUX 데이터)");
            lines.push("");
            lines.push(`> ${page.fieldData.note}`);
            lines.push("");
            lines.push(`| 지표 | 값 |`);
            lines.push(`|---|---|`);
            lines.push(`| LCP | ${page.fieldData.lcpMs != null ? Math.round(page.fieldData.lcpMs) + "ms" : "데이터 없음"} |`);
            lines.push(`| CLS | ${page.fieldData.clsUnitless != null ? page.fieldData.clsUnitless.toFixed(3) : "데이터 없음"} |`);
            lines.push(`| INP | ${page.fieldData.inpMs != null ? Math.round(page.fieldData.inpMs) + "ms" : "데이터 없음"} |`);
            lines.push("");
        }
        const sorted = sortByImpact(page.violations);
        if (sorted.length === 0) {
            lines.push("위반 사항 없음.");
            lines.push("");
            continue;
        }
        lines.push("### 위반 사항 (임팩트 순)");
        lines.push("");
        lines.push("| 심각도 | 규칙 ID | 카테고리 | 현재 값 | 권장 조치 |");
        lines.push("|---|---|---|---|---|");
        for (const v of sorted) {
            const emoji = SEVERITY_EMOJI[v.severity] ?? "";
            lines.push(`| ${emoji} ${v.severity} | \`${v.ruleId}\` | ${v.category} | ${escapeTableCell(v.currentValue)} | ${escapeTableCell(v.recommendedValue)} |`);
        }
        lines.push("");
    }
    lines.push("---");
    lines.push("_이 리포트는 분석 전용입니다. 어떤 소스 파일도 수정되지 않았습니다._");
    return lines.join("\n");
}
//# sourceMappingURL=markdown.js.map