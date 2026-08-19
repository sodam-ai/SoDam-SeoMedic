import { describe, it, expect } from "vitest";
import { createPsiClient, PsiApiError, type PsiFetcher } from "../../src/integrations/psi-client.js";

const TEST_URL = "https://my-site.com/";
const TEST_API_KEY = "AIzaSyTestSecretKeyValue12345";

function fakeFetcher(response: { status: number; body: unknown }): PsiFetcher {
  return async () => ({ status: response.status, bodyText: JSON.stringify(response.body) });
}

describe("createPsiClient — Google PSI v5 응답 파싱(canned 응답, 실제 네트워크 없음)", () => {
  it("정상 응답이면 field 데이터를 반환하고 CLS는 100으로 나눈 값이다", async () => {
    const client = createPsiClient(
      TEST_API_KEY,
      fakeFetcher({
        status: 200,
        body: {
          loadingExperience: {
            metrics: {
              LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2353 },
              CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 20 },
              INTERACTION_TO_NEXT_PAINT: { percentile: 81 },
            },
          },
        },
      }),
    );

    const result = await client.fetchFieldData(TEST_URL);
    expect(result).toEqual({
      url: TEST_URL,
      lcpMs: 2353,
      clsUnitless: 0.2,
      inpMs: 81,
      isFieldData: true,
    });
  });

  it("metrics 중 일부만 있으면 나머지는 null(추측 생성 금지)", async () => {
    const client = createPsiClient(
      TEST_API_KEY,
      fakeFetcher({
        status: 200,
        body: { loadingExperience: { metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 1500 } } } },
      }),
    );

    const result = await client.fetchFieldData(TEST_URL);
    expect(result?.lcpMs).toBe(1500);
    expect(result?.clsUnitless).toBeNull();
    expect(result?.inpMs).toBeNull();
  });

  it("loadingExperience.metrics 자체가 없으면(CrUX 데이터 부족) null을 반환한다(에러 아님)", async () => {
    const client = createPsiClient(TEST_API_KEY, fakeFetcher({ status: 200, body: { loadingExperience: {} } }));
    expect(await client.fetchFieldData(TEST_URL)).toBeNull();
  });

  it("loadingExperience 필드 자체가 없어도 null을 반환한다", async () => {
    const client = createPsiClient(TEST_API_KEY, fakeFetcher({ status: 200, body: {} }));
    expect(await client.fetchFieldData(TEST_URL)).toBeNull();
  });

  it("200이 아닌 상태 코드는 PsiApiError를 던진다", async () => {
    const client = createPsiClient(TEST_API_KEY, fakeFetcher({ status: 403, body: { error: { message: "API key not valid" } } }));
    await expect(client.fetchFieldData(TEST_URL)).rejects.toThrow(PsiApiError);
  });

  it("에러 메시지에 API 키 값이 절대 그대로 노출되지 않는다(M4 마스킹)", async () => {
    const client = createPsiClient(TEST_API_KEY, fakeFetcher({ status: 400, body: { error: { message: `bad request for key ${TEST_API_KEY}` } } }));
    try {
      await client.fetchFieldData(TEST_URL);
      expect.fail("에러가 던져지지 않음");
    } catch (err) {
      expect((err as Error).message).not.toContain(TEST_API_KEY);
      expect((err as Error).message).toContain("***");
    }
  });

  it("fetcher 자체가 예외를 던져도(네트워크 오류 등) PsiApiError로 감싸고 키를 노출하지 않는다", async () => {
    const throwingFetcher: PsiFetcher = async () => {
      throw new Error(`ETIMEDOUT calling with key=${TEST_API_KEY}`);
    };
    const client = createPsiClient(TEST_API_KEY, throwingFetcher);
    try {
      await client.fetchFieldData(TEST_URL);
      expect.fail("에러가 던져지지 않음");
    } catch (err) {
      expect(err).toBeInstanceOf(PsiApiError);
      expect((err as Error).message).not.toContain(TEST_API_KEY);
    }
  });

  it("JSON으로 파싱할 수 없는 응답은 PsiApiError를 던진다", async () => {
    const nonJsonFetcher: PsiFetcher = async () => ({ status: 200, bodyText: "<html>not json</html>" });
    const client = createPsiClient(TEST_API_KEY, nonJsonFetcher);
    await expect(client.fetchFieldData(TEST_URL)).rejects.toThrow(PsiApiError);
  });

  it("요청 URL에 대상 페이지 URL과 API 키가 인코딩되어 포함된다", async () => {
    let capturedUrl = "";
    const capturingFetcher: PsiFetcher = async (url) => {
      capturedUrl = url;
      return { status: 200, bodyText: JSON.stringify({}) };
    };
    const client = createPsiClient(TEST_API_KEY, capturingFetcher);
    await client.fetchFieldData("https://example.com/some page?x=1");

    expect(capturedUrl).toContain("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    expect(capturedUrl).toContain(encodeURIComponent("https://example.com/some page?x=1"));
    expect(capturedUrl).toContain(`key=${TEST_API_KEY}`);
  });
});
