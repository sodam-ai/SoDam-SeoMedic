import { describe, it, expect, afterEach } from "vitest";
import { loadIntegrationCredentialPath, IntegrationCredentialError } from "../../src/integrations/credential-loader.js";

const TEST_ENV_VAR = "SEOMEDIC_TEST_INTEGRATION_CRED_PATH";

afterEach(() => {
  delete process.env[TEST_ENV_VAR];
});

describe("loadIntegrationCredentialPath — 자격증명 경로 env-only 로딩(github/token.ts와 동일 원칙)", () => {
  it("env var가 설정돼 있으면 경로 문자열을 그대로 반환한다", () => {
    process.env[TEST_ENV_VAR] = "/secure/path/to/service-account.json";
    expect(loadIntegrationCredentialPath(TEST_ENV_VAR)).toBe("/secure/path/to/service-account.json");
  });

  it("env var가 설정되지 않으면 IntegrationCredentialError를 던지고, 메시지에 env var 이름을 포함한다", () => {
    expect(() => loadIntegrationCredentialPath(TEST_ENV_VAR)).toThrow(IntegrationCredentialError);
    try {
      loadIntegrationCredentialPath(TEST_ENV_VAR);
      expect.fail("에러가 던져지지 않음");
    } catch (err) {
      expect(err).toBeInstanceOf(IntegrationCredentialError);
      expect((err as Error).message).toContain(TEST_ENV_VAR);
    }
  });

  it("env var가 빈 문자열이거나 공백만 있으면 마찬가지로 거부한다(fail-closed)", () => {
    process.env[TEST_ENV_VAR] = "";
    expect(() => loadIntegrationCredentialPath(TEST_ENV_VAR)).toThrow(IntegrationCredentialError);

    process.env[TEST_ENV_VAR] = "   ";
    expect(() => loadIntegrationCredentialPath(TEST_ENV_VAR)).toThrow(IntegrationCredentialError);
  });

  it("에러 메시지는 env var 이름 외의 값을 노출하지 않는다(장황한 덤프·실제 값 조합 없음)", () => {
    try {
      loadIntegrationCredentialPath(TEST_ENV_VAR);
      expect.fail("에러가 던져지지 않음");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain(TEST_ENV_VAR);
      expect(message.length).toBeLessThan(200); // 전체 process.env 덤프 같은 유출이 아님을 방증
    }
  });

  it("서로 다른 env var 이름을 넣으면 에러 메시지도 그 이름을 정확히 반영한다(하드코딩된 문구 아님)", () => {
    const otherVar = "SEOMEDIC_TEST_OTHER_CRED_PATH";
    delete process.env[otherVar];
    try {
      loadIntegrationCredentialPath(otherVar);
      expect.fail("에러가 던져지지 않음");
    } catch (err) {
      expect((err as Error).message).toContain(otherVar);
      expect((err as Error).message).not.toContain(TEST_ENV_VAR);
    }
  });
});
