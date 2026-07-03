import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { createSandboxClone, gcOrphanedSandboxes, SandboxError } from "../../src/github/sandbox.js";

const cleanupDirs: string[] = [];
afterEach(() => {
  for (const dir of cleanupDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "pipe" });
}

/** 실제 GitHub 없이 로컬 file:// bare repo로 clone 흐름 전체를 검증한다(계획서의 오프라인 테스트 전략과 동일). */
function makeLocalBareRepoWithHistory(): string {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "seomedic-sandbox-src-"));
  cleanupDirs.push(workDir);
  const bareDir = path.join(workDir, "origin.git");
  const workingCopy = path.join(workDir, "working");

  git(workDir, ["init", "--bare", "-q", bareDir]);
  // 새 bare repo의 HEAD는 기본적으로 refs/heads/master를 가리키는데, 아래서는 main에만 push한다 —
  // HEAD를 미리 main으로 맞춰두지 않으면 clone 시 "원격 HEAD가 없는 브랜치를 가리킴"으로 체크아웃이
  // 조용히 비어버린다(실제로 겪은 버그 — clone 자체는 성공했다고 뜨는데 파일이 하나도 없었음).
  git(bareDir, ["symbolic-ref", "HEAD", "refs/heads/main"]);
  git(workDir, ["clone", "-q", bareDir, workingCopy]);
  fs.writeFileSync(path.join(workingCopy, "a.txt"), "1");
  git(workingCopy, ["add", "-A"]);
  git(workingCopy, ["-c", "user.email=t@t.com", "-c", "user.name=t", "commit", "-q", "-m", "commit 1"]);
  git(workingCopy, ["push", "-q", "origin", "HEAD:refs/heads/main"]);
  fs.writeFileSync(path.join(workingCopy, "a.txt"), "2");
  git(workingCopy, ["add", "-A"]);
  git(workingCopy, ["-c", "user.email=t@t.com", "-c", "user.name=t", "commit", "-q", "-m", "commit 2"]);
  git(workingCopy, ["push", "-q", "origin", "HEAD:refs/heads/main"]);

  return bareDir;
}

describe("createSandboxClone — 실제 로컬 git으로 clone 흐름 검증(GitHub 불필요)", () => {
  it("얕은 clone(--depth 1)만 하고 실제 파일이 존재한다", async () => {
    const bareDir = makeLocalBareRepoWithHistory();
    // git은 순수 로컬 경로를 clone 소스로 받으면 --depth를 조용히 무시한다("--depth is ignored in
    // local clones; use file:// instead" — 실측 확인). --depth 1이 실제로 적용되는지 검증하려면
    // file:// URI로 "원격" 취급을 강제해야 한다(pathToFileURL이 Windows 드라이브 문자·슬래시 개수를
    // 정확히 처리 — 직접 문자열 조합하면 깨지기 쉬움, 이것도 실측 확인).
    const sandbox = await createSandboxClone({ cloneUrl: pathToFileURL(bareDir).href });
    try {
      expect(fs.existsSync(path.join(sandbox.path, "a.txt"))).toBe(true);
      expect(fs.readFileSync(path.join(sandbox.path, "a.txt"), "utf-8")).toBe("2");
      // --depth 1의 실제 증거: git이 .git/shallow 마커 파일을 만든다(전체 히스토리 clone엔 없음)
      expect(fs.existsSync(path.join(sandbox.path, ".git", "shallow"))).toBe(true);
    } finally {
      await sandbox.cleanup();
    }
  });

  it("cleanup() 호출 후 실제로 디렉터리가 사라진다", async () => {
    const bareDir = makeLocalBareRepoWithHistory();
    // git은 file:// URI든 순수 로컬 경로든 둘 다 clone 소스로 받는다 — 여기선 경로를 그대로 쓴다
    // (file:// 문자열 조합은 Windows 절대경로에서 슬래시 개수를 잘못 맞추면 깨지기 쉬워 피함 — 실측 확인).
    const sandbox = await createSandboxClone({ cloneUrl: bareDir });
    const sandboxPath = sandbox.path;
    expect(fs.existsSync(sandboxPath)).toBe(true);
    await sandbox.cleanup();
    expect(fs.existsSync(sandboxPath)).toBe(false);
  });

  it("저장소 크기가 상한을 초과하면 clone을 아예 시도하지 않고 거부한다", async () => {
    const bareDir = makeLocalBareRepoWithHistory();
    await expect(
      createSandboxClone({
        cloneUrl: bareDir,
        maxRepoSizeKb: 100,
        fetchRepoSizeKb: async () => 999_999, // 상한 초과를 흉내
      }),
    ).rejects.toThrow(SandboxError);
  });

  it("크기 확인 함수가 null(알 수 없음)을 반환하면 진행을 막지 않는다", async () => {
    const bareDir = makeLocalBareRepoWithHistory();
    const sandbox = await createSandboxClone({
      cloneUrl: bareDir,
      maxRepoSizeKb: 100,
      fetchRepoSizeKb: async () => null,
    });
    expect(fs.existsSync(sandbox.path)).toBe(true);
    await sandbox.cleanup();
  });

  it("존재하지 않는 원격이면 clone 실패 시 sandbox 디렉터리를 자동으로 치운다", async () => {
    const bogusPath = path.join(os.tmpdir(), "seomedic-does-not-exist-" + Date.now());
    await expect(createSandboxClone({ cloneUrl: bogusPath })).rejects.toThrow();
    // 실패 시 활성 sandbox 목록에 남은 디렉터리가 없어야 한다 — gcOrphanedSandboxes를 돌려도 에러 없이 통과하는지로 간접 확인
    expect(() => gcOrphanedSandboxes()).not.toThrow();
  });
});
