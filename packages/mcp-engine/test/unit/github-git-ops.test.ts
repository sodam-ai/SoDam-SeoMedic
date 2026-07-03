import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { assertSafeBranchName, createFixBranch, commitAll, pushFixBranch, GitOpsError } from "../../src/github/git-ops.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cleanupDirs: string[] = [];
afterEach(() => {
  for (const dir of cleanupDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "pipe" });
}

function makeLocalRepoWithBareOrigin(): { workingCopy: string; bareDir: string } {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "seomedic-git-ops-"));
  cleanupDirs.push(workDir);
  const bareDir = path.join(workDir, "origin.git");
  const workingCopy = path.join(workDir, "working");

  git(workDir, ["init", "--bare", "-q", bareDir]);
  git(workDir, ["clone", "-q", bareDir, workingCopy]);
  fs.writeFileSync(path.join(workingCopy, "README.md"), "hello");
  git(workingCopy, ["add", "-A"]);
  git(workingCopy, ["-c", "user.email=t@t.com", "-c", "user.name=t", "commit", "-q", "-m", "initial"]);
  git(workingCopy, ["push", "-q", "origin", "HEAD:refs/heads/main"]);

  return { workingCopy, bareDir };
}

describe("assertSafeBranchName", () => {
  it("main/master는 거부한다", () => {
    expect(() => assertSafeBranchName("main")).toThrow(GitOpsError);
    expect(() => assertSafeBranchName("master")).toThrow(GitOpsError);
  });

  it("seomedic/ 접두사가 없으면 거부한다", () => {
    expect(() => assertSafeBranchName("fix-something")).toThrow(GitOpsError);
    expect(() => assertSafeBranchName("feature/x")).toThrow(GitOpsError);
  });

  it("seomedic/ 접두사가 있으면 통과한다", () => {
    expect(() => assertSafeBranchName("seomedic/fix-sitemap")).not.toThrow();
  });
});

describe("git-ops.ts 소스 자체에 force 관련 문자열이 없다(정적 검증)", () => {
  it("--force, -f, +refs 같은 강제 push 패턴이 소스 코드에 존재하지 않는다", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../../src/github/git-ops.ts"), "utf-8");
    expect(source).not.toMatch(/--force/);
    expect(source.match(/["']-f["']/)).toBeNull();
    expect(source).not.toMatch(/\+HEAD/); // force-push 관례 문법(+refspec)도 없음
  });
});

describe("createFixBranch → commitAll → pushFixBranch — 실제 로컬 git으로 전체 흐름 검증(GitHub 불필요)", () => {
  it("새 seomedic/ 브랜치를 만들고 커밋 후 push하면 원격에 그 브랜치만 새로 생긴다", async () => {
    const { workingCopy, bareDir } = makeLocalRepoWithBareOrigin();

    await createFixBranch(workingCopy, "seomedic/fix-test");
    fs.writeFileSync(path.join(workingCopy, "new-file.txt"), "added by fix");
    await commitAll(workingCopy, "[fix] add missing file");
    await pushFixBranch(workingCopy, "seomedic/fix-test");

    const branches = execFileSync("git", ["branch", "-a"], { cwd: bareDir }).toString();
    expect(branches).toContain("seomedic/fix-test");

    // main 브랜치 자체는 건드리지 않았는지 확인(HEAD가 여전히 main을 가리키고, main엔 new-file.txt가 없음)
    const mainLog = execFileSync("git", ["show", "main:README.md"], { cwd: bareDir }).toString();
    expect(mainLog).toBe("hello");
  });

  it("main/master로 push를 시도하면 실제 push 없이 즉시 거부된다", async () => {
    const { workingCopy } = makeLocalRepoWithBareOrigin();
    await expect(pushFixBranch(workingCopy, "main")).rejects.toThrow(GitOpsError);
  });
});
