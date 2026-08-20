import { describe, it, expect } from "vitest";
import { createGscClient, GscApiError, type GscFetcher } from "../../src/integrations/gsc-client.js";
import type { AccessTokenProvider } from "../../src/integrations/google-auth-token.js";

const TEST_PROPERTY = "sc-domain:my-site.com";
const TEST_KEY_PATH = "/fake/service-account.json";
const TEST_TOKEN = "fake-access-token-xyz";

const fakeTokenProvider: AccessTokenProvider = async () => TEST_TOKEN;

function fakeFetcher(response: { status: number; body: unknown }): GscFetcher {
  return async () => ({ status: response.status, bodyText: JSON.stringify(response.body) });
}

describe("createGscClient — Search Console searchAnalytics.query 응답 파싱(canned 응답, 실제 네트워크 없음)", () => {
  it("정상 응답이면 요약값을 그대로 반환한다", async () => {
    const client = createGscClient(
      TEST_KEY_PATH,
      fakeFetcher({ status: 200, body: { rows: [{ clicks: 1234, impressions: 56789, ctr: 0.0217, position: 8.4 }] } }),
      fakeTokenProvider,
    );
    const result = await client.fetchSearchAnalyticsSummary(TEST_PROPERTY);
    expect(result).toEqual({ propertyScope: TEST_PROPERTY, clicks: 1234, impressions: 56789, position: 8.4 });
  });

  it("rows가 비어있으면(집계할 활동 없음) 0으로 채운다(에러 아님, 값 지어내지 않음)", async () => {
    const client = createGscClient(TEST_KEY_PATH, fakeFetcher({ status: 200, body: { rows: [] } }), fakeTokenProvider);
    expect(await client.fetchSearchAnalyticsSummary(TEST_PROPERTY)).toEqual({
      propertyScope: TEST_PROPERTY,
      clicks: 0,
      impressions: 0,
      position: 0,
    });
  });

  it("rows 필드 자체가 없어도 0으로 채운다", async () => {
    const client = createGscClient(TEST_KEY_PATH, fakeFetcher({ status: 200, body: {} }), fakeTokenProvider);
    expect(await client.fetchSearchAnalyticsSummary(TEST_PROPERTY)).toEqual({
      propertyScope: TEST_PROPERTY,
      clicks: 0,
      impressions: 0,
      position: 0,
    });
  });

  it("숫자가 아닌 필드 값은 신뢰하지 않고 0으로 처리한다(M5 입력 불신 검증)", async () => {
    const client = createGscClient(
      TEST_KEY_PATH,
      fakeFetcher({ status: 200, body: { rows: [{ clicks: "not-a-number", impressions: null, position: undefined }] } }),
      fakeTokenProvider,
    );
    expect(await client.fetchSearchAnalyticsSummary(TEST_PROPERTY)).toEqual({
      propertyScope: TEST_PROPERTY,
      clicks: 0,
      impressions: 0,
      position: 0,
    });
  });

  it("200이 아닌 상태 코드는 GscApiError를 던진다", async () => {
    const client = createGscClient(TEST_KEY_PATH, fakeFetcher({ status: 403, body: { error: { message: "Forbidden" } } }), fakeTokenProvider);
    await expect(client.fetchSearchAnalyticsSummary(TEST_PROPERTY)).rejects.toThrow(GscApiError);
  });

  it("JSON으로 파싱할 수 없는 응답은 GscApiError를 던진다", async () => {
    const nonJsonFetcher: GscFetcher = async () => ({ status: 200, bodyText: "<html>not json</html>" });
    const client = createGscClient(TEST_KEY_PATH, nonJsonFetcher, fakeTokenProvider);
    await expect(client.fetchSearchAnalyticsSummary(TEST_PROPERTY)).rejects.toThrow(GscApiError);
  });

  it("토큰 획득 실패는 GscApiError로 감싼다", async () => {
    const throwingTokenProvider: AccessTokenProvider = async () => {
      throw new Error("bad key");
    };
    const client = createGscClient(TEST_KEY_PATH, fakeFetcher({ status: 200, body: {} }), throwingTokenProvider);
    await expect(client.fetchSearchAnalyticsSummary(TEST_PROPERTY)).rejects.toThrow(GscApiError);
  });

  it("요청에 Authorization 헤더로 Bearer 토큰이 실린다", async () => {
    let capturedHeaders: Record<string, string> = {};
    const capturingFetcher: GscFetcher = async (_url, init) => {
      capturedHeaders = init.headers;
      return { status: 200, bodyText: "{}" };
    };
    const client = createGscClient(TEST_KEY_PATH, capturingFetcher, fakeTokenProvider);
    await client.fetchSearchAnalyticsSummary(TEST_PROPERTY);
    expect(capturedHeaders.authorization).toBe(`Bearer ${TEST_TOKEN}`);
  });

  it("요청 URL에 property scope가 인코딩되어 포함되고, 본문에 startDate/endDate/빈 dimensions가 담긴다", async () => {
    let capturedUrl = "";
    let capturedBody = "";
    const capturingFetcher: GscFetcher = async (url, init) => {
      capturedUrl = url;
      capturedBody = init.body;
      return { status: 200, bodyText: "{}" };
    };
    const client = createGscClient(TEST_KEY_PATH, capturingFetcher, fakeTokenProvider);
    await client.fetchSearchAnalyticsSummary(TEST_PROPERTY);

    expect(capturedUrl).toBe(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(TEST_PROPERTY)}/searchAnalytics/query`);
    const parsedBody = JSON.parse(capturedBody);
    expect(parsedBody.dimensions).toEqual([]);
    expect(parsedBody.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(parsedBody.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("에러 메시지에 액세스 토큰 값이 노출되지 않는다(M4)", async () => {
    const throwingFetcher: GscFetcher = async () => {
      throw new Error(`network failure with token=${TEST_TOKEN}`);
    };
    const client = createGscClient(TEST_KEY_PATH, throwingFetcher, fakeTokenProvider);
    try {
      await client.fetchSearchAnalyticsSummary(TEST_PROPERTY);
      expect.fail("에러가 던져지지 않음");
    } catch (err) {
      expect((err as Error).message).not.toContain(TEST_TOKEN);
      expect((err as Error).message).toContain("***");
    }
  });
});
