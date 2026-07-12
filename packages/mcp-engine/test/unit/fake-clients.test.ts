import { describe, it, expect } from "vitest";
import { FakeGscClient, FakeGa4Client, FakePsiClient } from "../../src/integrations/fake-clients.js";

describe("fake 클라이언트 — 결정론적·오프라인 canned 데이터(네트워크 호출 없음)", () => {
  it("FakeGscClient.fetchSearchAnalyticsSummary — clicks/impressions/position이 있는 값을 반환한다", async () => {
    const client = new FakeGscClient();
    const result = await client.fetchSearchAnalyticsSummary("https://my-site.com");
    expect(result.propertyScope).toBe("https://my-site.com");
    expect(result.clicks).toBeGreaterThan(0);
    expect(result.impressions).toBeGreaterThan(0);
    expect(result.position).toBeGreaterThan(0);
  });

  it("FakeGscClient — 같은 입력에 항상 같은 값을 반환한다(결정론적)", async () => {
    const client = new FakeGscClient();
    const a = await client.fetchSearchAnalyticsSummary("https://my-site.com");
    const b = await client.fetchSearchAnalyticsSummary("https://my-site.com");
    expect(a).toEqual(b);
  });

  it("FakeGa4Client.fetchKeyMetrics — sessions/activeUsers가 있는 값을 반환한다", async () => {
    const client = new FakeGa4Client();
    const result = await client.fetchKeyMetrics("properties/123456");
    expect(result.propertyId).toBe("properties/123456");
    expect(result.sessions).toBeGreaterThan(0);
    expect(result.activeUsers).toBeGreaterThan(0);
  });

  it("FakePsiClient.fetchFieldData — lcp/cls/inp field 값과 isFieldData:true를 반환한다", async () => {
    const client = new FakePsiClient();
    const result = await client.fetchFieldData("https://my-site.com/");
    expect(result).not.toBeNull();
    expect(result?.url).toBe("https://my-site.com/");
    expect(result?.lcpMs).toBeGreaterThan(0);
    expect(result?.clsUnitless).toBeGreaterThanOrEqual(0);
    expect(result?.inpMs).toBeGreaterThan(0);
    expect(result?.isFieldData).toBe(true);
  });

  it("FakePsiClient — 같은 url에 항상 같은 값을 반환한다(결정론적)", async () => {
    const client = new FakePsiClient();
    const a = await client.fetchFieldData("https://my-site.com/");
    const b = await client.fetchFieldData("https://my-site.com/");
    expect(a).toEqual(b);
  });
});
