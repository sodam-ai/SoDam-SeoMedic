import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export class GithubTokenError extends Error {}

const TOKEN_ENV_VAR = "SEOMEDIC_GITHUB_TOKEN";

/**
 * 토큰은 env에서만 읽는다(DO-NOT: "GitHub 토큰은 최소 권한(env-only, 로그 금지)"). 이 함수는
 * 절대 토큰 값 자체를 에러 메시지에 포함하지 않는다 — 없다는 사실만 알린다.
 */
export function getGithubToken(): string {
  const token = process.env[TOKEN_ENV_VAR];
  if (!token) {
    throw new GithubTokenError(`환경변수 ${TOKEN_ENV_VAR}이 설정되지 않았습니다`);
  }
  return token;
}

export interface AskpassScript {
  scriptPath: string;
  env: NodeJS.ProcessEnv;
  cleanup(): void;
}

/**
 * ⚠️ 미검증 — 실제 GitHub 인증으로 아직 검증되지 않았다(테스트용 토큰이 있어야 증명 가능).
 * git이 HTTPS 인증 시 GIT_ASKPASS로 지정된 프로그램을 "Username for '...'" / "Password for '...'"
 * 프롬프트와 함께 호출한다는 git 공식 동작에 기반해 작성했다. 토큰을 URL에 절대 임베드하지 않는
 * 이유는 .git/config나 프로세스 인자 목록(ps 등)에 노출될 수 있어서다(DO-NOT 원칙).
 *
 * 토큰 값 자체는 스크립트 파일에 직접 쓰지 않고 별도 env var로 전달한다 — 스크립트 파일이 실수로
 * 로그·백업에 남아도 토큰이 함께 유출되지 않게 하기 위함(심층 방어).
 */
export function createAskpassScript(token: string): AskpassScript {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seomedic-askpass-"));
  const tokenEnvVar = "SEOMEDIC_GH_TOKEN_TMP";

  const isWindows = process.platform === "win32";
  const scriptPath = path.join(dir, isWindows ? "askpass.cmd" : "askpass.sh");
  const scriptContent = isWindows
    ? `@echo off\r\necho %1% | findstr /I "Username" >nul\r\nif %errorlevel%==0 (echo x-access-token) else (echo %${tokenEnvVar}%)\r\n`
    : `#!/bin/sh\ncase "$1" in\n  *Username*) echo "x-access-token" ;;\n  *) echo "$${tokenEnvVar}" ;;\nesac\n`;

  fs.writeFileSync(scriptPath, scriptContent);
  if (!isWindows) fs.chmodSync(scriptPath, 0o700);

  const cleanup = (): void => {
    fs.rmSync(dir, { recursive: true, force: true });
  };

  return {
    scriptPath,
    env: { ...process.env, GIT_ASKPASS: scriptPath, [tokenEnvVar]: token },
    cleanup,
  };
}
