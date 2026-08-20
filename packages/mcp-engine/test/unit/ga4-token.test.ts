import { describe, it, expect, afterEach } from "vitest";
import { getGa4Config } from "../../src/integrations/ga4-token.js";

const ENV_KEYS = ["GSC_SERVICE_ACCOUNT_PATH", "GA4_PROPERTY_ID"] as const;
const originalEnv: Record<string, string | undefined> = {};

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

function setEnv(vars: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
    if (key in vars) process.env[key] = vars[key];
    else delete process.env[key];
  }
}

describe("getGa4Config — env var 기반 설정 로딩(fail-closed, GSC와 서비스계정 경로 공유)", () => {
  it("둘 다 설정되면 config를 반환한다", () => {
    setEnv({ GSC_SERVICE_ACCOUNT_PATH: "/fake/key.json", GA4_PROPERTY_ID: "123456789" });
    expect(getGa4Config()).toEqual({ keyFilePath: "/fake/key.json", propertyId: "123456789" });
  });

  it("둘 다 없으면 null(비활성)", () => {
    setEnv({});
    expect(getGa4Config()).toBeNull();
  });

  it("서비스계정 경로만 있고 속성 ID가 없으면 null", () => {
    setEnv({ GSC_SERVICE_ACCOUNT_PATH: "/fake/key.json" });
    expect(getGa4Config()).toBeNull();
  });

  it("속성 ID만 있고 서비스계정 경로가 없으면 null", () => {
    setEnv({ GA4_PROPERTY_ID: "123456789" });
    expect(getGa4Config()).toBeNull();
  });
});
