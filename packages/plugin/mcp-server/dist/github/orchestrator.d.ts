import type { FindingRecord } from "../db/repositories/finding.js";
import { type PlannedFix } from "../fix-orchestrator/plan.js";
import { type AppliedFixOutcome } from "../fix-orchestrator/apply.js";
import type { RepoRef } from "./types.js";
import type { GithubApiClient, CreatedPullRequest } from "./api-client-port.js";
export declare class GithubFixBlockedError extends Error {
}
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
export declare function runGithubFix(client: GithubApiClient, repoRef: RepoRef, options?: RunGithubFixOptions): Promise<GithubFixResult>;
