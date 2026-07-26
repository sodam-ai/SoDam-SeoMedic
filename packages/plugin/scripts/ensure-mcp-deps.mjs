// SessionStart 훅에서 실행된다. seomedic MCP 서버(mcp-server/)가 필요로 하는 npm 의존성을
// ${CLAUDE_PLUGIN_DATA}(플러그인 업데이트에도 살아남는 영속 폴더)에 설치한다.
// Node 스크립트로 작성한 이유: 공식 문서 예시(diff/cp/rm 조합 셸 명령)는 POSIX 전용이라
// Windows(cmd.exe)에서 깨질 위험이 있다 — 이 저장소는 3-OS(Windows/Mac/Linux)를 지원 대상으로 하므로
// node로 같은 로직(패키지 변경 감지 시에만 재설치)을 크로스플랫폼으로 구현한다.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
const dataDir = process.env.CLAUDE_PLUGIN_DATA;

if (!pluginRoot || !dataDir) {
  console.error("[ensure-mcp-deps] CLAUDE_PLUGIN_ROOT 또는 CLAUDE_PLUGIN_DATA 미설정 — 건너뜀");
  process.exit(0);
}

const bundledPkgPath = path.join(pluginRoot, "mcp-server", "package.json");
const installedPkgPath = path.join(dataDir, "package.json");

if (!existsSync(bundledPkgPath)) {
  console.error(`[ensure-mcp-deps] ${bundledPkgPath} 없음 — mcp-server가 번들되지 않은 플러그인 버전`);
  process.exit(0);
}

const bundled = readFileSync(bundledPkgPath, "utf-8");
const installed = existsSync(installedPkgPath) ? readFileSync(installedPkgPath, "utf-8") : null;

if (bundled === installed) {
  process.exit(0); // 의존성 변경 없음 — 이미 설치돼 있음
}

mkdirSync(dataDir, { recursive: true });
writeFileSync(installedPkgPath, bundled);

try {
  console.error("[ensure-mcp-deps] seomedic MCP 서버 의존성 설치 중(최초 1회, 몇 분 걸릴 수 있음)...");
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  execFileSync(npmCmd, ["install"], { cwd: dataDir, stdio: "inherit" });
  console.error("[ensure-mcp-deps] 설치 완료");
} catch (err) {
  console.error(`[ensure-mcp-deps] npm install 실패: ${err.message} — 다음 세션에서 재시도됩니다`);
  // 실패 시 installedPkgPath를 지워 다음 세션에서 diff가 다시 감지하도록 함(재시도 보장)
  try {
    writeFileSync(installedPkgPath, "");
  } catch {}
}
