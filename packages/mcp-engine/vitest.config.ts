import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/unit/**/*.test.ts", "test/e2e/**/*.test.ts"],
    testTimeout: 30_000,
    // afterEach가 복사된 node_modules 전체를 재귀 삭제하는 통합테스트가 있어, vitest 기본
    // hookTimeout(10s)로는 느린 CI 러너(특히 windows-latest)에서 부족함이 실측으로 확인됨
    // (2026-07-06 CI 3-OS 검증: 로컬 SSD에선 문제없었으나 GitHub 호스트 Windows 러너에서
    // "Hook timed out in 10000ms"로 실패).
    hookTimeout: 60_000,
  },
});
