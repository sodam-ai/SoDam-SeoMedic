import { checkGitClean, revertViaGitCheckout } from "../git-safety/git-guard.js";
import { openSeomedicDb } from "../db/connection.js";
import { insertGithubPr } from "../db/repositories/github-pr.js";
import { planLocalFix } from "../fix-orchestrator/plan.js";
import { applyLocalFixes } from "../fix-orchestrator/apply.js";
import { setApprovalStatus } from "../db/repositories/fix.js";
import { createSandboxClone } from "./sandbox.js";
import { installDependenciesSafely } from "./npm-install.js";
import { getGithubToken, createAskpassScript } from "./token.js";
import { getGithubRepoCacheRoot } from "./repo-cache-path.js";
import { isOwnRepo, waitForForkReady } from "./permission.js";
import { evaluateRepoPolicy } from "./policy.js";
import { checkDuplicatePr } from "./duplicate-guard.js";
import { buildFixBranchName, buildPrContent } from "./pr-builder.js";
import { createFixBranch, commitAll, pushFixBranch } from "./git-ops.js";
export class GithubFixBlockedError extends Error {
}
/**
 * GitHub 저장소 대상 fix 전체 흐름을 한 번에 수행한다.
 *
 * ⚠️ 2026-08-20 재검토(PRD 재대조 감사로 발견): 원래는 add_safe만 자동 적용·PR에 담고, gated
 * 항목(canonical/OG/noindex/robots.ts 등)은 "대화형 승인이 불가능한 1회성 흐름"이라는 이유로
 * "확인됨"으로만 보고하고 브랜치에 전혀 반영하지 않았다 — 이 코드가 스스로 "gated fixer가 생기면
 * 재검토 필요"라고 예고해뒀는데, gated fixer가 4종(canonical/OG/noindex/robots.ts)이나 생긴 뒤로도
 * 방치돼 있었다.
 *
 * 재검토 결론: 로컬 모드에서 승인이 필요한 이유는 "승인 즉시 사용자 디스크에 파일이 반영"되기
 * 때문이다. GitHub 모드는 그 전제 자체가 다르다 — 여기서 만드는 모든 변경은 **PR(제안)일 뿐**이고,
 * 실제 저장소에는 사람이 명시적으로 머지해야만 반영된다(자동 머지 절대 금지는 이미 보장돼 있음,
 * git-ops.ts/policy.ts 참고). 즉 GitHub 모드에서는 **PR 자체가 이미 "diff 승인" 절차**이므로,
 * gated 항목도 브랜치에 반영해 PR diff로 사람이 직접 검토하게 하는 것이 로컬 모드의 승인 게이트를
 * 우회하는 게 아니라 같은 원칙(색인·표시 영향 변경은 diff 승인 후에만 반영)을 GitHub 모드의 실제
 * 검토 메커니즘(PR 리뷰·머지 결정)에 맞게 적용한 것이다. 그래서 이 함수는 gated fix를 이 github
 * 캐시 DB 안에서만 "approved"로 전이시켜 기존 applyLocalFixes를 그대로 재사용한다 — 이 approval은
 * 사용자의 로컬 프로젝트 승인 이력과는 완전히 분리된 DB(github 저장소 캐시 전용)에만 남는다.
 *
 * client는 실제 GitHub API를 호출하는 구현(api-client.ts, 아직 미작성)을 주입받는다 — 이 함수 자체는
 * client 인터페이스에만 의존해 작성돼 있어, 가짜(fake) client로 실제 GitHub 없이도 전체 배선을
 * 검증할 수 있다(sandbox.ts의 fetchRepoSizeKb 주입 패턴과 동일 원칙).
 */
