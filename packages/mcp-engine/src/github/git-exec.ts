import { spawn } from "node:child_process";

export class GitExecError extends Error {}

/**
 * sandbox.ts·git-ops.ts가 공통으로 쓰는 저수준 git 실행 헬퍼. argv 배열 + shell:false로
 * 명령어 주입을 원천 차단한다(git-safety/git-guard.ts와 동일 원칙).
 */
export function runGitCommand(args: string[], cwd: string, timeoutMs: number, env?: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"], env });
    let stderr = "";
    child.stderr?.on("data", (d) => (stderr += d.toString()));
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new GitExecError(`git 작업 타임아웃(${timeoutMs}ms): git ${args.join(" ")}`));
    }, timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new GitExecError(`git 실행 실패: ${err.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new GitExecError(`git 작업 실패(exit ${code}): git ${args.join(" ")}\n${stderr.slice(-2000)}`));
    });
  });
}
