import type { Rule, RuleViolation } from "../types.js";

const RULE_ID = "R-NOINDEX-DETECTED";
const VERSION = 1;

/**
 * 렌더링된(최종) DOM 기준 noindex 여부를 판정한다 — 검색엔진은 결국 실행된 페이지를 인덱싱 판단에
 * 반영하므로 rendered가 최종 권위 있는 값이다. 의도된 설정일 수도 있어 severity는 medium(정보성).
 */
export const noindexDetectedRule: Rule = {
  id: RULE_ID,
  version: VERSION,
  category: "indexing",
  evaluate(ctx): RuleViolation | null {
    if (ctx.statusCode !== 200) return null;
    const robots = ctx.renderedSignals.metaRobots?.toLowerCase() ?? "";
    if (!robots.includes("noindex")) return null;
    return {
      ruleId: RULE_ID,
      ruleVersion: VERSION,
      category: "indexing",
      severity: "medium",
      pageUrl: ctx.pageUrl,
      currentValue: ctx.renderedSignals.metaRobots,
      recommendedValue: "의도된 설정이 아니면 noindex 제거",
    };
  },
};

const RULE_ID_VARIANT = "R-NOINDEX-VARIANT-DETECTED";

/** robots 계열 메타의 content를 지시어 토큰으로 쪼갠다("NoIndex, nofollow" → ["noindex","nofollow"]). */
function directiveTokens(content: string | null): string[] {
  return (content ?? "")
    .toLowerCase()
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

/**
 * R-NOINDEX-DETECTED(v1)가 못 잡는 "noindex의 다른 표기" — 색인 제외 효과는 같지만 `noindex` 문자열이 없다.
 *  1) `<meta name="robots" content="none">` — Google 문서: none은 "noindex, nofollow"와 같다.
 *  2) `<meta name="googlebot" content="noindex">` — Googlebot 전용 지시어. name="robots"와 별개로 적용된다.
 * 1차 출처: developers.google.com/search/docs/crawling-indexing/robots-meta-tag (2026-10-11 확인, 문서 갱신일
 * 2026-03-24) — name·content 값은 대소문자 무관, 여러 지시어는 쉼표로 결합.
 *
 * 기존 규칙을 고치지 않고 새 rule_id로 분리한 이유(R1): v1의 version을 올리면 과거 finding_key가 전부
 * 무효화되어 /seo-check가 "갑자기 전부 새 문제"로 보고한다. 일반 noindex는 v1이 이미 보고하므로 같은
 * 원인을 두 번 보고하지 않도록 robots 메타에 noindex가 있으면 발화하지 않는다(한 근본원인당 한 신호).
 * report_only — noindex 제거 fixer는 v1의 `noindex` 표기만 다루며, 다른 표기까지 고치지 않는다.
 * 한계: 같은 이름의 메타가 여러 개 있으면 첫 번째만 본다(기존 metaRobots와 동일), X-Robots-Tag 헤더·
 * googlebot 외 다른 UA 토큰은 보지 않는다.
 */
export const noindexVariantDetectedRule: Rule = {
  id: RULE_ID_VARIANT,
  version: VERSION,
  category: "indexing",
  evaluate(ctx): RuleViolation | null {
    if (ctx.statusCode !== 200) return null;
    const { metaRobots, metaGooglebot } = ctx.renderedSignals;
    if ((metaRobots?.toLowerCase() ?? "").includes("noindex")) return null;

    const robotsIsNone = directiveTokens(metaRobots).includes("none");
    const googlebotTokens = directiveTokens(metaGooglebot);
    const googlebotBlocks = googlebotTokens.includes("noindex") || googlebotTokens.includes("none");
    if (!robotsIsNone && !googlebotBlocks) return null;

    const sources: string[] = [];
    if (robotsIsNone) sources.push(`robots: ${metaRobots}`);
    if (googlebotBlocks) sources.push(`googlebot: ${metaGooglebot}`);
    return {
      ruleId: RULE_ID_VARIANT,
      ruleVersion: VERSION,
      category: "indexing",
      severity: "medium",
      pageUrl: ctx.pageUrl,
      currentValue: sources.join(" · "),
      recommendedValue:
        "의도된 설정이 아니면 제거 — Google은 robots의 none(=noindex, nofollow)과 googlebot 전용 메타의 noindex를 모두 색인 제외로 처리",
    };
  },
};