export async function runGithubFix(client, repoRef, options = {}) {
    const login = await client.getAuthenticatedLogin();
    const meta = await client.getRepoMeta(repoRef);
    const policy = evaluateRepoPolicy(meta);
    if (!policy.allowed) {
        throw new GithubFixBlockedError(policy.blockReason ?? "정책에 의해 차단되었습니다");
    }
    const own = isOwnRepo(login, repoRef.owner);
    let targetRef = repoRef;
    if (!own) {
        const alreadyForked = await client.forkExists(repoRef, login);
        if (!alreadyForked) {
            targetRef = await client.createFork(repoRef);
            await waitForForkReady(() => client.forkExists(repoRef, login));
        }
        else {
            targetRef = { owner: login, repo: repoRef.repo };
        }
    }
    const askpass = createAskpassScript(getGithubToken());
    const cacheDbRoot = getGithubRepoCacheRoot(repoRef); // fork 여부와 무관하게 원본 저장소 기준으로 회귀 이력을 유지
    const db = openSeomedicDb(cacheDbRoot);
    try {
        const sandbox = await createSandboxClone({
            cloneUrl: client.getCloneUrl(targetRef),
            maxRepoSizeKb: options.maxRepoSizeKb,
            fetchRepoSizeKb: async () => meta.sizeKb,
            env: askpass.env,
        });
        try {
            await installDependenciesSafely(sandbox.path);
            // npm install은 --ignore-scripts를 줘도 package-lock.json을 자체적으로 정규화해 쓸 수 있다
            // (실제로 겪은 버그 — clone 직후엔 clean인데 install 한 번으로 다시 dirty가 돼 planLocalFix의
            // 자체 git-clean 확인에 걸림). sandbox는 우리만 쓰는 일회용 clone이라 사용자 작업이 아니므로,
            // install이 남긴 흔적은 안전하게 되돌린다(node_modules는 gitignore돼 있어 checkout에 영향 없음).
            const postInstallStatus = await checkGitClean(sandbox.path);
            if (!postInstallStatus.clean && postInstallStatus.reason === "dirty") {
                await revertViaGitCheckout(sandbox.path, ["."]);
            }
            const planResult = await planLocalFix(db, sandbox.path, {
                projectTargetOverride: `github.com/${repoRef.owner}/${repoRef.repo}`,
            });
            const autoFixes = planResult.plannedFixes.filter((f) => f.fix.approval_status === "auto");
            const gatedFixes = planResult.plannedFixes.filter((f) => f.fix.approval_status === "pending");
            const baseResult = {
                targetRef,
                policyWarnings: policy.warnings,
                auditRunId: planResult.auditRunId,
                autoFixes,
                gatedFixes,
                reportOnlyFindings: planResult.reportOnlyFindings,
            };
            const allFixesToApply = [...autoFixes, ...gatedFixes];
            if (allFixesToApply.length === 0) {
                return { ...baseResult, applied: [], pr: null, duplicateSkipped: false };
            }
            // 위 함수 주석 참고: GitHub 모드에서는 PR 자체가 승인 절차라, 여기서만 gated를 approved로
            // 전이시켜 applyLocalFixes(로컬 모드와 완전히 동일한 검증·백업·build재확인·롤백 로직)를 그대로
            // 재사용한다. 사용자 로컬 프로젝트의 승인 이력과는 무관한 github 캐시 DB 한정.
            for (const gated of gatedFixes) {
                setApprovalStatus(db, gated.fix.id, "approved");
            }
            // 브랜치는 하나로 유지한다(첫 fix의 rule_id로 결정론적 이름) — 여러 rule_id가 섞여도 duplicate-guard가
            // "같은 문제로 이미 PR을 냈는지" 판단할 기준은 그대로 필요하기 때문. rule_id별 브랜치 분리는 별도 재검토
            // 대상으로 남긴다(이번 변경 범위 밖 — 여기서 건드리면 duplicate-guard·PR 개수 정책까지 같이 바뀌어야 함).
            const branchName = buildFixBranchName(allFixesToApply[0].finding.rule_id);
            const duplicate = await checkDuplicatePr(db, repoRef.owner, repoRef.repo, branchName, () => client.listOpenPrBranches(repoRef));
            if (duplicate.isDuplicate) {
                return { ...baseResult, applied: [], pr: null, duplicateSkipped: true };
            }
            const applied = await applyLocalFixes(db, sandbox.path, planResult.auditRunId);
            const succeeded = applied.filter((a) => a.outcome === "applied" || a.outcome === "already_applied");
            if (succeeded.length === 0) {
                return { ...baseResult, applied, pr: null, duplicateSkipped: false };
            }
            // PR 본문은 "실제로 diff에 반영된 것"만 설명해야 한다 — 계획됐지만 build 실패로 롤백된 fix까지
            // 넣으면 PR 설명과 실제 diff가 어긋나는 신뢰 문제가 생긴다(gated 포함 전엔 자동수정 1종뿐이라
            // 드러나지 않았던 기존 결함 — 이번에 gated까지 포함하며 위험이 커져 함께 고친다).
            const succeededFixIds = new Set(succeeded.map((a) => a.fixId));
            const succeededFixes = allFixesToApply.filter((f) => succeededFixIds.has(f.fix.id));
            const prContent = buildPrContent(succeededFixes);
            await createFixBranch(sandbox.path, branchName);
            await commitAll(sandbox.path, prContent.title, askpass.env);
            await pushFixBranch(sandbox.path, branchName, askpass.env);
            const pr = await client.createPullRequest(repoRef, {
                title: prContent.title,
                body: prContent.body,
                headBranch: branchName,
                headOwner: targetRef.owner,
                baseBranch: meta.defaultBranch,
            });
            insertGithubPr(db, {
                projectId: planResult.projectId,
                repoOwner: repoRef.owner,
                repoName: repoRef.repo,
                isFork: !own,
                branchName,
                prNumber: pr.number,
                prUrl: pr.url,
            });
            return { ...baseResult, applied, pr, duplicateSkipped: false };
        }
        finally {
            await sandbox.cleanup();
        }
    }
    finally {
        db.close();
        askpass.cleanup();
    }
}
//# sourceMappingURL=orchestrator.js.map