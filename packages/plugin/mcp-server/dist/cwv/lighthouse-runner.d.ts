import { type SsrfProxyOptions } from "./ssrf-proxy.js";
export interface CwvMeasurement {
    lcpMs: number | null;
    clsUnitless: number | null;
    /**
     * 진짜 INP(Interaction to Next Paint)가 아니다 — INP는 실사용자 상호작용이 있어야 측정 가능한데,
     * Lighthouse의 스크립트 기반 lab 실행은 상호작용이 없다(실측 확인: 이 Lighthouse 버전의 성능 카테고리에는
     * interaction-to-next-paint 감사 자체가 없음). Total Blocking Time을 web.dev 권고에 따라 근사 프록시로 쓴다.
     */
    inpProxyTbtMs: number | null;
    isLabData: true;
    runsCompleted: number;
    /**
     * 측정 중 SSRF 프록시가 차단한 목적지("host:port", 중복 제거·최대 5개). 차단이 없으면 생략한다.
     * 차단이 있어도 나머지 측정은 유효하다(예: 페이지가 내부 주소를 부르는 서브리소스) — 리포트가 사실을 알려준다.
     */
    blockedTargets?: string[];
}
/**
 * 측정에 실패했고 그 사유를 사용자에게 보여줘도 안전한 경우(차단·Lighthouse 오류 코드)의 오류.
 * message는 우리가 직접 쓴 문장만 담는다 — 내부 경로·스택은 담지 않는다(PRD 04 M10).
 */
export declare class CwvMeasurementError extends Error {
    constructor(message: string);
}
export declare function median(values: number[]): number | null;
/**
 * Lighthouse를 runs회(기본 3회) 실행해 LCP/CLS/TBT(INP 프록시)의 중앙값을 낸다.
 *
 * 보안(PRD 04 M1 — off-host 리다이렉트 차단): 진입 URL은 assertSafeUrl+DNS 재검증으로 먼저 거른다. 그 뒤
 * Chromium의 **모든** 트래픽(리다이렉트·서브리소스 포함)은 SSRF 가드를 거는 로컬 프록시(ssrf-proxy.ts)를 지난다.
 * Lighthouse가 CDP로 연결한 뒤 이동을 스스로 관리해 M2 render처럼 page.route()로 요청마다 재검증할 수 없기 때문이다
 * (Playwright Page 객체를 넘기면 "this._page.target is not a function"으로 실패 — 실측). 이 프록시 이전에는
 * 진입 URL만 검증하는 알려진 공백이었다(2026-10-11 실험으로 리다이렉트 목적지 도달을 실증).
 */
export declare function measureCoreWebVitals(url: string, runs?: number): Promise<CwvMeasurement>;
/**
 * 프록시 경유 측정의 본체. **진입 URL 검증을 하지 않는다** — 프로덕션 코드는 measureCoreWebVitals만 호출한다.
 * 로컬 서버로 리다이렉트 차단을 검증하는 테스트가 프록시 정책을 주입하려고 분리했다.
 */
export declare function measureThroughSsrfProxy(url: string, runs: number, proxyOptions?: SsrfProxyOptions): Promise<CwvMeasurement>;
