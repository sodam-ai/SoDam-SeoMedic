import { checkGitClean, revertViaGitCheckout } from "../git-safety/git-guard.js";
import { openSeomedicDb, type SeomedicDb } from "../db/connection.js";
import { insertGithubPr } from "../db/repositories/github-pr.js";
import type { FindingRecord } from "../db/repositories/finding.js";
import { planLocalFix, type PlannedFix } from "../fix-orchestrator/plan.js";
import { applyLocalFixes, type AppliedFixOutcome } from "../fix-orchestrator/apply.js";
import { setApprovalStatus } from "../db/repositories/fix.js";
import { createSandboxClone } from "./sandbox.js";
import { installDependenciesSafely } from "./npm-install.js";
import { getGithubToken, createAskpassScript, type AskpassScript } from "./token.js";
import { getGithubRepoCacheRoot } from "./repo-cache-path.js";
import { isOwnRepo, waitForForkReady } from "./permission.js";
import { evaluateRepoPolicy } from "./policy.js";
import { checkDuplicatePr } from "./duplicate-guard.js";
import { buildPrContent } from "./pr-builder.js";
import { createFixBranch, commitAll, pushFixBranch } from "./git-ops.js";
import type { RepoRef } from "./types.js";
import type { GithubApiClient, CreatedPullRequest, RepoMeta } from "./api-client-port.js";

export class GithubFixBlockedError extends Error {}

/** 한 브랜치·한 PR의 결과. safe(add_safe만)와 review(gated만)로 항상 분리된다(2026-08-20 재설계). */
export interface GithubFixBucketResult {
  branchName: string;
  autoFixes: PlannedFix[];
  gatedFixes: PlannedFix[];
  reportOnlyFindings: FindingRecord[];
  applied: AppliedFixOutcome[];
  pr: CreatedPullRequest | null;
  duplicateSkipped: boolean;
}

export interface GithubFixResult {
  targetRef: RepoRef;
  policyWarnings: string[];
  /** add_safe(무해한 추가)만 담은 PR — 저장소 관리자가 부담 없이 바로 검토할 수 있는 쪽. */
  safe: GithubFixBucketResult;
  /** gated(색인·표시 영향)만 담은 PR — 반드시 diff를 직접 검토해야 하는 쪽. */
  review: GithubFixBucketResult;
}

export interface RunGithubFixOptions {
  maxRepoSizeKb?: number;
}

const SAFE_BRANCH_NAME = "seomedic/fix-safe";
const REVIEW_BRANCH_NAME = "seomedic/fix-review";

interface RunFixBucketOptions {
  client: GithubApiClient;
  repoRef: RepoRef;
  targetRef: RepoRef;
  meta: RepoMeta;
  db: SeomedicDb;
  askpass: AskpassScript;
  isFork: boolean;
  branchName: string;
  bucket: "safe" | "review";
  maxRepoSizeKb?: number;
}

/**
 * 위험도 하나(add_safe 또는 gated)만 담당하는 독립 clone→plan→apply→PR 사이클 하나를 수행한다.
 *
 * ⚠️ 2026-08-20 설계 결정: 왜 "한 clone에서 두 브랜치를 나눠 커밋"하지 않고 **매 bucket마다 완전히
 * 새로 clone**하는가 — 같은 작업 폴더에서 브랜치를 오가며 파일별로 골라 커밋하는 방식도 가능했지만,
 * 그러려면 "브랜치 A 커밋 후 원래 상태로 되돌리고 브랜치 B 시작" 단계에서 되돌리기가 불완전하면
 * (예: git clean 누락) B 브랜치에 A의 변경이 섞여 들어가는 조용한 오염 위험이 있다. 매번 완전히
 * 새로운 clone에서 시작하면 이 위험이 구조적으로 없다 — 대신 clone·npm install·next build를
 * 두 번(bucket마다 한 번씩) 하게 돼 전체 소요시간이 늘어난다. 이 프로젝트가 반복해서 선택해 온
 * "속도보다 안전"(fixer 파일마다 로직을 중복 작성해 서로 건드리지 않게 한 것과 같은 원칙)을
 * 그대로 따른 것. 두 bucket을 병렬로 돌리지 않는 이유도 같다 — 로컬 렌더 브릿지 서버(포트 등)가
 * 동시 실행에도 안전한지 아직 검증되지 않아, 이번엔 순차 실행으로 확실한 쪽을 택했다(속도 개선은
 * 검증 후 별도 과제로 남긴다).
 */
