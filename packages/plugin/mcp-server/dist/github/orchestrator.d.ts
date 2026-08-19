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
    /** finding까지 함께 담는다(FindingRecord[]가 아님) — 호출부가 result.applied(fixId 기준)와
     * 대조해 "실제로 PR diff에 들어갔는지"를 정확히 판별할 수 있어야 하기 때문(2026-08-20). */
    gatedFixes: PlannedFix[];
    reportOnlyFindings: FindingRecord[];
    applied: AppliedFixOutcome[];
    pr: CreatedPullRequest | null;
    duplicateSkipped: boolean;
}
export interface RunGithubFixOptions {
    maxRepoSizeKb?: number;
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
export declare function runGithubFix(client: GithubApiClient, repoRef: RepoRef, options?: RunGithubFixOptions): Promise<GithubFixResult>;
