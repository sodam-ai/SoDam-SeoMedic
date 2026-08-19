import { describe, it, expect, afterEach } from "vitest";
import { getPsiApiKey } from "../../src/integrations/psi-token.js";

const ENV_VAR = "PAGESPEED_API_KEY";
const original = process.env[ENV_VAR];

afterEach(() => {
  if (original === undefined) delete process.env[ENV_VAR];
  else process.env[ENV_VAR] = original;
});

describe("getPsiApiKey — env-only, 선택 기능(예외 대신 null)", () => {
  it("env var가 설정돼 있으면 값을 그대로 반환한다", () => {
    process.env[ENV_VAR] = "AIzaSyTestKeyValue";
    expect(getPsiApiKey()).toBe("AIzaSyTestKeyValue");
  });

  it("env var가 없으면 예외 없이 null을 반환한다(github/token.ts의 getGithubToken과 달리 선택 기능)", () => {
    delete process.env[ENV_VAR];
    expect(getPsiApiKey()).toBeNull();
  });

  it("env var가 빈 문자열이거나 공백만 있으면 마찬가지로 null(fail-closed)", () => {
    process.env[ENV_VAR] = "";
    expect(getPsiApiKey()).toBeNull();

    process.env[ENV_VAR] = "   ";
    expect(getPsiApiKey()).toBeNull();
  });
});
