import type { FindingRecord } from "../db/repositories/finding.js";
import { type PlannedFix } from "../fix-orchestrator/plan.js";
import { type AppliedFixOutcome } from "../fix-orchestrator/apply.js";
import type { RepoRef } from "./types.js";
import type { GithubApiClient, CreatedPullRequest } from "./api-client-port.js";
export declare class GithubFixBlockedError extends Error {
}
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
/**
 * GitHub 저장소 대상 fix 전체 흐름을 수행한다. **위험도별로 완전히 분리된 두 PR**을 만든다
 * (2026-08-20 재설계, 사용자 확정 결정) — add_safe(무해한 추가)만 담은 PR과 gated(색인·표시 영향)만
 * 담은 PR을 나눠, 저장소 관리자가 "안전한 건 바로 머지, 중요한 건 따로 검토"할 수 있게 한다.
 * 이전엔(2026-08-20 이전 커밋) 하나의 PR에 섞여 있어 일부만 골라 승인할 방법이 없었다.
 *
 * client는 실제 GitHub API를 호출하는 구현을 주입받는다 — client 인터페이스에만 의존해 작성돼 있어,
 * 가짜(fake) client로 실제 GitHub 없이도 전체 배선을 검증할 수 있다.
 */
export declare function runGithubFix(client: GithubApiClient, repoRef: RepoRef, options?: RunGithubFixOptions): Promise<GithubFixResult>;
