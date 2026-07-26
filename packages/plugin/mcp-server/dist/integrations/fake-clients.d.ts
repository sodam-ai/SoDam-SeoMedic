import type { GscClient, GscSearchAnalyticsSummary, Ga4Client, Ga4MetricsSummary, PsiClient, PsiFieldData } from "./types.js";
/**
 * 전부 네트워크 호출 없는 결정론적 canned 데이터 — 실제 GSC/GA4/PSI 계정 없이 판단·병합 로직을
 * 검증할 때 주입한다(github/orchestrator.ts 테스트가 FakeGithubApiClient를 주입하는 것과 동일 패턴).
 * 이 스캐폴딩 단계에서는 이 fake 구현만 존재하며, 실제(non-fake) 클라이언트는 작성하지 않는다.
 */
export declare class FakeGscClient implements GscClient {
    fetchSearchAnalyticsSummary(propertyScope: string): Promise<GscSearchAnalyticsSummary>;
}
export declare class FakeGa4Client implements Ga4Client {
    fetchKeyMetrics(propertyId: string): Promise<Ga4MetricsSummary>;
}
export declare class FakePsiClient implements PsiClient {
    fetchFieldData(url: string): Promise<PsiFieldData | null>;
}
