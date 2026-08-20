import { describe, it, expect, afterEach } from "vitest";
import { getGscConfig } from "../../src/integrations/gsc-token.js";

const ENV_KEYS = ["GSC_SERVICE_ACCOUNT_PATH", "GSC_PROPERTY_SCOPE"] as const;
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

describe("getGscConfig — env var 기반 설정 로딩(fail-closed)", () => {
  it("둘 다 설정되면 config를 반환한다", () => {
    setEnv({ GSC_SERVICE_ACCOUNT_PATH: "/fake/key.json", GSC_PROPERTY_SCOPE: "sc-domain:my-site.com" });
    expect(getGscConfig()).toEqual({ keyFilePath: "/fake/key.json", propertyScope: "sc-domain:my-site.com" });
  });

  it("둘 다 없으면 null(비활성)", () => {
    setEnv({});
    expect(getGscConfig()).toBeNull();
  });

  it("서비스계정 경로만 있고 속성이 없으면 null(부분 설정=설정 안 함과 동일 취급)", () => {
    setEnv({ GSC_SERVICE_ACCOUNT_PATH: "/fake/key.json" });
    expect(getGscConfig()).toBeNull();
  });

  it("속성만 있고 서비스계정 경로가 없으면 null", () => {
    setEnv({ GSC_PROPERTY_SCOPE: "sc-domain:my-site.com" });
    expect(getGscConfig()).toBeNull();
  });

  it("빈 문자열은 미설정과 동일하게 취급한다", () => {
    setEnv({ GSC_SERVICE_ACCOUNT_PATH: "  ", GSC_PROPERTY_SCOPE: "sc-domain:my-site.com" });
    expect(getGscConfig()).toBeNull();
  });
});
