import { Octokit } from "@octokit/rest";
/**
 * ⚠️ 부분 검증됨 — 읽기 전용 메서드는 실제 GitHub 공개 저장소(octocat/Hello-World, 토큰 없이)로
 * 응답 형태를 직접 확인했다: `repos.get`의 archived/disabled/license/size/default_branch/fork,
 * `repos.getCommunityProfileMetrics`의 files.license/files.contributing, `pulls.list`의
 * head.ref 전부 이 파일이 가정한 형태와 실제로 일치함을 확인(1회성 프로브 스크립트로 검증 후 삭제).
 *
 * 여전히 미검증(쓰기 작업 — 토큰과 실제 실행 동의 없이는 검증 불가):
 * - `getAuthenticatedLogin`(인증 필요)
 * - `createFork`의 반환 형태(포크된 저장소의 owner.login/name 위치) — fork는 실제 저장소를 만드는
 *   되돌리기 어려운 부작용이라 아직 실행하지 않음
 * - `createPullRequest` — 실제 PR을 만드는 되돌리기 어려운 부작용이라 아직 실행하지 않음
 */
export function createOctokitGithubClient(token) {
    const octokit = new Octokit({ auth: token });
    return {
        async getAuthenticatedLogin() {
            const { data } = await octokit.users.getAuthenticated();
            return data.login;
        },
        async getRepoMeta(ref) {
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
        async forkExists(ref, forkOwner) {
            try {
                const { data } = await octokit.repos.get({ owner: forkOwner, repo: ref.repo });
                return data.fork === true; // 이름만 같고 무관한 저장소를 fork로 오판하지 않도록 fork 플래그까지 확인
            }
            catch (err) {
                if (isNotFoundError(err))
                    return false;
                throw err;
            }
        },
        async createFork(ref) {
            const { data } = await octokit.repos.createFork({ owner: ref.owner, repo: ref.repo });
            return { owner: data.owner.login, repo: data.name };
        },
        async listOpenPrBranches(ref) {
            const { data } = await octokit.pulls.list({ owner: ref.owner, repo: ref.repo, state: "open", per_page: 100 });
            return data.map((pr) => pr.head.ref);
        },
        async createPullRequest(ref, opts) {
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
        getCloneUrl(ref) {
            return `https://github.com/${ref.owner}/${ref.repo}.git`;
        },
    };
}
function isNotFoundError(err) {
    return typeof err === "object" && err !== null && "status" in err && err.status === 404;
}
//# sourceMappingURL=api-client.js.map