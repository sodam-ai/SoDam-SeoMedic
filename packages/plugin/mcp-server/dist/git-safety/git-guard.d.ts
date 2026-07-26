export type GitCleanStatus = {
    clean: true;
} | {
    clean: false;
    reason: "dirty" | "not_a_repo" | "git_not_found";
    details: string;
};
export declare function checkGitClean(projectRoot: string): Promise<GitCleanStatus>;
export interface BackupManifestEntry {
    originalPath: string;
    backupPath: string;
    sha256: string;
}
/**
 * git이 dirty인데도 사용자가 명시적으로 계속 진행하고 싶을 때(opt-in)만 호출한다.
 * 전체 트리가 아니라 **fix가 실제로 건드릴 파일만** 백업한다(fix plan 단계에서 대상이 이미 확정돼 있음).
 */
export declare function backupFiles(projectRoot: string, targetPaths: string[], runId: string): BackupManifestEntry[];
/** build 실패 등으로 git-clean 경로에서 되돌릴 때 — clean이 사전 보장됐으므로 HEAD로 checkout하면 fix 이전 상태와 동일하다. */
export declare function revertViaGitCheckout(projectRoot: string, targetPaths: string[]): Promise<void>;
