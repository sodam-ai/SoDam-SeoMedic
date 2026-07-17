import type { SeomedicDb } from "../db/connection.js";
export declare class FixApplyBlockedError extends Error {
    readonly reason: "dirty" | "git_not_found" | "not_a_repo";
    constructor(reason: "dirty" | "git_not_found" | "not_a_repo", message: string);
}
export type AppliedFixOutcomeKind = "applied" | "already_applied" | "build_failed" | "structure_changed";
export interface AppliedFixOutcome {
    fixId: number;
    targetPath: string | null;
    outcome: AppliedFixOutcomeKind;
    detail: string;
}
/**
 * plan 단계에서 만든 fix 중 auto/approved·미적용인 것만 실제로 파일에 반영한다.
 * fix마다 순차로: 멱등성 재확인(TOCTOU) → 백업 → 파일 쓰기 → `next build`만 재실행 →
 * 실패 시 git checkout으로 이 파일만 즉시 롤백. 하나가 실패해도 나머지 fix는 계속 시도한다
 * (서로 다른 파일을 건드릴 수 있어 한 실패가 전체를 막을 이유가 없음).
 *
 * git-clean 재확인은 "실제로 쓸 파일이 있을 때만" 한다 — findApplicableFixesByAuditRun이 이미
 * applied_at IS NULL만 걸러주므로, 재실행 시 적용 대상이 0건이면 아무것도 안 쓸 텐데 그때도
 * git-clean을 요구하면 "직전 apply가 남긴 리뷰 대기 중인 변경"만으로 재실행(멱등 확인) 자체가
 * 막혀버린다(실제로 재현된 버그 — PRD의 "fix 2회 실행해도 멱등" 요구사항과 충돌했었음).
 */
export declare function applyLocalFixes(db: SeomedicDb, projectRoot: string, auditRunId: number): Promise<AppliedFixOutcome[]>;
