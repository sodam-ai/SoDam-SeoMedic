import type { SeomedicDb } from "../db/connection.js";
export declare class FixRollbackError extends Error {
}
export interface RollbackOutcome {
    fixId: number;
    targetPath: string | null;
    restored: boolean;
}
/**
 * 이미 적용된(applied_at 존재) fix를 apply 당시의 백업(backup_path)으로 되돌린다.
 * git checkout이 아니라 백업 파일을 쓰는 이유: apply 이후 시간이 지나 다른 커밋·수정이 쌓였을 수 있어
 * "git이 clean"이라는 apply 시점의 전제가 rollback 시점엔 더 이상 보장되지 않기 때문
 * (git-safety/git-guard.ts의 revertViaGitCheckout은 clean이 보장된 apply 실패 직후 롤백 전용).
 */
export declare function rollbackLocalFix(db: SeomedicDb, projectRoot: string, fixId: number): Promise<RollbackOutcome>;
