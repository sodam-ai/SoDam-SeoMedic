import type { AuditReportInput } from "./types.js";
import { buildSummary, sortByImpact } from "./summary.js";

const SEVERITY_EMOJI: Record<string, string> = { critical: "🔴", high: "🟠", medium: "🟡", low: "⚪" };

function escapeTableCell(value: string | null): string {
  if (value === null) return "-";
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/**
 * overall_score는 숫자로 절대 노출하지 않고 라벨(양호/주의/위험)만 보여준다(02_DATA_MODEL 결정).
 * CWV는 매 페이지 섹션마다 "lab 값이며 field(CrUX)와 다름"을 명시한다(01_PRD 성공기준).
 */
export function buildMarkdownReport(input: AuditReportInput): string {
  const summary = buildSummary(input);
  const lines: string[] = [];

  lines.push(`# SEO 진단 리포트 — ${input.target}`);
  lines.push("");
  lines.push(`생성 시각: ${input.generatedAt}`);
  lines.push("");
  lines.push(`**종합 상태: ${summary.overallLabel}** _(참고용 라벨입니다 — 절대 점수가 아닙니다)_`);
  lines.push("");
  lines.push(`- 진단 페이지 수: ${summary.totalPages}`);
  lines.push(`- 총 위반 건수: ${summary.totalViolations}`);
  lines.push("");

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
      lines.push(
        `| ${emoji} ${v.severity} | \`${v.ruleId}\` | ${v.category} | ${escapeTableCell(v.currentValue)} | ${escapeTableCell(v.recommendedValue)} |`,
      );
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("_이 리포트는 분석 전용입니다. 어떤 소스 파일도 수정되지 않았습니다._");

  return lines.join("\n");
}
