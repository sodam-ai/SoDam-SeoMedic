import { describe, it, expect } from "vitest";
import { isOwnRepo, waitForForkReady, ForkNotReadyError } from "../../src/github/permission.js";

describe("isOwnRepo", () => {
  it("대소문자 무관하게 같은 사용자면 true", () => {
    expect(isOwnRepo("Octocat", "octocat")).toBe(true);
    expect(isOwnRepo("octocat", "OCTOCAT")).toBe(true);
  });

  it("다른 사용자면 false", () => {
    expect(isOwnRepo("octocat", "someone-else")).toBe(false);
  });
});

describe("waitForForkReady", () => {
  it("첫 확인에 바로 준비돼 있으면 즉시 통과한다", async () => {
    await expect(waitForForkReady(async () => true)).resolves.toBeUndefined();
  });

  it("몇 번 실패 후 준비되면 결국 통과한다(폴링 동작 실증)", async () => {
    let calls = 0;
    const check = async () => {
      calls++;
      return calls >= 3;
    };
    await waitForForkReady(check, { intervalMs: 1 });
    expect(calls).toBe(3);
  });

  it("상한 횟수를 넘도록 준비되지 않으면 명확히 실패한다(무한 대기 금지)", async () => {
    await expect(waitForForkReady(async () => false, { maxAttempts: 2, intervalMs: 1 })).rejects.toThrow(
      ForkNotReadyError,
    );
  });
});
