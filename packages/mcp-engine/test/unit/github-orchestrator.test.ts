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
 *
 * 이 픽스처는 add_safe(R-SITEMAP-MISSING-URL, "/about" 페이지가 sitemap.ts에 없음) 1건과
 * gated(R-AI-CRAWLER-POLICY, app/robots.ts 없음) 1건을 **동시에** 만든다 — 2026-08-20 위험도별 PR
 * 분리 재설계 이후, safe bucket과 review bucket이 각각 1건씩 독립적으로 처리하는지 검증하는 데 쓰인다.
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

/**
 * 2026-08-20 재검토(gated 항목이 PR에 반영되도록 바뀐 뒤) — "gated 문제 2개 이상이 같은 페이지·같은
 * 파일에 동시에 있는" 실무에서 흔한 시나리오를 검증하기 위한 전용 픽스처. 홈페이지 하나에 canonical
 * 누락(R-CANONICAL-MISSING)·noindex(R-NOINDEX-DETECTED)·OG 누락(R-OG-BASIC-MISSING) 3개를 동시에
 * 심는다 — title은 있어서 OG가 복사할 값이 있고, alternates.canonical은 없고, robots.index는 false.
 * sitemap.ts는 원본 그대로("/") 둬서 R-SITEMAP-MISSING-URL은 섞이지 않게 한다(홈페이지만 크롤되므로,
 * safe bucket은 항상 비어있다 — gated만 4종 몰리는 review bucket 단독 테스트용).
 */
