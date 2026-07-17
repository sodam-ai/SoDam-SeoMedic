/**
 * 각 fixer의 실제 입력 형태(파일 경로+누락 URL, 파일 경로+canonical 값 등)가 서로 다르므로,
 * 억지로 통일된 plan() 인터페이스를 강제하지 않는다. 오케스트레이터가 rule_id로 분기해 해당 fixer
 * 함수를 직접 호출한다. 이 레지스트리는 메타데이터(risk_level)와 rule_id 유일성 검증만 담당한다
 * (rules/registry.ts의 assertUniqueRuleIds와 동일 패턴).
 */
export const ALL_FIXERS = [
    {
        ruleId: "R-SITEMAP-MISSING-URL",
        riskLevel: "add_safe",
        description: "sitemap.ts의 정적 배열에 크롤로 발견된 누락 URL을 추가",
    },
    {
        ruleId: "R-CANONICAL-MISSING",
        riskLevel: "gated",
        // 04_PROJECT_SPEC "canonical은 예외 없이 gated" 결정 — 순수 "추가"여도 add_safe로 다루지 않는다.
        description: "정적 metadata(export const metadata)에 alternates.canonical(상대경로)을 추가 — 항상 승인 필요",
    },
    {
        ruleId: "R-CANONICAL-JS-ONLY",
        riskLevel: "gated",
        description: "정적 metadata에 JS가 이미 계산한 alternates.canonical 값을 raw HTML/소스로 이전(값 보존, 자기참조 가정 안 함) — 항상 승인 필요",
    },
    {
        ruleId: "R-OG-BASIC-MISSING",
        riskLevel: "gated",
        // PRD 04:77 "표시에 영향=gated" 원칙 적용 — canonical 오버라이드 선례와 동일(04:71 표의 add_safe를 안 따름).
        description: "정적 metadata에 openGraph.title(렌더 title 복사)·openGraph.url(페이지 canonical 값 보존)을 추가 — 값 발명 없음, 항상 승인 필요",
    },
];
function assertUniqueFixerRuleIds(fixers) {
    const seen = new Set();
    for (const fixer of fixers) {
        if (seen.has(fixer.ruleId))
            throw new Error(`중복된 fixer rule_id 발견: ${fixer.ruleId}`);
        seen.add(fixer.ruleId);
    }
}
assertUniqueFixerRuleIds(ALL_FIXERS);
export function findFixerDescriptor(ruleId) {
    return ALL_FIXERS.find((f) => f.ruleId === ruleId);
}
//# sourceMappingURL=registry.js.map