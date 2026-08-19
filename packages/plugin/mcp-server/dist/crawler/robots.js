// robots-parser@3.0.1이 배포하는 index.d.ts는 `declare module 'robots-parser';`(shorthand ambient, any화)와
// 같은 파일 내 `export default function robotsParser(...)`가 충돌해 "not callable"로 타입체크 실패한다(실측 확인됨).
// 패키지 쪽 타입 선언 결함이라 우리 쪽에서 최소 인터페이스를 직접 선언해 우회한다.
import robotsParserFactory from "robots-parser";
import { safeFetch } from "./fetch-client.js";
import { evaluateAiCrawlerAccess } from "./ai-crawler-policy.js";
const robotsParser = robotsParserFactory;
/**
 * 위 robots-parser 타입 우회 래퍼를 다른 모듈에서도 재사용할 수 있도록 노출한다(fix-orchestrator/scan.ts가
 * Phase 1.5 로컬 브릿지 전용 fetch 경로에서 이 파서만 필요 — safeFetch는 127.0.0.1을 SSRF로 차단해
 * 이 파일의 fetchRobotsTxtRaw를 재사용할 수 없음, local-fetch.ts의 주석과 동일한 이유).
 */
export function parseRobotsTxt(url, robotstxt) {
    return robotsParser(url, robotstxt);
}
const CRAWLER_UA = "SeoMedicBot";
const MAX_ROBOTS_BYTES = 500 * 1024; // 500KB 상한(비정상적으로 거대한 robots.txt 방어)
/**
 * robots.txt 조회+상태판정의 단일 진입점. loadRobotsPolicy(크롤 예절 판단)와 loadAiCrawlerAccess(AI
 * 크롤러 정책 리포트) 둘 다 이 함수를 통해서만 robots.txt를 가져온다 — SSRF 가드가 걸린 fetch 경로를
 * 하나로 유지해야 보안 검토 지점이 늘어나지 않는다(신규 기능 때문에 fetch 로직을 복제하지 않음).
 * - 404(없음): "absent" — 사양대로 전체 허용이 확정된 사실
 * - 조회 자체가 실패(5xx·타임아웃·네트워크 오류): "unavailable" — 정책을 알 수 없음(추측 금지)
 */
async function fetchRobotsTxtRaw(origin) {
    const robotsUrl = new URL("/robots.txt", origin).toString();
    let body = "";
    let statusCode;
    try {
        const res = await safeFetch(robotsUrl, { maxBytes: MAX_ROBOTS_BYTES });
        statusCode = res.status;
        if (res.status === 200) {
            body = res.bodyText;
        }
    }
    catch {
        statusCode = undefined; // 네트워크/SSRF 등으로 조회 자체가 실패
    }
    if (statusCode === 404)
        return { status: "absent", robotsUrl, body: "" };
    if (statusCode !== 200)
        return { status: "unavailable", robotsUrl, body: "" };
    return { status: "found", robotsUrl, body };
}
/**
 * robots.txt를 가져와 정책 객체를 만든다(SeoMedicBot 자신의 크롤 허용 여부 판단용).
 * - absent(없음): 전체 허용으로 취급
 * - unavailable(조회 실패): 정책을 알 수 없으므로 **보수적으로 전체 거부**
 *   (허용 여부가 불확실할 때 크롤을 강행하지 않는다는 원칙 — DO-NOT "권한 없는 사이트 무단 크롤 금지"와 일관)
 */
export async function loadRobotsPolicy(origin) {
    const fetched = await fetchRobotsTxtRaw(origin);
    if (fetched.status === "absent")
        return allowAllPolicy();
    if (fetched.status === "unavailable")
        return denyAllPolicy();
    const robot = robotsParser(fetched.robotsUrl, fetched.body);
    return {
        isAllowed(url) {
            const allowed = robot.isAllowed(url, CRAWLER_UA);
            return allowed !== false; // undefined(판단불가)는 관대하게 허용, 명시적 false만 거부
        },
        crawlDelaySeconds: robot.getCrawlDelay(CRAWLER_UA),
        sitemaps: robot.getSitemaps(),
    };
}
function allowAllPolicy() {
    return { isAllowed: () => true, crawlDelaySeconds: undefined, sitemaps: [] };
}
function denyAllPolicy() {
    return { isAllowed: () => false, crawlDelaySeconds: undefined, sitemaps: [] };
}
/**
 * robots.txt 기준 알려진 AI 크롤러(GPTBot·ClaudeBot 등)의 접근 정책을 중립적으로 리포트한다
 * (loadRobotsPolicy와 달리 SeoMedicBot 자신의 크롤 여부와 무관 — 사용자에게 보여줄 리포트 전용).
 * - found(200): 실제 규칙 기준으로 봇별 판정
 * - absent(404): robots.txt 자체가 없음 = 전체 허용이 사양상 확정된 사실이므로 리포트 생성
 * - unavailable(5xx·네트워크실패): 정책을 알 수 없음 → **null 반환, 리포트 생성 안 함**
 *   (denyAllPolicy처럼 "전체 차단"으로 추측하면 실제로는 모르는 사실을 안다고 말하는 셈이 된다 — 이건
 *   SeoMedic 자신의 보수적 크롤 결정이지 대상 사이트의 실제 robots.txt 내용이 아니기 때문)
 */
export async function loadAiCrawlerAccess(origin) {
    const fetched = await fetchRobotsTxtRaw(origin);
    if (fetched.status === "unavailable")
        return null;
    const robot = fetched.status === "absent" ? null : robotsParser(fetched.robotsUrl, fetched.body);
    return evaluateAiCrawlerAccess(robot, fetched.status, origin);
}
//# sourceMappingURL=robots.js.map