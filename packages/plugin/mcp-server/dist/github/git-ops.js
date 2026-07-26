import { runGitCommand } from "./git-exec.js";
export class GitOpsError extends Error {
}
const PROTECTED_BRANCHES = new Set(["main", "master"]);
const REQUIRED_BRANCH_PREFIX = "seomedic/";
const DEFAULT_TIMEOUT_MS = 60_000;
/**
 * fix용 브랜치는 반드시 'seomedic/'로 시작해야 하고 main/master일 수 없다.
 * ⚠️ 강제 push를 가능하게 하는 옵션은 이 파일 어디에도 존재하지 않는다(설계상 물리적으로 코드에 없음 —
 * 그런 동작을 만들 수 있는 파라미터 자체가 없어, 실수로도 기존 브랜치를 덮어쓰는 push가 나갈 수 없다).
 */
export function assertSafeBranchName(branchName) {
    if (PROTECTED_BRANCHES.has(branchName)) {
        throw new GitOpsError(`보호된 브랜치(${branchName})에는 직접 push할 수 없습니다`);
    }
    if (!branchName.startsWith(REQUIRED_BRANCH_PREFIX)) {
        throw new GitOpsError(`fix 브랜치 이름은 반드시 '${REQUIRED_BRANCH_PREFIX}'로 시작해야 합니다: ${branchName}`);
    }
}
export async function createFixBranch(repoPath, branchName) {
    assertSafeBranchName(branchName);
    await runGitCommand(["checkout", "-b", branchName], repoPath, DEFAULT_TIMEOUT_MS);
}
export async function commitAll(repoPath, message, env) {
    await runGitCommand(["add", "-A"], repoPath, DEFAULT_TIMEOUT_MS);
    await runGitCommand(["-c", "user.email=seomedic-bot@users.noreply.github.com", "-c", "user.name=seomedic-bot", "commit", "-q", "-m", message], repoPath, DEFAULT_TIMEOUT_MS, env);
}
/**
 * `HEAD:refs/heads/<branchName>` 형태로만 push한다 — 브랜치명을 강제해 항상 새 브랜치로만 나가고,
 * 이미 존재하는 원격 브랜치를 덮어쓰는 refspec 문법이나 강제 옵션은 이 함수에 아예 없다.
 */
export async function pushFixBranch(repoPath, branchName, env) {
    assertSafeBranchName(branchName);
    await runGitCommand(["push", "origin", `HEAD:refs/heads/${branchName}`], repoPath, DEFAULT_TIMEOUT_MS, env);
}
//# sourceMappingURL=git-ops.js.map