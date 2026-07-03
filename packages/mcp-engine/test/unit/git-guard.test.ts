import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { checkGitClean, backupFiles, revertViaGitCheckout } from "../../src/git-safety/git-guard.js";

const cleanupDirs: string[] = [];
afterEach(() => {
  for (const dir of cleanupDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function makeGitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seomedic-git-test-"));
  cleanupDirs.push(dir);
  execFileSync("git", ["-C", dir, "init", "-q"]);
  execFileSync("git", ["-C", dir, "config", "user.email", "test@example.com"]);
  execFileSync("git", ["-C", dir, "config", "user.name", "test"]);
  fs.writeFileSync(path.join(dir, "file.txt"), "hello\n");
  execFileSync("git", ["-C", dir, "add", "."]);
  execFileSync("git", ["-C", dir, "commit", "-q", "-m", "init"]);
  return dir;
}

describe("checkGitClean — 실제 git 저장소", () => {
  it("커밋 직후(clean)는 clean:true", async () => {
    const repo = makeGitRepo();
    const status = await checkGitClean(repo);
    expect(status.clean).toBe(true);
  });

  it("파일을 수정하면(dirty) clean:false, reason:dirty", async () => {
    const repo = makeGitRepo();
    fs.writeFileSync(path.join(repo, "file.txt"), "changed\n");
    const status = await checkGitClean(repo);
    expect(status.clean).toBe(false);
    if (!status.clean) expect(status.reason).toBe("dirty");
  });

  it("추적 안 된 새 파일도 dirty로 판정", async () => {
    const repo = makeGitRepo();
    fs.writeFileSync(path.join(repo, "new-file.txt"), "new\n");
    const status = await checkGitClean(repo);
    expect(status.clean).toBe(false);
  });

  it("git 저장소가 아닌 폴더는 not_a_repo", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seomedic-notgit-test-"));
    cleanupDirs.push(dir);
    const status = await checkGitClean(dir);
    expect(status.clean).toBe(false);
    if (!status.clean) expect(status.reason).toBe("not_a_repo");
  });

  it("PATH에 git이 없으면 실제로 git_not_found로 fail-closed", async () => {
    const repo = makeGitRepo();
    const originalPath = process.env.PATH;
    try {
      // spawn은 호출 시점의 process.env를 상속하므로, PATH를 git이 없는 값으로 실제 교체해 재현한다.
      process.env.PATH = "";
      if (process.platform === "win32") process.env.Path = "";
      const status = await checkGitClean(repo);
      expect(status.clean).toBe(false);
      if (!status.clean) expect(status.reason).toBe("git_not_found");
    } finally {
      process.env.PATH = originalPath;
    }
  });
});

describe("backupFiles / revertViaGitCheckout", () => {
  it("지정한 파일만 백업하고 manifest.json을 생성한다", () => {
    const repo = makeGitRepo();
    const manifest = backupFiles(repo, ["file.txt"], "run-1");
    expect(manifest).toHaveLength(1);
    expect(manifest[0].originalPath).toBe("file.txt");
    expect(fs.existsSync(manifest[0].backupPath)).toBe(true);
    expect(fs.readFileSync(manifest[0].backupPath, "utf-8")).toBe("hello\n");

    const manifestFile = path.join(repo, ".seomedic", "backups", "run-1", "manifest.json");
    expect(fs.existsSync(manifestFile)).toBe(true);
  });

  it("아직 존재하지 않는 파일(신규 생성 예정)은 백업 대상에서 제외", () => {
    const repo = makeGitRepo();
    const manifest = backupFiles(repo, ["does-not-exist.txt"], "run-2");
    expect(manifest).toHaveLength(0);
  });

  it("git checkout으로 실제 파일 변경을 되돌린다", async () => {
    const repo = makeGitRepo();
    fs.writeFileSync(path.join(repo, "file.txt"), "modified by fix\n");
    expect(fs.readFileSync(path.join(repo, "file.txt"), "utf-8")).toBe("modified by fix\n");

    await revertViaGitCheckout(repo, ["file.txt"]);
    // git의 core.autocrlf 설정에 따라 checkout 시 줄바꿈이 CRLF로 정규화될 수 있음(Windows 환경 실측 확인) —
    // 내용 자체가 커밋 시점으로 되돌아갔는지가 검증 목적이라 줄바꿈 차이는 정규화 후 비교한다.
    const restored = fs.readFileSync(path.join(repo, "file.txt"), "utf-8").replace(/\r\n/g, "\n");
    expect(restored).toBe("hello\n");
  });
});
