import { createServer } from "node:net";
import { chromium } from "playwright";
import lighthouse from "lighthouse";
import { assertSafeUrl, resolveAndCheck } from "../crawler/ssrf-guard.js";
const DEFAULT_RUNS = 3;
const NAV_SETTLE_MS = 500; // Chrome이 --remote-debugging-port HTTP 엔드포인트를 바인딩할 시간(실측 기반)
function getFreePort() {
    return new Promise((resolve, reject) => {
        const srv = createServer();
        srv.listen(0, "127.0.0.1", () => {
            const port = srv.address().port;
            srv.close(() => resolve(port));
        });
        srv.on("error", reject);
    });
}
export function median(values) {
    const finite = values.filter((v) => typeof v === "number" && Number.isFinite(v));
    if (finite.length === 0)
        return null;
    const sorted = [...finite].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
async function launchChromiumWithCdpPort(port) {
    const browser = await chromium.launch({ args: [`--remote-debugging-port=${port}`] });
    await new Promise((resolve) => setTimeout(resolve, NAV_SETTLE_MS));
    return browser;
}
/**
 * Lighthouse를 runs회(기본 3회) 실행해 LCP/CLS/TBT(INP 프록시)의 중앙값을 낸다.
 *
 * 보안 참고(알려진 한계, 은폐하지 않고 명시): Lighthouse는 CDP 포트로 연결한 뒤
 * **자체적으로 새 페이지를 만들어 내비게이션을 관리**하므로, M2 render 모듈처럼 page.route()로
 * 매 요청마다 SSRF 재검증을 거는 것이 불가능하다(Playwright Page 객체를 직접 넘겨도
 * "this._page.target is not a function"으로 실패함 — 실측 확인, Lighthouse는 Puppeteer Page API를 기대).
 * 따라서 이 경로의 SSRF 방어는 **진입 URL 검증(assertSafeUrl+실제 DNS 재검증)만** 제공한다.
 * 리다이렉트 중간에 사설 IP로 빠지는 공격까지 막으려면 Lighthouse 내부 드라이버 교체가 필요해
 * Phase 1 범위를 넘는다 — CHECKPOINT에 추적 항목으로 남긴다.
 */
export async function measureCoreWebVitals(url, runs = DEFAULT_RUNS) {
    assertSafeUrl(url);
    await resolveAndCheck(new URL(url).hostname);
    const port = await getFreePort();
    const browser = await launchChromiumWithCdpPort(port);
    const lcpValues = [];
    const clsValues = [];
    const tbtValues = [];
    let runsCompleted = 0;
    try {
        for (let i = 0; i < runs; i++) {
            const result = await lighthouse(url, {
                port,
                output: "json",
                onlyCategories: ["performance"],
                formFactor: "desktop",
                screenEmulation: { disabled: true },
            });
            const audits = result?.lhr?.audits;
            if (!audits)
                continue;
            runsCompleted++;
            const lcp = audits["largest-contentful-paint"]?.numericValue;
            const cls = audits["cumulative-layout-shift"]?.numericValue;
            const tbt = audits["total-blocking-time"]?.numericValue;
            if (typeof lcp === "number")
                lcpValues.push(lcp);
            if (typeof cls === "number")
                clsValues.push(cls);
            if (typeof tbt === "number")
                tbtValues.push(tbt);
        }
    }
    finally {
        await browser.close();
    }
    return {
        lcpMs: median(lcpValues),
        clsUnitless: median(clsValues),
        inpProxyTbtMs: median(tbtValues),
        isLabData: true,
        runsCompleted,
    };
}
//# sourceMappingURL=lighthouse-runner.js.map