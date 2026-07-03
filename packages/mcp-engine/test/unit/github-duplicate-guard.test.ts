import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { openSeomedicDb } from "../../src/db/connection.js";
import { createProject } from "../../src/db/repositories/project.js";
import { insertGithubPr, findOpenGithubPrByBranch, setGithubPrState } from "../../src/db/repositories/github-pr.js";
import { checkDuplicatePr } from "../../src/github/duplicate-guard.js";

const cleanupDirs: string[] = [];
afterEach(() => {
  for (const dir of cleanupDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function makeTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seomedic-dup-guard-test-"));
  cleanupDirs.push(dir);
  return openSeomedicDb(dir);
}

describe("github_pr 리포지토리 — 실제 SQLite", () => {
  it("insertGithubPr로 저장하고 findOpenGithubPrByBranch로 조회한다", () => {
    const db = makeTempDb();
    const project = createProject(db, { target: "github.com/o/r", mode: "analyze-fix", sourceAvailable: true });
    const pr = insertGithubPr(db, {
      projectId: project.id,
      repoOwner: "o",
      repoName: "r",
      isFork: false,
      branchName: "seomedic/fix-x",
      prNumber: 42,
      prUrl: "https://github.com/o/r/pull/42",
    });
    expect(pr.state).toBe("open");

    const found = findOpenGithubPrByBranch(db, "o", "r", "seomedic/fix-x");
    expect(found?.id).toBe(pr.id);
    db.close();
  });

  it("state가 closed로 바뀌면 findOpenGithubPrByBranch가 더 이상 찾지 않는다", () => {
    const db = makeTempDb();
    const project = createProject(db, { target: "github.com/o/r", mode: "analyze-fix", sourceAvailable: true });
    const pr = insertGithubPr(db, {
      projectId: project.id,
      repoOwner: "o",
      repoName: "r",
      isFork: false,
      branchName: "seomedic/fix-x",
    });
    setGithubPrState(db, pr.id, "closed");
    expect(findOpenGithubPrByBranch(db, "o", "r", "seomedic/fix-x")).toBeUndefined();
    db.close();
  });
});

describe("checkDuplicatePr", () => {
  it("DB에 열린 PR 기록이 있으면 API를 확인할 필요 없이 중복으로 판단한다", async () => {
    const db = makeTempDb();
    const project = createProject(db, { target: "github.com/o/r", mode: "analyze-fix", sourceAvailable: true });
    insertGithubPr(db, { projectId: project.id, repoOwner: "o", repoName: "r", isFork: false, branchName: "seomedic/fix-x" });

    let apiCalled = false;
    const result = await checkDuplicatePr(db, "o", "r", "seomedic/fix-x", async () => {
      apiCalled = true;
      return [];
    });

    expect(result.isDuplicate).toBe(true);
    expect(result.reason).toContain("DB");
    db.close();
  });

  it("DB엔 없지만 GitHub에 이미 같은 브랜치로 열린 PR이 있으면 중복으로 판단한다(API 이중 확인)", async () => {
    const db = makeTempDb();
    const result = await checkDuplicatePr(db, "o", "r", "seomedic/fix-x", async () => ["seomedic/fix-x"]);
    expect(result.isDuplicate).toBe(true);
    expect(result.reason).toContain("GitHub");
    db.close();
  });

  it("DB에도 API에도 없으면 중복이 아니다", async () => {
    const db = makeTempDb();
    const result = await checkDuplicatePr(db, "o", "r", "seomedic/fix-x", async () => []);
    expect(result.isDuplicate).toBe(false);
    expect(result.reason).toBeNull();
    db.close();
  });
});
