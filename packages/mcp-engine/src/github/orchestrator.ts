import { checkGitClean, revertViaGitCheckout } from "../git-safety/git-guard.js";
import { openSeomedicDb } from "../db/connection.js";
import { insertGithubPr } from "../db/repositories/github-pr.js";
import type { FindingRecord } from "../db/repositories/finding.js";
import { planLocalFix, type PlannedFix } from "../fix-orchestrator/plan.js";
import { applyLocalFixes, type AppliedFixOutcome } from "../fix-orchestrator/apply.js";
import { createSandboxClone } from "./sandbox.js";
import { installDependenciesSafely } from "./npm-install.js";
import { getGithubToken, createAskpassScript } from "./token.js";
import { getGithubRepoCacheRoot } from "./repo-cache-path.js";
import { isOwnRepo, waitForForkReady } from "./permission.js";
import { evaluateRepoPolicy } from "./policy.js";
import { checkDuplicatePr } from "./duplicate-guard.js";
import { buildFixBranchName, buildPrContent } from "./pr-builder.js";
import { createFixBranch, commitAll, pushFixBranch } from "./git-ops.js";
import type { RepoRef } from "./types.js";
import type { GithubApiClient, CreatedPullRequest } from "./api-client-port.js";

export class GithubFixBlockedError extends Error {}

export interface GithubFixResult {
  targetRef: RepoRef;
  policyWarnings: string[];
  auditRunId: number;
  autoFixes: PlannedFix[];
  gatedFindings: FindingRecord[];
  reportOnlyFindings: FindingRecord[];
  applied: AppliedFixOutcome[];
  pr: CreatedPullRequest | null;
  duplicateSkipped: boolean;
}

export interface RunGithubFixOptions {
  maxRepoSizeKb?: number;
}

/**
 * GitHub 저장소 대상 fix 전체 흐름을 한 번에 수행한다(현재는 add_safe만 자동 적용·PR — gated 항목은
 * 대화형 승인이 불가능한 1회성 흐름이라 "확인됨"으로만 보고하고 자동 적용하지 않는다. 지금 유일한
 * fixer가 add_safe라 이 제약이 당장 문제 되지 않지만, gated fixer가 생기면 재검토 필요).
 *
 * client는 실제 GitHub API를 호출하는 구현(api-client.ts, 아직 미작성)을 주입받는다 — 이 함수 자체는
 * client 인터페이스에만 의존해 작성돼 있어, 가짜(fake) client로 실제 GitHub 없이도 전체 배선을
 * 검증할 수 있다(sandbox.ts의 fetchRepoSizeKb 주입 패턴과 동일 원칙).
 */
export async function runGithubFix(
  client: GithubApiClient,
  repoRef: RepoRef,
  options: RunGithubFixOptions = {},
): Promise<GithubFixResult> {
  const login = await client.getAuthenticatedLogin();
  const meta = await client.getRepoMeta(repoRef);

  const policy = evaluateRepoPolicy(meta);
  if (!policy.allowed) {
    throw new GithubFixBlockedError(policy.blockReason ?? "정책에 의해 차단되었습니다");
  }

  const own = isOwnRepo(login, repoRef.owner);
  let targetRef: RepoRef = repoRef;
  if (!own) {
    const alreadyForked = await client.forkExists(repoRef, login);
    if (!alreadyForked) {
      targetRef = await client.createFork(repoRef);
      await waitForForkReady(() => client.forkExists(repoRef, login));
    } else {
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
      const gatedFindings = planResult.plannedFixes
        .filter((f) => f.fix.approval_status !== "auto")
        .map((f) => f.finding);

      const baseResult = {
        targetRef,
        policyWarnings: policy.warnings,
        auditRunId: planResult.auditRunId,
        autoFixes,
        gatedFindings,
        reportOnlyFindings: planResult.reportOnlyFindings,
      };

      if (autoFixes.length === 0) {
        return { ...baseResult, applied: [], pr: null, duplicateSkipped: false };
      }

      // 지금은 fixer가 sitemap 하나뿐이라 브랜치 하나로 충분 — fixer가 늘면 rule_id별로 나눌지 재검토 필요.
      const branchName = buildFixBranchName(autoFixes[0].finding.rule_id);

      const duplicate = await checkDuplicatePr(db, repoRef.owner, repoRef.repo, branchName, () =>
        client.listOpenPrBranches(repoRef),
      );
      if (duplicate.isDuplicate) {
        return { ...baseResult, applied: [], pr: null, duplicateSkipped: true };
      }

      const applied = await applyLocalFixes(db, sandbox.path, planResult.auditRunId);
      const succeeded = applied.filter((a) => a.outcome === "applied" || a.outcome === "already_applied");
      if (succeeded.length === 0) {
        return { ...baseResult, applied, pr: null, duplicateSkipped: false };
      }

      await createFixBranch(sandbox.path, branchName);
      await commitAll(sandbox.path, `[SeoMedic] ${autoFixes[0].finding.rule_id} 자동 수정`, askpass.env);
      await pushFixBranch(sandbox.path, branchName, askpass.env);

      const prContent = buildPrContent(autoFixes);
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
    } finally {
      await sandbox.cleanup();
    }
  } finally {
    db.close();
    askpass.cleanup();
  }
}
