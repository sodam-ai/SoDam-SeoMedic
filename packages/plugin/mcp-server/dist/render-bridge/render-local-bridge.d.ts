import type { Browser } from "playwright";
import { type RenderResult } from "../render/browser-pool.js";
/**
 * render/browser-pool.ts의 renderAndExtractSignals()와 같은 역할이지만, 진입점 검증에
 * assertSafeUrl 대신 assertLocalBridgeUrl을 쓴다 — renderAndExtractSignals는 최상단에서
 * assertSafeUrl(targetUrl)을 호출해 127.0.0.1을 무조건 차단하므로 렌더 브릿지에 재사용할 수 없다
 * (설계 검토에서 확인된 실제 제약 — Plan Mode 계획엔 browser-pool.ts의 서브리소스 라우팅만
 * 언급됐지만, 진입점 자체의 assertSafeUrl 차단은 별도로 우회해야 함이 코드 확인 후 드러남).
 * 서브리소스(/_next/static/*.js 등)는 installSsrfGuardedRouting의 allowedOrigins로 예외 처리한다.
 */
export declare function renderLocalBridgeAndExtractSignals(browser: Browser, targetUrl: string, expectedOrigin: string, timeoutMs?: number): Promise<RenderResult>;
