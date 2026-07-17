import { type Browser, type Page } from "playwright";
import { type PageSignals } from "./dom-signals.js";
/**
 * Playwright는 브라우저 프로세스를 spawn(argv 배열)으로 실행하므로 명령어 주입 표면은 없다.
 * 하지만 브라우저 자신의 네트워크 스택은 우리가 만든 undici SSRF 가드(M1)를 거치지 않는다 —
 * page.goto()에 그대로 URL을 넘기면 브라우저가 사설 IP·클라우드 메타데이터로 직접 요청할 수 있다.
 * 이를 막기 위해 페이지가 발생시키는 모든 요청(내비게이션 + 하위 리소스)을 route()로 가로채
 * 매 호스트네임마다 DNS 조회 결과를 SSRF 가드로 재검증한다.
 */
export interface SsrfGuardedRoutingOptions {
    /**
     * 이 오리진(scheme://host:port)에서 오는 요청은 SSRF 재검증(resolveAndCheck) 없이 그대로 통과시킨다.
     * 렌더 브릿지(127.0.0.1 로컬 서버)의 정적 자산(/_next/static/*.js 등)은 사설 IP라 기본 검증이면
     * 무조건 차단되므로, 이미 assertLocalBridgeUrl로 검증된 오리진 자신의 하위 리소스만 예외를 둔다.
     * 기본값(undefined)이면 기존 동작과 완전히 동일 — Phase 1 호출부·테스트에 영향 없음.
     */
    allowedOrigins?: Set<string>;
}
export declare function installSsrfGuardedRouting(page: Page, options?: SsrfGuardedRoutingOptions): Promise<void>;
export declare function launchGuardedBrowser(): Promise<Browser>;
export interface RenderResult {
    finalUrl: string;
    statusCode: number | null;
    signals: PageSignals;
}
/**
 * 하나의 URL을 렌더링해 신호를 추출한다. 페이지 단위로 격리된 브라우저 컨텍스트를 쓰고
 * 끝나면 반드시 닫는다(리소스 누수 방지).
 */
export declare function renderAndExtractSignals(browser: Browser, targetUrl: string, timeoutMs?: number): Promise<RenderResult>;
