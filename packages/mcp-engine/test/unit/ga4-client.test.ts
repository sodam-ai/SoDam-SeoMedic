import { describe, it, expect } from "vitest";
import { createGa4Client, Ga4ApiError, type Ga4Fetcher } from "../../src/integrations/ga4-client.js";
import type { AccessTokenProvider } from "../../src/integrations/google-auth-token.js";

// propertyId는 "properties/" 접두사 없는 순수 ID다(PRD 04_PROJECT_SPEC.md 환경변수 표 "GA4_PROPERTY_ID
// | GA4 속성 ID" 그대로) — 클라이언트가 REST 경로를 만들 때 "properties/"를 붙인다(공식 문서의
// `{property=properties/*}` 패턴).
const TEST_PROPERTY_ID = "123456789";
const TEST_KEY_PATH = "/fake/service-account.json";
const TEST_TOKEN = "fake-access-token-xyz";

const fakeTokenProvider: AccessTokenProvider = async () => TEST_TOKEN;

function fakeFetcher(response: { status: number; body: unknown }): Ga4Fetcher {
  return async () => ({ status: response.status, bodyText: JSON.stringify(response.body) });
}

describe("createGa4Client — GA4 Data API runReport 응답 파싱(canned 응답, 실제 네트워크 없음)", () => {
  it("정상 응답이면 sessions/activeUsers를 순서대로(요청한 metrics 순서) 파싱한다", async () => {
    const client = createGa4Client(
      TEST_KEY_PATH,
      fakeFetcher({ status: 200, body: { rows: [{ metricValues: ["4321", "2100"] }] } }),
      fakeTokenProvider,
    );
    const result = await client.fetchKeyMetrics(TEST_PROPERTY_ID);
    expect(result).toEqual({ propertyId: TEST_PROPERTY_ID, sessions: 4321, activeUsers: 2100 });
  });

  it("rows가 비어있으면(집계할 활동 없음) 0으로 채운다(에러 아님, 값 지어내지 않음)", async () => {
    const client = createGa4Client(TEST_KEY_PATH, fakeFetcher({ status: 200, body: { rows: [] } }), fakeTokenProvider);
    expect(await client.fetchKeyMetrics(TEST_PROPERTY_ID)).toEqual({ propertyId: TEST_PROPERTY_ID, sessions: 0, activeUsers: 0 });
  });

  it("rows 필드 자체가 없어도 0으로 채운다", async () => {
    const client = createGa4Client(TEST_KEY_PATH, fakeFetcher({ status: 200, body: {} }), fakeTokenProvider);
    expect(await client.fetchKeyMetrics(TEST_PROPERTY_ID)).toEqual({ propertyId: TEST_PROPERTY_ID, sessions: 0, activeUsers: 0 });
  });

  it("metricValues가 문자열이 아니면(응답 스키마 이상) 신뢰하지 않고 0으로 처리한다(M5)", async () => {
    const client = createGa4Client(
      TEST_KEY_PATH,
      fakeFetcher({ status: 200, body: { rows: [{ metricValues: [4321, null] }] } }),
      fakeTokenProvider,
    );
    expect(await client.fetchKeyMetrics(TEST_PROPERTY_ID)).toEqual({ propertyId: TEST_PROPERTY_ID, sessions: 0, activeUsers: 0 });
  });

  it("200이 아닌 상태 코드는 Ga4ApiError를 던진다", async () => {
    const client = createGa4Client(TEST_KEY_PATH, fakeFetcher({ status: 403, body: { error: { message: "Forbidden" } } }), fakeTokenProvider);
    await expect(client.fetchKeyMetrics(TEST_PROPERTY_ID)).rejects.toThrow(Ga4ApiError);
  });

  it("JSON으로 파싱할 수 없는 응답은 Ga4ApiError를 던진다", async () => {
    const nonJsonFetcher: Ga4Fetcher = async () => ({ status: 200, bodyText: "<html>not json</html>" });
    const client = createGa4Client(TEST_KEY_PATH, nonJsonFetcher, fakeTokenProvider);
    await expect(client.fetchKeyMetrics(TEST_PROPERTY_ID)).rejects.toThrow(Ga4ApiError);
  });

  it("토큰 획득 실패는 Ga4ApiError로 감싼다", async () => {
    const throwingTokenProvider: AccessTokenProvider = async () => {
      throw new Error("bad key");
    };
    const client = createGa4Client(TEST_KEY_PATH, fakeFetcher({ status: 200, body: {} }), throwingTokenProvider);
    await expect(client.fetchKeyMetrics(TEST_PROPERTY_ID)).rejects.toThrow(Ga4ApiError);
  });

  it("요청에 Authorization 헤더로 Bearer 토큰이 실린다", async () => {
    let capturedHeaders: Record<string, string> = {};
    const capturingFetcher: Ga4Fetcher = async (_url, init) => {
      capturedHeaders = init.headers;
      return { status: 200, bodyText: "{}" };
    };
    const client = createGa4Client(TEST_KEY_PATH, capturingFetcher, fakeTokenProvider);
    await client.fetchKeyMetrics(TEST_PROPERTY_ID);
    expect(capturedHeaders.authorization).toBe(`Bearer ${TEST_TOKEN}`);
  });

  it("요청 URL에 propertyId가 포함되고, 본문에 dateRanges와 sessions·activeUsers metrics가 담긴다", async () => {
    let capturedUrl = "";
    let capturedBody = "";
    const capturingFetcher: Ga4Fetcher = async (url, init) => {
      capturedUrl = url;
      capturedBody = init.body;
      return { status: 200, bodyText: "{}" };
    };
    const client = createGa4Client(TEST_KEY_PATH, capturingFetcher, fakeTokenProvider);
    await client.fetchKeyMetrics(TEST_PROPERTY_ID);

    expect(capturedUrl).toBe(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(TEST_PROPERTY_ID)}:runReport`);
    const parsedBody = JSON.parse(capturedBody);
    expect(parsedBody.metrics).toEqual([{ name: "sessions" }, { name: "activeUsers" }]);
    expect(parsedBody.dateRanges[0].startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(parsedBody.dateRanges[0].endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("에러 메시지에 액세스 토큰 값이 노출되지 않는다(M4)", async () => {
    const throwingFetcher: Ga4Fetcher = async () => {
      throw new Error(`network failure with token=${TEST_TOKEN}`);
    };
    const client = createGa4Client(TEST_KEY_PATH, throwingFetcher, fakeTokenProvider);
    try {
      await client.fetchKeyMetrics(TEST_PROPERTY_ID);
      expect.fail("에러가 던져지지 않음");
    } catch (err) {
      expect((err as Error).message).not.toContain(TEST_TOKEN);
      expect((err as Error).message).toContain("***");
    }
  });
});
