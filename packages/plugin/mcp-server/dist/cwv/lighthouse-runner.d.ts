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
}
export declare function median(values: number[]): number | null;
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
export declare function measureCoreWebVitals(url: string, runs?: number): Promise<CwvMeasurement>;
