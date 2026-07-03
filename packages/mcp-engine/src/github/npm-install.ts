import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export class NpmInstallError extends Error {}

const DEFAULT_TIMEOUT_MS = 5 * 60_000;

/**
 * npm은 항상 Node.js 설치본에 함께 번들되므로, process.execPath 기준 상대경로로 그 JS 진입점을
 * 안정적으로 찾을 수 있다(next를 대상 프로젝트의 node_modules에서 resolve하는 것과 같은 원리 —
 * "실행 파일 경로 추측"이 아니라 "실제 설치 위치를 코드로 확인"). 이렇게 하면 Windows에서 npm이
 * .cmd 배치 스크립트라는 사실 자체를 완전히 우회한다.
 *
 * 실측 확인된 실패 두 가지(둘 다 이 방식으로 피해감):
 * - spawn("npm", ..., {shell:false}) → Windows에서 ENOENT(.cmd라 직접 실행 안 됨)
 * - spawn("npm.cmd", ..., {shell:false}) → Windows에서 EINVAL(Node가 .cmd/.bat 직접 spawn을
 *   shell 없이는 아예 거부함 — CVE-2024-27980 대응으로 Node 자체에 추가된 안전장치)
 * shell:true로 우회하는 대신, JS 진입점을 직접 resolve해 process.execPath로 실행하는 쪽을
 * 택했다(이 코드베이스의 M2 "셸 문자열 보간 금지" 원칙과 완전히 일치, next와 동일 패턴).
 */
function resolveNpmCliJs(): string {
  const candidate = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  if (!fs.existsSync(candidate)) {
    throw new NpmInstallError(`npm CLI 진입점을 찾을 수 없습니다(예상 경로: ${candidate}) — Node.js 설치를 확인해주세요`);
  }
  return candidate;
}

/**
 * 1.5a(로컬 폴더)는 node_modules가 이미 설치돼 있다고 가정한다(사용자 본인 프로젝트라 이미 세팅됨).
 * GitHub 모드는 다르다 — sandbox에 clone한 건 **사용자가 신뢰하지 않는 제3자 코드**일 수 있어서
 * (특히 "남의 repo=fork+PR" 흐름), package.json의 postinstall 스크립트를 그대로 실행하면 임의 코드
 * 실행 위험이 생긴다(M2 명령어 주입 방지와 같은 종류의 위험 — 설계 검토 중 확인).
 *
 * 그래서 --ignore-scripts를 기본값으로 강제한다. 일부 라이브러리는 postinstall이 실제로 필요해서
 * (예: 네이티브 바이너리 다운로드) 이후 build가 실패할 수 있는데, 그건 "이 저장소는 안전하게 자동
 * 수정할 수 없다"는 정직한 신호로 취급한다(스크립트를 몰래 허용하는 것보다 안전 우선 — fail-closed).
 *
 * yarn/pnpm은 지금 지원하지 않는다(npm처럼 Node.js에 번들되지 않아 설치 위치를 안정적으로 추측할
 * 수 없음 — 억지로 shell 경유 spawn을 쓰느니 범위를 npm으로 한정하는 쪽을 택함, 정직한 제약).
 */
export function installDependenciesSafely(projectRoot: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
  const lockfile = detectLockfile(projectRoot);
  if (lockfile === "yarn.lock" || lockfile === "pnpm-lock.yaml") {
    return Promise.reject(
      new NpmInstallError(`이 저장소는 ${lockfile}을 사용합니다 — 현재 GitHub 자동 수정은 npm 프로젝트만 지원합니다`),
    );
  }

  const npmCliJs = resolveNpmCliJs();
  const args = [npmCliJs, "install", "--ignore-scripts"];

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: projectRoot, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (d) => (stderr += d.toString()));

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new NpmInstallError(`의존성 설치 타임아웃(${timeoutMs}ms)`));
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new NpmInstallError(`npm 실행 실패: ${err.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new NpmInstallError(`의존성 설치 실패(exit ${code}): ${stderr.slice(-2000)}`));
    });
  });
}

function detectLockfile(projectRoot: string): "package-lock.json" | "yarn.lock" | "pnpm-lock.yaml" | null {
  for (const name of ["package-lock.json", "yarn.lock", "pnpm-lock.yaml"] as const) {
    if (fs.existsSync(path.join(projectRoot, name))) return name;
  }
  return null;
}