function makeFakeUpstreamRepoWithStackedGatedFindings(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "seomedic-gh-orch-stacked-gated-"));
  cleanupDirs.push(tempDir);

  fs.cpSync(FIXTURE_ROOT, tempDir, { recursive: true, filter: (src) => !src.includes(`${path.sep}.next`) });
  fs.writeFileSync(path.join(tempDir, ".gitignore"), "node_modules/\n.next/\n.seomedic/\n");

  fs.writeFileSync(
    path.join(tempDir, "app", "page.tsx"),
    `export const metadata = {\n  title: "SeoMedic 테스트 픽스처",\n  robots: {\n    index: false,\n  },\n};\n\nexport default function HomePage() {\n  return (\n    <div>\n      <h1>SeoMedic 테스트 픽스처</h1>\n    </div>\n  );\n}\n`,
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

describe("runGithubFix — 실제 GitHub 없이 가짜 client로 전체 오케스트레이션 검증(위험도별 PR 2개 분리)", () => {
  it("add_safe와 gated가 동시에 있으면 safe/review 두 PR로 각각 독립 분리된다", async () => {
    process.env.SEOMEDIC_GITHUB_TOKEN = "fake-token-for-askpass-plumbing-only";
    const upstreamPath = makeFakeUpstreamRepo();
    const client = makeFakeClient(upstreamPath);

    const result = await runGithubFix(client, REPO_REF);

    expect(result.safe.branchName).toBe("seomedic/fix-safe");
    expect(result.safe.autoFixes).toHaveLength(1);
    expect(result.safe.autoFixes[0].finding.rule_id).toBe("R-SITEMAP-MISSING-URL");
    expect(result.safe.gatedFixes).toHaveLength(0);
    expect(result.safe.applied).toHaveLength(1);
    expect(result.safe.applied[0].outcome).toBe("applied");
    expect(result.safe.pr).not.toBeNull();

    expect(result.review.branchName).toBe("seomedic/fix-review");
    expect(result.review.autoFixes).toHaveLength(0);
    expect(result.review.gatedFixes).toHaveLength(1);
    expect(result.review.gatedFixes[0].finding.rule_id).toBe("R-AI-CRAWLER-POLICY");
    expect(result.review.applied).toHaveLength(1);
    expect(result.review.applied[0].outcome).toBe("applied");
    expect(result.review.pr).not.toBeNull();

    // 실제 로컬 "업스트림" 저장소에 두 브랜치가 각자 독립적으로 만들어졌는지, 서로의 변경이 섞이지
    // 않았는지 직접 확인한다(반환값만 믿지 않음).
    const safeSitemap = execFileSync("git", ["show", "seomedic/fix-safe:app/sitemap.ts"], { cwd: upstreamPath, encoding: "utf-8" });
    expect(safeSitemap).toContain("/about");
    const safeRobotsExists = (() => {
      try {
        execFileSync("git", ["cat-file", "-e", "seomedic/fix-safe:app/robots.ts"], { cwd: upstreamPath, stdio: "pipe" });
        return true;
      } catch {
        return false;
      }
    })();
    expect(safeRobotsExists).toBe(false); // safe 브랜치엔 gated(robots.ts)가 섞이면 안 됨

    const reviewRobots = execFileSync("git", ["show", "seomedic/fix-review:app/robots.ts"], { cwd: upstreamPath, encoding: "utf-8" });
    expect(reviewRobots).toContain("GPTBot");
  }, 900_000);

  it("gated 문제 여러 개가 같은 페이지·같은 파일에 겹쳐도 review PR 하나로 안전하게 합쳐진다(순차 적용 충돌 없음 실증)", async () => {
    process.env.SEOMEDIC_GITHUB_TOKEN = "fake-token-for-askpass-plumbing-only";
    const upstreamPath = makeFakeUpstreamRepoWithStackedGatedFindings();
    const client = makeFakeClient(upstreamPath);

    const result = await runGithubFix(client, REPO_REF);

    // sitemap 갭이 없어(홈페이지만 있고 sitemap.ts에 "/" 이미 존재) safe bucket은 항상 비어있다.
    expect(result.safe.autoFixes).toHaveLength(0);
    expect(result.safe.pr).toBeNull();

    // app/robots.ts가 없고 사이트 전체에 JSON-LD도 전혀 없는 기본 픽스처 그대로라, R-AI-CRAWLER-POLICY
    // ·R-JSONLD-WEBSITE-MISSING(둘 다 별도 파일)까지 포함해 gated 5종이 review bucket 하나에 전부
    // 몰린다 — "같은 파일 3개 + 다른 파일 2개"가 한 PR로 묶이는 조합 검증
    // (2026-08-20: R-JSONLD-WEBSITE-MISSING 신설로 4→5, 회귀 아님 — 의도한 동작 변화).
    const gatedRuleIds = result.review.gatedFixes.map((f) => f.finding.rule_id).sort();
    expect(gatedRuleIds).toEqual(
      ["R-AI-CRAWLER-POLICY", "R-CANONICAL-MISSING", "R-JSONLD-WEBSITE-MISSING", "R-NOINDEX-DETECTED", "R-OG-BASIC-MISSING"].sort(),
    );
    expect(result.review.applied).toHaveLength(5);
    expect(result.review.applied.every((a) => a.outcome === "applied")).toBe(true);
    expect(result.review.pr).not.toBeNull();

    // page.tsx 하나에 3개 fixer가 순서대로 파일을 다시 읽고 다시 쓰는데, 서로의 변경을 지우지 않고
    // 전부 누적 반영됐는지 실제 git 브랜치 내용으로 직접 확인한다(추측 금지 — 반환값만 믿지 않음).
    const pageContent = execFileSync("git", ["show", "seomedic/fix-review:app/page.tsx"], { cwd: upstreamPath, encoding: "utf-8" });
    expect(pageContent).toContain('title: "SeoMedic 테스트 픽스처"'); // 원래 있던 값 보존
    expect(pageContent).toContain('alternates: { canonical: "/" }'); // canonical 추가됨
    expect(pageContent).toContain("index: true"); // noindex 교정됨(false→true)
    expect(pageContent).toContain('openGraph: { title: "SeoMedic 테스트 픽스처" }'); // OG 추가됨

    const robotsContent = execFileSync("git", ["show", "seomedic/fix-review:app/robots.ts"], { cwd: upstreamPath, encoding: "utf-8" });
    expect(robotsContent).toContain("GPTBot"); // 다른 파일(robots.ts) 신규 생성도 같은 PR에 함께 반영됨

    const layoutContent = execFileSync("git", ["show", "seomedic/fix-review:app/layout.tsx"], { cwd: upstreamPath, encoding: "utf-8" });
    expect(layoutContent).toContain("application/ld+json"); // 또 다른 파일(layout.tsx) 수정도 같은 PR에 함께 반영됨
    expect(layoutContent).toContain("SeoMedic 테스트 픽스처");
  }, 900_000);

  it("policy가 차단하면(archived) sandbox clone까지 가지 않고 즉시 실패한다", async () => {
    process.env.SEOMEDIC_GITHUB_TOKEN = "fake-token";
    const upstreamPath = makeFakeUpstreamRepo();
    const client = makeFakeClient(upstreamPath, {
      getRepoMeta: async () => ({ ...DEFAULT_META, isArchived: true }),
    });

    await expect(runGithubFix(client, REPO_REF)).rejects.toThrow(GithubFixBlockedError);
  }, 120_000); // 2026-08-20 Windows CI 실측 실패로 30_000→120_000 상향: 이 테스트 자체는 실제 네트워크
  // 호출 없이(makeFakeUpstreamRepo가 로컬 git만 씀) 즉시 실패해야 정상이지만, 같은 파일의 다른 무거운
  // 테스트(각 500~900초)가 먼저 돌며 Windows CI 러너 자원을 다 써버린 뒤라 이 테스트 차례에 로컬 git
  // 서브프로세스(makeFakeUpstreamRepo의 init/commit)조차 30초를 넘겨 실패했다(CI 로그로 확인 —
  // 다른 4개 테스트는 전부 정상 통과, 이 테스트만 정확히 30000ms에서 타임아웃). 실제 로직이 느려진 게
  // 아니라 CI 자원 경합이 원인이라고 판단해 시간 상한만 넉넉히 늘렸다(다른 무거운 테스트들의 300_000~
  // 900_000과 비교하면 여전히 훨씬 짧게 유지 — 진짜 행(hang)이 나면 여전히 잡아낸다).

  it("safe 브랜치만 이미 열린 PR이 있으면(중복) safe는 건너뛰고 review는 독립적으로 정상 진행된다", async () => {
    process.env.SEOMEDIC_GITHUB_TOKEN = "fake-token";
    const upstreamPath = makeFakeUpstreamRepo();
    const client = makeFakeClient(upstreamPath, {
      listOpenPrBranches: async () => ["seomedic/fix-safe"], // review 브랜치는 중복 아님
    });

    const result = await runGithubFix(client, REPO_REF);

    expect(result.safe.duplicateSkipped).toBe(true);
    expect(result.safe.applied).toHaveLength(0);
    expect(result.safe.pr).toBeNull();

    // safe가 중복으로 건너뛰어도 review는 완전히 독립적으로(별도 clone) 정상 진행돼야 한다 —
    // 두 bucket이 서로의 실패/스킵에 영향받지 않는 격리 실증.
    expect(result.review.duplicateSkipped).toBe(false);
    expect(result.review.applied).toHaveLength(1);
    expect(result.review.pr).not.toBeNull();
  }, 900_000);

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
  }, 900_000);
});
