import { chromium } from "playwright";
import { resolveAndCheck, assertSafeUrl } from "../crawler/ssrf-guard.js";
import { extractSignalsFromPage } from "./dom-signals.js";
const DEFAULT_NAV_TIMEOUT_MS = 15_000;
const SAFE_RESOURCE_SCHEMES = new Set(["data:", "blob:", "about:", "chrome-error:"]);
export async function installSsrfGuardedRouting(page, options = {}) {
    const decisionCache = new Map(); // hostname -> allowed (페이지당 1회만 DNS 조회)
    const allowedOrigins = options.allowedOrigins;
    await page.route("**/*", async (route) => {
        let url;
        try {
            url = new URL(route.request().url());
        }
        catch {
            await route.abort();
            return;
        }
        if (SAFE_RESOURCE_SCHEMES.has(url.protocol)) {
            await route.continue();
            return;
        }
        if (url.protocol !== "http:" && url.protocol !== "https:") {
            await route.abort();
            return;
        }
        if (allowedOrigins?.has(url.origin)) {
            await route.continue();
            return;
        }
        const cached = decisionCache.get(url.hostname);
        if (cached !== undefined) {
            cached ? await route.continue() : await route.abort();
            return;
        }
        // dns.lookup()은 IP 리터럴 입력 시 네트워크 조회 없이 즉시 그 값을 반환하므로
        // 호스트가 IP 리터럴이든 도메인이든 이 한 경로로 충분하다(별도 분기 불필요).
        let allowed;
        try {
            await resolveAndCheck(url.hostname);
            allowed = true;
        }
        catch {
            allowed = false;
        }
        decisionCache.set(url.hostname, allowed);
        allowed ? await route.continue() : await route.abort();
    });
}
export async function launchGuardedBrowser() {
    return chromium.launch();
}
/**
 * 하나의 URL을 렌더링해 신호를 추출한다. 페이지 단위로 격리된 브라우저 컨텍스트를 쓰고
 * 끝나면 반드시 닫는다(리소스 누수 방지).
 */
export async function renderAndExtractSignals(browser, targetUrl, timeoutMs = DEFAULT_NAV_TIMEOUT_MS) {
    assertSafeUrl(targetUrl); // 최초 진입점 검증(스킴·IP리터럴)
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
        await installSsrfGuardedRouting(page);
        const response = await page.goto(targetUrl, { waitUntil: "load", timeout: timeoutMs });
        const signals = await extractSignalsFromPage(page);
        return {
            finalUrl: page.url(),
            statusCode: response?.status() ?? null,
            signals,
        };
    }
    finally {
        await context.close();
    }
}
//# sourceMappingURL=browser-pool.js.map