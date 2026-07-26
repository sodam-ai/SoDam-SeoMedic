/**
 * 공개 1차 문서 기준 확인일자 2026-07-14. 출처:
 * - OpenAI: https://developers.openai.com/api/docs/bots (GPTBot·ChatGPT-User·OAI-SearchBot)
 * - Anthropic: https://support.claude.com/en/articles/8896518 (ClaudeBot·Claude-User·Claude-SearchBot)
 * - Perplexity: https://docs.perplexity.ai/docs/resources/perplexity-crawlers (PerplexityBot·Perplexity-User)
 * - Google-Extended: robots.txt 전용 제어 토큰(별도 크롤러 UA 없음, Google Search 순위와 무관 — AI 학습
 *   사용 여부만 통제하는 시맨틱 토큰, 여러 보조자료로 교차확인)
 * - CCBot(Common Crawl)·Bytespider(ByteDance): 다수 AI 학습 파이프라인이 참조하는 업계에 널리
 *   문서화된 크롤러(보조자료 교차확인, 1차 문서는 없음)
 *
 * ⚠️ 이 목록은 시점 스냅샷이다. AI 크롤러는 계속 추가·변경되므로 정기적 재확인이 필요하고, 리포트에도
 * 이 사실을 명시한다(추측 금지 원칙 — "확인된 시점"을 숨기지 않음).
 */
export const AI_CRAWLER_CATALOG = [
    { token: "GPTBot", vendor: "OpenAI", purpose: "training" },
    { token: "OAI-SearchBot", vendor: "OpenAI", purpose: "ai_search" },
    { token: "ChatGPT-User", vendor: "OpenAI", purpose: "user_fetch" },
    { token: "ClaudeBot", vendor: "Anthropic", purpose: "training" },
    { token: "Claude-SearchBot", vendor: "Anthropic", purpose: "ai_search" },
    { token: "Claude-User", vendor: "Anthropic", purpose: "user_fetch" },
    { token: "PerplexityBot", vendor: "Perplexity", purpose: "ai_search" },
    { token: "Perplexity-User", vendor: "Perplexity", purpose: "user_fetch" },
    { token: "Google-Extended", vendor: "Google", purpose: "training" },
    { token: "CCBot", vendor: "Common Crawl", purpose: "training" },
    { token: "Bytespider", vendor: "ByteDance", purpose: "training" },
];
export const AI_CRAWLER_CATALOG_CONFIRMED_DATE = "2026-07-14";
/**
 * robots.txt의 루트 경로 기준으로만 판정한다 — "사이트 전체를 이 봇에게 막았는가"의 근사치이며,
 * 페이지별로 다른 세밀한 규칙(예: 특정 하위 경로만 차단)은 이 사이트 단위 요약의 범위 밖이다.
 * robot이 null이면(robots.txt 자체가 없음) 전부 허용으로 판정한다(추측이 아니라 robots 사양의
 * 표준 기본 동작 — "robots.txt 없음 = 전체 허용"은 RFC 수준으로 확립된 규칙).
 *
 * rootUrl은 반드시 robots.txt와 같은 origin의 **절대 URL**이어야 한다(실측 확인된 함정: robots-parser는
 * 상대 경로("/")를 넘기면 내부적으로 무관한 fallback origin으로 해석해 origin 불일치로 판단, isAllowed가
 * 조용히 undefined를 반환해 모든 판정이 "허용"으로 무력화된다 — 재현 테스트로 발견·수정됨).
 */
export function evaluateAiCrawlerAccess(robot, robotsTxtStatus, rootUrl) {
    const entries = AI_CRAWLER_CATALOG.map((entry) => {
        const allowed = robot === null ? true : robot.isAllowed(rootUrl, entry.token) !== false;
        return { ...entry, allowed };
    });
    return { robotsTxtFound: robotsTxtStatus === "found", entries };
}
//# sourceMappingURL=ai-crawler-policy.js.map