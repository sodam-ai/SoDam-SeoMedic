const RULE_ID_OG_BASIC = "R-OG-BASIC-MISSING";
const RULE_ID_OG_DESCRIPTION = "R-OG-DESCRIPTION-MISSING";
const RULE_ID_META_DESCRIPTION = "R-META-DESCRIPTION-MISSING";
const RULE_ID_OG_IMAGE = "R-OG-IMAGE-MISSING";
const VERSION = 1;
/**
 * og:title 또는 og:url이 없으면 발화. og:url은 복사할 canonical 자체가 없으면 침묵한다 —
 * R-CANONICAL-MISSING이 근본원인을 이미 high로 보고 중이라 중복 신호를 만들지 않는다
 * (jsonld의 MISSING/INVALID 상호배타와 동일한 "한 근본원인당 한 신호" 원칙).
 * 부재는 결함이 아니라 기회라 low로 유지(jsonLdMissingRule과 동일 보정).
 */
export const ogBasicMissingRule = {
    id: RULE_ID_OG_BASIC,
    version: VERSION,
    category: "meta",
    evaluate(ctx) {
        if (ctx.statusCode !== 200)
            return null;
        const s = ctx.renderedSignals;
        const titleMissing = !s.ogTitle;
        const urlMissing = !s.ogUrl && Boolean(s.canonical);
        if (!titleMissing && !urlMissing)
            return null;
        const missing = [titleMissing ? "og:title" : null, urlMissing ? "og:url" : null].filter((v) => v !== null);
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
export const ogDescriptionMissingRule = {
    id: RULE_ID_OG_DESCRIPTION,
    version: VERSION,
    category: "meta",
    evaluate(ctx) {
        if (ctx.statusCode !== 200)
            return null;
        if (ctx.renderedSignals.ogDescription)
            return null;
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
export const metaDescriptionMissingRule = {
    id: RULE_ID_META_DESCRIPTION,
    version: VERSION,
    category: "meta",
    evaluate(ctx) {
        if (ctx.statusCode !== 200)
            return null;
        if (ctx.renderedSignals.metaDescription)
            return null;
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
/**
 * og:image 부재(또는 빈 content) — 링크 공유 시 대표 이미지가 안 뜰 수 있다. 탐지(report_only)만 한다.
 *
 * - 기존 R-OG-BASIC-MISSING 등은 건드리지 않고 새 rule_id로 분리했다: 기존 규칙의 version을 올리면
 *   finding_key(page_url+rule_id+rule_version)가 바뀌어 과거 베이스라인과 회귀 비교가 끊긴다.
 * - fixer가 없는 이유: 복사할 원본이 페이지에 없고(어떤 <img>가 대표인지 추측하면 값 발명),
 *   이미지 URL을 실제로 요청해 크기·형식을 확인하려면 SSRF 신규 공격면(보안 M1)이 열린다.
 *   그래서 태그의 content가 비었는지만 본다 — 이미지가 실제로 존재하는지는 검사하지 않는다.
 * - 알려진 한계: og:image:url 같은 변형 속성만 있는 페이지는 부재로 판정될 수 있다(og:title 등과 동일하게
 *   property="og:image" 정확 일치만 인정). 공백뿐인 content도 부재로 본다.
 */
export const ogImageMissingRule = {
    id: RULE_ID_OG_IMAGE,
    version: VERSION,
    category: "meta",
    evaluate(ctx) {
        if (ctx.statusCode !== 200)
            return null;
        if (ctx.renderedSignals.ogImage?.trim())
            return null;
        return {
            ruleId: RULE_ID_OG_IMAGE,
            ruleVersion: VERSION,
            category: "meta",
            severity: "low",
            pageUrl: ctx.pageUrl,
            currentValue: null,
            recommendedValue: "og:image 없음 — 링크 공유 시 대표 이미지가 표시되지 않을 수 있음, 해당되면 추가 권장(이미지 파일 존재·크기는 검사하지 않음)",
        };
    },
};
//# sourceMappingURL=og.js.map