import { AI_CRAWLER_CATALOG_CONFIRMED_DATE } from "./ai-crawler-policy.js";
export const AI_CRAWLER_POLICY_RULE_ID = "R-AI-CRAWLER-POLICY";
export const AI_CRAWLER_POLICY_RULE_VERSION = 1;
const PURPOSE_LABEL = {
    training: "AI 학습용 수집",
    ai_search: "AI 답변엔진 검색 노출(예: ChatGPT·Claude·Perplexity 검색결과)",
    user_fetch: "사용자가 채팅에서 이 URL을 직접 물어봤을 때의 1회성 접근",
};
const PURPOSE_ORDER = ["training", "ai_search", "user_fetch"];
function summarizeGroup(entries, purpose) {
    const group = entries.filter((e) => e.purpose === purpose);
    const blocked = group.filter((e) => !e.allowed).map((e) => e.token);
    const allowed = group.filter((e) => e.allowed).map((e) => e.token);
    const parts = [];
    if (blocked.length > 0)
        parts.push(`차단: ${blocked.join(", ")}`);
    if (allowed.length > 0)
        parts.push(`허용: ${allowed.join(", ")}`);
    return `${PURPOSE_LABEL[purpose]} — ${parts.join(" / ")}`;
}
/**
 * 사이트 단위(페이지 단위 아님) Finding 1개만 생성한다 — rules/registry.ts의 페이지 단위 RuleContext로는
 * 표현 불가능한 판정이라(robots.txt는 사이트 전역 정책) fixers/sitemap-finding.ts와 동일한 패턴을 따른다:
 * 순수 함수가 RuleViolation을 직접 조립하고, evaluateAllRules를 거치지 않는다.
 *
 * 중립 보고만 한다 — "학습봇 차단 권장" 같은 특정 정책을 권고하지 않는다(03_PHASES.md:99가 제안한 정책
 * 채택 여부는 이 세션에서 사용자 확인을 받지 않은 별도 결정 사항이라 코드가 대신 판단하지 않는다).
 */
export function buildAiCrawlerPolicyViolation(origin, report) {
    // 구분자로 "|"를 쓰면 markdown 표 렌더링(report/markdown.ts의 escapeTableCell)이 "\|"로
    // 이스케이프해 그대로 노출된다(실측 확인된 가독성 결함) — 표 셀 안에서 안전한 "·"로 교체.
    const groupLines = PURPOSE_ORDER.map((purpose) => summarizeGroup(report.entries, purpose));
    const currentValue = report.robotsTxtFound
        ? groupLines.join(" · ")
        : `robots.txt 없음 — 모든 AI 크롤러 포함 전체 허용(사양 기본값) · ${groupLines.join(" · ")}`;
    return {
        ruleId: AI_CRAWLER_POLICY_RULE_ID,
        ruleVersion: AI_CRAWLER_POLICY_RULE_VERSION,
        category: "geo",
        severity: "low",
        pageUrl: `${origin}/robots.txt`,
        currentValue,
        recommendedValue: `정보 제공용 — 특정 차단/허용을 권장하지 않습니다. 정책 채택은 사이트 운영자 결정 사항입니다. ` +
            `(목록 기준일: ${AI_CRAWLER_CATALOG_CONFIRMED_DATE}, 공개 문서 기준 — 계속 변경될 수 있습니다)`,
    };
}
//# sourceMappingURL=ai-crawler-finding.js.map