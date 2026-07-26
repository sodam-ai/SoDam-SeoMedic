export declare class GitOpsError extends Error {
}
/**
 * fix용 브랜치는 반드시 'seomedic/'로 시작해야 하고 main/master일 수 없다.
 * ⚠️ 강제 push를 가능하게 하는 옵션은 이 파일 어디에도 존재하지 않는다(설계상 물리적으로 코드에 없음 —
 * 그런 동작을 만들 수 있는 파라미터 자체가 없어, 실수로도 기존 브랜치를 덮어쓰는 push가 나갈 수 없다).
 */
export declare function assertSafeBranchName(branchName: string): void;
export declare function createFixBranch(repoPath: string, branchName: string): Promise<void>;
export declare function commitAll(repoPath: string, message: string, env?: NodeJS.ProcessEnv): Promise<void>;
/**
 * `HEAD:refs/heads/<branchName>` 형태로만 push한다 — 브랜치명을 강제해 항상 새 브랜치로만 나가고,
 * 이미 존재하는 원격 브랜치를 덮어쓰는 refspec 문법이나 강제 옵션은 이 함수에 아예 없다.
 */
export declare function pushFixBranch(repoPath: string, branchName: string, env?: NodeJS.ProcessEnv): Promise<void>;
