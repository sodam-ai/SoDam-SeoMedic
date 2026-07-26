export declare class GitExecError extends Error {
}
/**
 * sandbox.ts·git-ops.ts가 공통으로 쓰는 저수준 git 실행 헬퍼. argv 배열 + shell:false로
 * 명령어 주입을 원천 차단한다(git-safety/git-guard.ts와 동일 원칙).
 */
export declare function runGitCommand(args: string[], cwd: string, timeoutMs: number, env?: NodeJS.ProcessEnv): Promise<void>;
