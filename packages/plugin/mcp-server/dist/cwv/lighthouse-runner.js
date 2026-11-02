import { createServer } from "node:net";
import { chromium } from "playwright";
import lighthouse from "lighthouse";
import { assertSafeUrl, resolveAndCheck } from "../crawler/ssrf-guard.js";
import { startSsrfProxy } from "./ssrf-proxy.js";
const DEFAULT_RUNS = 3;
const NAV_SETTLE_MS = 500; // Chrome이 --remote-debugging-port HTTP 엔드포인트를 바인딩할 시간(실측 기반)
/**
 * 측정에 실패했고 그 사유를 사용자에게 보여줘도 안전한 경우(차단·Lighthouse 오류 코드)의 오류.
 * message는 우리가 직접 쓴 문장만 담는다 — 내부 경로·스택은 담지 않는다(PRD 04 M10).
 */
export class CwvMeasurementError extends Error {
    constructor(message) {
        super(message);
        this.name = "CwvMeasurementError";
    }
}
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
/**
 * Lighthouse가 쓸 Chromium을 CDP 포트와 SSRF 프록시를 지정해 띄운다.
 * `--proxy-bypass-list=<-loopback>`: Chromium은 기본적으로 localhost·127.0.0.1 요청을 프록시에서 제외하는데,
 * 그러면 페이지가 로컬/내부 서비스를 부르는 요청이 가드를 우회한다 — loopback도 프록시로 보내 거부하게 한다.
 */
async function launchChromiumWithCdpPort(port, proxyPort) {
    const browser = await chromium.launch({
        args: [`--remote-debugging-port=${port}`, `--proxy-server=http://127.0.0.1:${proxyPort}`, "--proxy-bypass-list=<-loopback>"],
    });
    await new Promise((resolve) => setTimeout(resolve, NAV_SETTLE_MS));
    return browser;
}
/** 사용자에게 보여줄 측정 실패 사유. 우리가 쓴 문장과 Lighthouse 오류 코드(상수)만 담는다(M10). */
function describeFailure(runtimeErrorCode, blockedTargets) {
    if (blockedTargets.length > 0) {
        return `측정 중 사설·내부 주소로 가는 요청(리다이렉트 포함)이 차단되어 측정하지 못했습니다(SSRF 방어) — 차단 대상: ${blockedTargets.join(", ")}`;
    }
    return runtimeErrorCode
        ? `Lighthouse가 페이지를 측정하지 못했습니다(${runtimeErrorCode})`
        : "Lighthouse가 결과를 반환하지 않았습니다";
}
/**
 * Lighthouse를 runs회(기본 3회) 실행해 LCP/CLS/TBT(INP 프록시)의 중앙값을 낸다.
 *
 * 보안(PRD 04 M1 — off-host 리다이렉트 차단): 진입 URL은 assertSafeUrl+DNS 재검증으로 먼저 거른다. 그 뒤
 * Chromium의 **모든** 트래픽(리다이렉트·서브리소스 포함)은 SSRF 가드를 거는 로컬 프록시(ssrf-proxy.ts)를 지난다.
 * Lighthouse가 CDP로 연결한 뒤 이동을 스스로 관리해 M2 render처럼 page.route()로 요청마다 재검증할 수 없기 때문이다
 * (Playwright Page 객체를 넘기면 "this._page.target is not a function"으로 실패 — 실측). 이 프록시 이전에는
 * 진입 URL만 검증하는 알려진 공백이었다(2026-10-11 실험으로 리다이렉트 목적지 도달을 실증).
 */
export async function measureCoreWebVitals(url, runs = DEFAULT_RUNS) {
    assertSafeUrl(url);
    await resolveAndCheck(new URL(url).hostname);
    return measureThroughSsrfProxy(url, runs);
}
/**
 * 프록시 경유 측정의 본체. **진입 URL 검증을 하지 않는다** — 프로덕션 코드는 measureCoreWebVitals만 호출한다.
 * 로컬 서버로 리다이렉트 차단을 검증하는 테스트가 프록시 정책을 주입하려고 분리했다.
 */
export async function measureThroughSsrfProxy(url, runs, proxyOptions) {
    const proxy = await startSsrfProxy(proxyOptions);
    const lcpValues = [];
    const clsValues = [];
    const tbtValues = [];
    let runsCompleted = 0;
    let lastRuntimeErrorCode = null;
    let thrown = null;
    let browser;
    try {
        const port = await getFreePort();
        browser = await launchChromiumWithCdpPort(port, proxy.port);
        for (let i = 0; i < runs; i++) {
            const result = await lighthouse(url, {
                port,
                output: "json",
                onlyCategories: ["performance"],
                formFactor: "desktop",
                screenEmulation: { disabled: true },
            });
            const lhr = result?.lhr;
            if (!lhr?.audits)
                continue;
            // 문서 요청이 실패한 실행(차단된 리다이렉트·NO_FCP 등)은 "완료된 측정"이 아니다 — 세지 않는다.
            if (lhr.runtimeError) {
                lastRuntimeErrorCode = lhr.runtimeError.code ?? "UNKNOWN";
                continue;
            }
            runsCompleted++;
            const lcp = lhr.audits["largest-contentful-paint"]?.numericValue;
            const cls = lhr.audits["cumulative-layout-shift"]?.numericValue;
            const tbt = lhr.audits["total-blocking-time"]?.numericValue;
            if (typeof lcp === "number")
                lcpValues.push(lcp);
            if (typeof cls === "number")
                clsValues.push(cls);
            if (typeof tbt === "number")
                tbtValues.push(tbt);
        }
    }
    catch (error) {
        thrown = error;
    }
    finally {
        await browser?.close();
        await proxy.close();
    }
    const blockedTargets = [...new Set(proxy.blocked.map((entry) => entry.target))].slice(0, 5);
    // 차단이 있었다면 그것이 실패의 알려진 원인이다 — 내부 오류로 뭉개지 않고 사유를 보존한다.
    if (thrown !== null) {
        if (blockedTargets.length > 0)
            throw new CwvMeasurementError(describeFailure(null, blockedTargets));
        throw thrown;
    }
    if (runsCompleted === 0)
        throw new CwvMeasurementError(describeFailure(lastRuntimeErrorCode, blockedTargets));
    return {
        lcpMs: median(lcpValues),
        clsUnitless: median(clsValues),
        inpProxyTbtMs: median(tbtValues),
        isLabData: true,
        runsCompleted,
        ...(blockedTargets.length > 0 ? { blockedTargets } : {}),
    };
}
//# sourceMappingURL=lighthouse-runner.js.map