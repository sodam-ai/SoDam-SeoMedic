import { describe, it, expect } from "vitest";
import { defaultAccessTokenProvider, GoogleAuthTokenError } from "../../src/integrations/google-auth-token.js";

const MISSING_KEY_PATH = "/definitely/does/not/exist/service-account.json";

describe("defaultAccessTokenProvider — google-auth-library 위임(실제 서비스계정 없이 테스트 가능한 경계만)", () => {
  it("존재하지 않는 키 파일 경로는 GoogleAuthTokenError로 감싸 던진다(내부 라이브러리 예외를 그대로 노출하지 않음)", async () => {
    await expect(defaultAccessTokenProvider(MISSING_KEY_PATH, ["https://www.googleapis.com/auth/webmasters.readonly"])).rejects.toThrow(
      GoogleAuthTokenError,
    );
  });

  it("에러 메시지에 키 파일 경로가 포함된다(경로는 시크릿이 아니라 디버깅에 유용해야 함)", async () => {
    try {
      await defaultAccessTokenProvider(MISSING_KEY_PATH, []);
      expect.fail("에러가 던져지지 않음");
    } catch (err) {
      expect((err as Error).message).toContain(MISSING_KEY_PATH);
    }
  });
});
