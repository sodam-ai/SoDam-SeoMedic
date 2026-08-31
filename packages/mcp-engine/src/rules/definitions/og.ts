import type { Rule, RuleViolation } from "../types.js";

const RULE_ID_OG_BASIC = "R-OG-BASIC-MISSING";
const RULE_ID_OG_DESCRIPTION = "R-OG-DESCRIPTION-MISSING";
const RULE_ID_META_DESCRIPTION = "R-META-DESCRIPTION-MISSING";
const VERSION = 1;

/**
 * og:title 또는 og:url이 없으면 발화. og:url은 복사할 canonical 자체가 없으면 침묵한다 —
 * R-CANONICAL-MISSING이 근본원인을 이미 high로 보고 중이라 중복 신호를 만들지 않는다
 * (jsonld의 MISSING/INVALID 상호배타와 동일한 "한 근본원인당 한 신호" 원칙).
 * 부재는 결함이 아니라 기회라 low로 유지(jsonLdMissingRule과 동일 보정).
 */
export const ogBasicMissingRule: Rule = {
  id: RULE_ID_OG_BASIC,
  version: VERSION,
  category: "meta",
  evaluate(ctx): RuleViolation | null {
    if (ctx.statusCode !== 200) return null;
    const s = ctx.renderedSignals;
    const titleMissing = !s.ogTitle;
    const urlMissing = !s.ogUrl && Boolean(s.canonical);
    if (!titleMissing && !urlMissing) return null;

    const missing = [titleMissing ? "og:title" : null, urlMissing ? "og:url" : null].filter(
      (v): v is string => v !== null,
    );
    return {
      ruleId: RULE_ID_OG_BASIC,
      ruleVersion: VERSION,
      category: "meta",
      severity: "low",
      pageUrl: ctx.pageUrl,
      currentValue: `누락: ${missing.join(", ")}`,
      recommendedValue: "openGraph.title(페이지 제목)·openGraph.url(canonical) 추가 권장",
    };
  },
};

/** og:description 부재 — fixer 없음(복사할 원본 meta description이 없으면 생성 자체가 불가능한 경우가 흔함). */
export const ogDescriptionMissingRule: Rule = {
  id: RULE_ID_OG_DESCRIPTION,
  version: VERSION,
  category: "meta",
  evaluate(ctx): RuleViolation | null {
    if (ctx.statusCode !== 200) return null;
    if (ctx.renderedSignals.ogDescription) return null;
    return {
      ruleId: RULE_ID_OG_DESCRIPTION,
      ruleVersion: VERSION,
      category: "meta",
      severity: "low",
      pageUrl: ctx.pageUrl,
      currentValue: null,
      recommendedValue: "openGraph.description 없음 — 해당되면 추가 권장",
    };
  },
};

/** <meta name="description"> 부재 — fixer 있음(meta-description-fixer.ts, B-2 2026-09-01):
 * <main> 안의 첫 문단이 있을 때만 복사해 채우고, 없으면 여전히 report_only(값 창작 금지 원칙 유지). */
export const metaDescriptionMissingRule: Rule = {
  id: RULE_ID_META_DESCRIPTION,
  version: VERSION,
  category: "meta",
  evaluate(ctx): RuleViolation | null {
    if (ctx.statusCode !== 200) return null;
    if (ctx.renderedSignals.metaDescription) return null;
    return {
      ruleId: RULE_ID_META_DESCRIPTION,
      ruleVersion: VERSION,
      category: "meta",
      severity: "low",
      pageUrl: ctx.pageUrl,
      currentValue: null,
      recommendedValue: "meta description 없음 — 검색결과 스니펫 품질에 영향, 해당되면 추가 권장",
    };
  },
};
