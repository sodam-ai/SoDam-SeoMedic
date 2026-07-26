/**
 * 전부 네트워크 호출 없는 결정론적 canned 데이터 — 실제 GSC/GA4/PSI 계정 없이 판단·병합 로직을
 * 검증할 때 주입한다(github/orchestrator.ts 테스트가 FakeGithubApiClient를 주입하는 것과 동일 패턴).
 * 이 스캐폴딩 단계에서는 이 fake 구현만 존재하며, 실제(non-fake) 클라이언트는 작성하지 않는다.
 */
export class FakeGscClient {
    async fetchSearchAnalyticsSummary(propertyScope) {
        return { propertyScope, clicks: 1234, impressions: 56789, position: 8.4 };
    }
}
export class FakeGa4Client {
    async fetchKeyMetrics(propertyId) {
        return { propertyId, sessions: 4321, activeUsers: 2100 };
    }
}
export class FakePsiClient {
    async fetchFieldData(url) {
        return { url, lcpMs: 2100, clsUnitless: 0.05, inpMs: 180, isFieldData: true };
    }
}
//# sourceMappingURL=fake-clients.js.map