async function runFixBucket(opts: RunFixBucketOptions): Promise<GithubFixBucketResult> {
  const { client, repoRef, targetRef, meta, db, askpass, branchName, bucket } = opts;

  const sandbox = await createSandboxClone({
    cloneUrl: client.getCloneUrl(targetRef),
    maxRepoSizeKb: opts.maxRepoSizeKb,
    fetchRepoSizeKb: async () => meta.sizeKb,
    env: askpass.env,
  });

  try {
    await installDependenciesSafely(sandbox.path);

    // npm install이 package-lock.json을 정규화해 dirty를 남길 수 있다(clone 직후 clean인데도) —
    // sandbox는 일회용이라 안전하게 되돌린다(node_modules는 gitignore돼 checkout에 영향 없음).
    const postInstallStatus = await checkGitClean(sandbox.path);
    if (!postInstallStatus.clean && postInstallStatus.reason === "dirty") {
      await revertViaGitCheckout(sandbox.path, ["."]);
    }

    const planResult = await planLocalFix(db, sandbox.path, {
      projectTargetOverride: `github.com/${repoRef.owner}/${repoRef.repo}`,
    });

    const autoFixes = bucket === "safe" ? planResult.plannedFixes.filter((f) => f.fix.approval_status === "auto") : [];
    const gatedFixes = bucket === "review" ? planResult.plannedFixes.filter((f) => f.fix.approval_status === "pending") : [];

    const baseResult: GithubFixBucketResult = {
      branchName,
      autoFixes,
      gatedFixes,
      reportOnlyFindings: planResult.reportOnlyFindings,
      applied: [],
      pr: null,
      duplicateSkipped: false,
    };

    const fixesToApply = [...autoFixes, ...gatedFixes];
    if (fixesToApply.length === 0) {
      return baseResult;
    }

    // review 버킷에서만 gated를 승인 전이한다 — PR 자체가 승인 절차라는 원칙(2026-08-20)은 그대로 유지.
    // 사용자 로컬 프로젝트 승인 이력과 무관한, github 캐시 전용 DB 한정.
    for (const gated of gatedFixes) {
      setApprovalStatus(db, gated.fix.id, "approved");
    }

    const duplicate = await checkDuplicatePr(db, repoRef.owner, repoRef.repo, branchName, () =>
      client.listOpenPrBranches(repoRef),
    );
    if (duplicate.isDuplicate) {
      return { ...baseResult, duplicateSkipped: true };
    }

    // onlyFixIds 필수 — 이 bucket의 plan도 원본 저장소에 실재하는 다른 위험도의 문제를 독립적으로
    // 또 발견한다(예: review bucket도 add_safe인 sitemap 갭을 자기 plan에서 다시 잡음). 그걸 그냥
    // 두면 approval_status='auto'라 무조건 적용돼 review 브랜치에 add_safe 변경까지 섞여 들어간다
    // (실제로 재현된 버그 — apply.ts의 ApplyLocalFixesOptions 주석 참고).
    const applied = await applyLocalFixes(db, sandbox.path, planResult.auditRunId, {
      onlyFixIds: fixesToApply.map((f) => f.fix.id),
    });
    const succeeded = applied.filter((a) => a.outcome === "applied" || a.outcome === "already_applied");
    if (succeeded.length === 0) {
      return { ...baseResult, applied };
    }

    // PR 본문은 실제로 diff에 반영된(성공한) fix만 나열한다 — 계획됐지만 build 실패로 롤백된 항목까지
    // 넣으면 설명과 실제 diff가 어긋나는 신뢰 문제가 생긴다.
    const succeededFixIds = new Set(succeeded.map((a) => a.fixId));
    const succeededFixes = fixesToApply.filter((f) => succeededFixIds.has(f.fix.id));
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
      isFork: opts.isFork,
      branchName,
      prNumber: pr.number,
      prUrl: pr.url,
    });

    return { ...baseResult, applied, pr, duplicateSkipped: false };
  } finally {
    await sandbox.cleanup();
  }
}

/**
 * GitHub 저장소 대상 fix 전체 흐름을 수행한다. **위험도별로 완전히 분리된 두 PR**을 만든다
 * (2026-08-20 재설계, 사용자 확정 결정) — add_safe(무해한 추가)만 담은 PR과 gated(색인·표시 영향)만
 * 담은 PR을 나눠, 저장소 관리자가 "안전한 건 바로 머지, 중요한 건 따로 검토"할 수 있게 한다.
 * 이전엔(2026-08-20 이전 커밋) 하나의 PR에 섞여 있어 일부만 골라 승인할 방법이 없었다.
 *
 * client는 실제 GitHub API를 호출하는 구현을 주입받는다 — client 인터페이스에만 의존해 작성돼 있어,
 * 가짜(fake) client로 실제 GitHub 없이도 전체 배선을 검증할 수 있다.
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
    const shared = { client, repoRef, targetRef, meta, db, askpass, isFork: !own, maxRepoSizeKb: options.maxRepoSizeKb };

    // 순차 실행(의도적) — runFixBucket 주석 참고.
    const safe = await runFixBucket({ ...shared, branchName: SAFE_BRANCH_NAME, bucket: "safe" });
    const review = await runFixBucket({ ...shared, branchName: REVIEW_BRANCH_NAME, bucket: "review" });

    return { targetRef, policyWarnings: policy.warnings, safe, review };
  } finally {
    db.close();
    askpass.cleanup();
  }
}
