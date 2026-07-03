import type { FixRecord } from "../db/repositories/fix.js";
import type { FindingRecord } from "../db/repositories/finding.js";

/**
 * fix마다 브랜치명이 결정론적이어야 한다 — 매번 랜덤(예: 타임스탬프·UUID 포함)이면 duplicate-guard.ts가
 * "이미 같은 문제로 PR을 냈는지"를 판단할 기준 자체가 사라진다(설계 검토에서 확인된 핵심 전제).
 * rule_id만으로 결정하는 이유: 같은 프로젝트에서 같은 rule_id 문제는 항상 같은 브랜치로 수렴시켜,
 * 재스캔해도 새 브랜치가 계속 늘어나지 않게 한다(PR 스팸 방지 원칙과 직결).
 */
export function buildFixBranchName(ruleId: string): string {
  const slug = ruleId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `seomedic/fix-${slug}`;
}

export interface PrContent {
  title: string;
  body: string;
}

/**
 * PR 본문에는 "무엇을 왜 바꿨는지"(법률 L8 accountability)와 함께, add_safe도 그냥 병합해도 되는
 * 무해한 변경이 아니라 사람이 diff를 검토해야 한다는 점을 명시한다(DO-NOT: "safe니까 무해 가정 금지").
 */
export function buildPrContent(fixes: Array<{ fix: FixRecord; finding: FindingRecord }>): PrContent {
  const title = fixes.length === 1
    ? `[SeoMedic] ${fixes[0].finding.rule_id} 수정 제안`
    : `[SeoMedic] SEO 문제 ${fixes.length}건 수정 제안`;

  const lines: string[] = [
    "SeoMedic이 자동 진단 후 제안하는 수정입니다. **병합 전 아래 diff를 직접 검토해주세요** —",
    "add_safe로 분류된 항목도 실제 파일 변경이며, 무해함을 보장하지 않습니다.",
    "",
    "## 변경 내역",
  ];
  for (const { fix, finding } of fixes) {
    lines.push(
      `- **${finding.rule_id}**(${fix.risk_level}) — ${finding.page_url}`,
      `  - 현재: ${finding.current_value ?? "없음"}`,
      `  - 권장: ${finding.recommended_value ?? "-"}`,
      `  - 대상 파일: \`${fix.target_path ?? "-"}\``,
    );
  }
  lines.push(
    "",
    "## 안전 정보",
    "- 이 PR은 SeoMedic이 자동으로 생성했습니다(SeoMedic Claude Code 플러그인).",
    "- 기본 브랜치에 직접 push하지 않았고, 자동 머지도 하지 않았습니다 — 병합 여부는 저장소 관리자가 결정합니다.",
    "- 적용 전 `next build`로 재검증했습니다.",
  );

  return { title, body: lines.join("\n") };
}
