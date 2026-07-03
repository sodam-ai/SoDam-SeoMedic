export type FixRiskLevel = "add_safe" | "gated";

export interface FixerDescriptor {
  /**
   * ⚠️ 이 rule_id는 Phase 1의 rules/registry.ts(ALL_RULES, evaluateAllRules)에 등록된 것이 아니다.
   * Phase 1의 규칙엔진은 페이지 단위(RuleContext.pageUrl 하나)로만 평가하도록 설계돼 있어,
   * "sitemap에 없는 URL"처럼 사이트 전체(크롤된 페이지 목록 vs sitemap 목록) 비교가 필요한 항목은
   * 그 모델에 안 맞는다(설계 중 발견 — 억지로 rules 엔진에 끼워 맞추지 않기로 결정).
   * 그래서 이 rule_id의 Finding은 Phase 1.5 fix 오케스트레이터가 크롤 결과와
   * crawler/sitemap.ts의 fetchSitemapUrls()를 직접 비교해 **직접 생성**한다(insertFinding 재사용,
   * evaluateAllRules 미경유). finding_key 계산·DB 저장 방식은 Phase 1의 Finding과 완전히 동일하다.
   */
  ruleId: string;
  riskLevel: FixRiskLevel;
  description: string;
}

/**
 * 현재는 sitemap fixer 하나뿐이다(1.5a 범위) — 각 fixer의 실제 입력 형태(파일 경로+누락 URL 등)가
 * 서로 다르므로, 억지로 통일된 plan() 인터페이스를 강제하지 않는다. 오케스트레이터가 rule_id로
 * 분기해 해당 fixer 함수를 직접 호출한다. 이 레지스트리는 메타데이터(risk_level)와
 * rule_id 유일성 검증만 담당한다(rules/registry.ts의 assertUniqueRuleIds와 동일 패턴).
 */
export const ALL_FIXERS: FixerDescriptor[] = [
  {
    ruleId: "R-SITEMAP-MISSING-URL",
    riskLevel: "add_safe",
    description: "sitemap.ts의 정적 배열에 크롤로 발견된 누락 URL을 추가",
  },
];

function assertUniqueFixerRuleIds(fixers: FixerDescriptor[]): void {
  const seen = new Set<string>();
  for (const fixer of fixers) {
    if (seen.has(fixer.ruleId)) throw new Error(`중복된 fixer rule_id 발견: ${fixer.ruleId}`);
    seen.add(fixer.ruleId);
  }
}
assertUniqueFixerRuleIds(ALL_FIXERS);

export function findFixerDescriptor(ruleId: string): FixerDescriptor | undefined {
  return ALL_FIXERS.find((f) => f.ruleId === ruleId);
}
