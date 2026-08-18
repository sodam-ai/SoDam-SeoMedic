import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { runGithubFix, GithubFixBlockedError } from "../../src/github/orchestrator.js";
import { getGithubRepoCacheRoot } from "../../src/github/repo-cache-path.js";
import type { GithubApiClient, RepoMeta, CreatedPullRequest } from "../../src/github/api-client-port.js";
import type { RepoRef } from "../../src/github/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = path.resolve(__dirname, "../fixtures/nextjs-minimal");

const cleanupDirs: string[] = [];
afterEach(() => {
  for (const dir of cleanupDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.SEOMEDIC_GITHUB_TOKEN;
});

/**
 * getGithubRepoCacheRoot는 owner/repo로 식별되는 "영속" 경로다(설계 의도 — sandbox를 지워도 회귀
 * 이력이 남아야 함). 그런데 이 파일의 테스트들이 전부 같은 REPO_REF를 쓰면, 한 테스트가 실제로
 * 남긴 github_pr 기록을 나중 테스트(심지어 나중 세션의 재실행까지)가 "이미 PR이 있다"고 오판해
 * 간헐적으로 실패한다(실제로 겪은 문제 — 프로덕션 로직은 정상, 테스트 격리 부족이 원인이었음).
 * 그래서 매 테스트 전에 이 REPO_REF의 영속 캐시를 강제로 비운다.
 */
beforeEach(() => {
  const cacheRoot = getGithubRepoCacheRoot(REPO_REF);
  fs.rmSync(cacheRoot, { recursive: true, force: true });
  fs.mkdirSync(cacheRoot, { recursive: true });
});

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "pipe" });
}

/**
 * fix-orchestrator-integration.test.ts와 같은 방식(전체 복사 + 별도 git repo)으로 "GitHub에 있는
 * 내 저장소"를 흉내낸다. 이 경로 자체를 FakeGithubApiClient.getCloneUrl()이 반환해, 실제 GitHub 없이
 * createSandboxClone이 여기서 clone하게 한다 — node_modules는 여기에도 없으므로(gitignore), sandbox에서
 * 실제로 npm install이 한 번 더 실행된다(실제 GitHub clone과 동일한 조건).
 */
function makeFakeUpstreamRepo(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "seomedic-gh-orch-upstream-"));
  cleanupDirs.push(tempDir);

  fs.cpSync(FIXTURE_ROOT, tempDir, { recursive: true, filter: (src) => !src.includes(`${path.sep}.next`) });
  fs.writeFileSync(path.join(tempDir, ".gitignore"), "node_modules/\n.next/\n.seomedic/\n");

  fs.mkdirSync(path.join(tempDir, "app", "about"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "app", "about", "page.tsx"), `export default function AboutPage() {\n  return <h1>About</h1>;\n}\n`);
  fs.writeFileSync(
    path.join(tempDir, "app", "page.tsx"),
    `export default function HomePage() {\n  return (\n    <div>\n      <h1>SeoMedic 테스트 픽스처</h1>\n      <a href="/about">About</a>\n    </div>\n  );\n}\n`,
  );

  git(tempDir, ["init", "-q"]);
  git(tempDir, ["add", "-A"]);
  git(tempDir, ["-c", "user.email=t@t.com", "-c", "user.name=t", "commit", "-q", "-m", "initial"]);
  return tempDir;
}

const DEFAULT_META: RepoMeta = {
  isArchived: false,
  isDisabled: false,
  hasLicense: true,
  hasContributing: true,
  sizeKb: 100,
  defaultBranch: "main",
};

function makeFakeClient(upstreamPath: string, overrides: Partial<GithubApiClient> = {}): GithubApiClient {
  return {
    getAuthenticatedLogin: async () => "test-user",
    getRepoMeta: async () => DEFAULT_META,
    forkExists: async () => true,
    createFork: async (ref: RepoRef) => ref,
    listOpenPrBranches: async () => [],
    createPullRequest: async (): Promise<CreatedPullRequest> => ({ number: 1, url: "https://github.com/test-user/repo/pull/1" }),
    getCloneUrl: () => upstreamPath,
    ...overrides,
  };
}

const REPO_REF: RepoRef = { owner: "test-user", repo: "repo" };

describe("runGithubFix — 실제 GitHub 없이 가짜 client로 전체 오케스트레이션 검증", () => {
  it("정책 통과 → 내 repo 판별 → sandbox clone+npm install → plan → apply → PR 생성까지 실제로 동작한다", async () => {
    process.env.SEOMEDIC_GITHUB_TOKEN = "fake-token-for-askpass-plumbing-only";
    const upstreamPath = makeFakeUpstreamRepo();
    const client = makeFakeClient(upstreamPath);

    const result = await runGithubFix(client, REPO_REF);

    expect(result.autoFixes).toHaveLength(1);
    expect(result.autoFixes[0].finding.rule_id).toBe("R-SITEMAP-MISSING-URL");
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0].outcome).toBe("applied");
    expect(result.pr).not.toBeNull();
    expect(result.pr!.number).toBe(1);
    expect(result.duplicateSkipped).toBe(false);
  }, 600_000);

  it("policy가 차단하면(archived) sandbox clone까지 가지 않고 즉시 실패한다", async () => {
    process.env.SEOMEDIC_GITHUB_TOKEN = "fake-token";
    const upstreamPath = makeFakeUpstreamRepo();
    const client = makeFakeClient(upstreamPath, {
      getRepoMeta: async () => ({ ...DEFAULT_META, isArchived: true }),
    });

    await expect(runGithubFix(client, REPO_REF)).rejects.toThrow(GithubFixBlockedError);
  }, 30_000);

  it("이미 같은 브랜치로 열린 PR이 있으면(중복) 적용·PR생성 없이 건너뛴다", async () => {
    process.env.SEOMEDIC_GITHUB_TOKEN = "fake-token";
    const upstreamPath = makeFakeUpstreamRepo();
    const client = makeFakeClient(upstreamPath, {
      listOpenPrBranches: async () => ["seomedic/fix-r-sitemap-missing-url"],
    });

    const result = await runGithubFix(client, REPO_REF);
    expect(result.duplicateSkipped).toBe(true);
    expect(result.applied).toHaveLength(0);
    expect(result.pr).toBeNull();
  }, 600_000);

  it("남의 repo면 fork 존재를 먼저 확인하고, 없으면 생성 후 폴링해 준비를 기다린다", async () => {
    process.env.SEOMEDIC_GITHUB_TOKEN = "fake-token";
    const upstreamPath = makeFakeUpstreamRepo();
    let forkCreated = false;
    let forkCheckCalls = 0;
    const client = makeFakeClient(upstreamPath, {
      getAuthenticatedLogin: async () => "someone-else", // repo owner("test-user")와 다름 → 남의 repo
      forkExists: async () => {
        forkCheckCalls++;
        return forkCreated; // createFork가 호출된 뒤에야 true
      },
      createFork: async (ref: RepoRef) => {
        forkCreated = true;
        return { owner: "someone-else", repo: ref.repo };
      },
    });

    const result = await runGithubFix(client, REPO_REF);
    expect(forkCheckCalls).toBeGreaterThan(0);
    expect(result.targetRef).toEqual({ owner: "someone-else", repo: "repo" });
  }, 600_000);
});
