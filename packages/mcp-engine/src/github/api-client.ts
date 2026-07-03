import { Octokit } from "@octokit/rest";
import type { GithubApiClient, RepoMeta, CreatedPullRequest } from "./api-client-port.js";
import type { RepoRef } from "./types.js";

/**
 * ⚠️ 미검증 — 타입체크(tsc)까지만 통과했고, 실제 GitHub API 호출로 검증된 적은 아직 없다.
 * fork·PR 생성은 되돌리기 어려운 외부 부작용이 있어, 테스트용 토큰/저장소가 준비되기 전까지는
 * 이 파일의 함수를 실제로 호출하지 않는다(오케스트레이터·MCP 툴 등록까지는 배선해두되 실행은 보류).
 *
 * 특히 아래 필드 접근은 실제 응답으로 아직 재확인 못 했다 — 실사용 시 가장 먼저 깨질 가능성이 있는 지점:
 * - repos.createFork()의 반환 형태(포크된 저장소의 owner.login/name 위치)
 * - repos.getCommunityProfileMetrics()의 files.license/files.contributing null 여부 판정
 */
export function createOctokitGithubClient(token: string): GithubApiClient {
  const octokit = new Octokit({ auth: token });

  return {
    async getAuthenticatedLogin(): Promise<string> {
      const { data } = await octokit.users.getAuthenticated();
      return data.login;
    },

    async getRepoMeta(ref: RepoRef): Promise<RepoMeta> {
      const { data: repo } = await octokit.repos.get({ owner: ref.owner, repo: ref.repo });

      // community profile은 일부 저장소(예: fork 직후)에서 404를 낼 수 있어 실패해도 전체를 막지 않는다.
      const community = await octokit.repos
        .getCommunityProfileMetrics({ owner: ref.owner, repo: ref.repo })
        .then((res) => res.data)
        .catch(() => null);

      return {
        isArchived: repo.archived,
        isDisabled: repo.disabled ?? false,
        hasLicense: repo.license != null || community?.files?.license != null,
        hasContributing: community?.files?.contributing != null,
        sizeKb: repo.size,
        defaultBranch: repo.default_branch,
      };
    },

    async forkExists(ref: RepoRef, forkOwner: string): Promise<boolean> {
      try {
        const { data } = await octokit.repos.get({ owner: forkOwner, repo: ref.repo });
        return data.fork === true; // 이름만 같고 무관한 저장소를 fork로 오판하지 않도록 fork 플래그까지 확인
      } catch (err) {
        if (isNotFoundError(err)) return false;
        throw err;
      }
    },

    async createFork(ref: RepoRef): Promise<RepoRef> {
      const { data } = await octokit.repos.createFork({ owner: ref.owner, repo: ref.repo });
      return { owner: data.owner.login, repo: data.name };
    },

    async listOpenPrBranches(ref: RepoRef): Promise<string[]> {
      const { data } = await octokit.pulls.list({ owner: ref.owner, repo: ref.repo, state: "open", per_page: 100 });
      return data.map((pr) => pr.head.ref);
    },

    async createPullRequest(
      ref: RepoRef,
      opts: { title: string; body: string; headBranch: string; headOwner: string; baseBranch: string },
    ): Promise<CreatedPullRequest> {
      const { data } = await octokit.pulls.create({
        owner: ref.owner,
        repo: ref.repo,
        title: opts.title,
        body: opts.body,
        head: `${opts.headOwner}:${opts.headBranch}`,
        base: opts.baseBranch,
      });
      return { number: data.number, url: data.html_url };
    },

    getCloneUrl(ref: RepoRef): string {
      return `https://github.com/${ref.owner}/${ref.repo}.git`;
    },
  };
}

function isNotFoundError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "status" in err && (err as { status: unknown }).status === 404;
}
