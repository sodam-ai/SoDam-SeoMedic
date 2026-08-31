// SessionStart 훅에서 실행된다. seomedic MCP 서버(mcp-server/)가 필요로 하는 npm 의존성을
// ${CLAUDE_PLUGIN_DATA}(플러그인 업데이트에도 살아남는 영속 폴더)에 설치한다.
// Node 스크립트로 작성한 이유: 공식 문서 예시(diff/cp/rm 조합 셸 명령)는 POSIX 전용이라
// Windows(cmd.exe)에서 깨질 위험이 있다 — 이 저장소는 3-OS(Windows/Mac/Linux)를 지원 대상으로 하므로
// node로 같은 로직(패키지 변경 감지 시에만 재설치)을 크로스플랫폼으로 구현한다.
import { readFileSync, writeFileSync, existsSync, mkdirSync, lstatSync, symlinkSync } from "node:fs";
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

// mcp-server/package.json은 "type":"module"(ESM)이다. Node의 ESM import 리졸버는 CJS 전용
// 레거시 메커니즘인 NODE_PATH를 참조하지 않는다(공식 동작 — 실측으로도 ERR_MODULE_NOT_FOUND 확인,
// 2026-09-01). .mcp.json이 NODE_PATH=${CLAUDE_PLUGIN_DATA}/node_modules를 설정해도 dist/server.js의
// import문은 그 경로를 못 찾아 즉시 크래시한다. ESM은 가져오는 파일의 "조상 디렉터리"에 있는
// node_modules만 찾으므로, mcp-server/node_modules 자리에 실제 설치 위치를 가리키는 심볼릭 링크
// (Windows는 관리자 권한이 필요 없는 junction)를 만들어 그 조건을 충족시킨다.
const nodeModulesLink = path.join(pluginRoot, "mcp-server", "node_modules");
const nodeModulesTarget = path.join(dataDir, "node_modules");

function ensureNodeModulesLink() {
  if (!existsSync(nodeModulesTarget)) return; // 아직 설치 전 — npm install 이후 다시 호출됨
  try {
    if (lstatSync(nodeModulesLink).isSymbolicLink()) return; // 이미 올바르게 연결됨
    console.error(`[ensure-mcp-deps] ${nodeModulesLink}가 심볼릭 링크가 아님 — 자동 연결 건너뜀(수동 확인 필요)`);
    return;
  } catch {
    // lstat 실패 = 링크가 아직 없음 → 아래에서 새로 생성
  }
  try {
    symlinkSync(nodeModulesTarget, nodeModulesLink, process.platform === "win32" ? "junction" : "dir");
  } catch (err) {
    console.error(`[ensure-mcp-deps] node_modules 링크 생성 실패: ${err.message}`);
  }
}

const bundled = readFileSync(bundledPkgPath, "utf-8");
const installed = existsSync(installedPkgPath) ? readFileSync(installedPkgPath, "utf-8") : null;

if (bundled === installed) {
  ensureNodeModulesLink(); // 의존성은 이미 설치돼 있어도 링크는 아직 없을 수 있음(기존 설치 사용자)
  process.exit(0);
}

mkdirSync(dataDir, { recursive: true });
writeFileSync(installedPkgPath, bundled);

// npm은 Windows에서 .cmd 배치 스크립트인데, Node가 CVE-2024-27980 대응으로 shell 없는 직접
// spawn을 EINVAL로 거부한다(실측 확인 — 이 저장소가 mcp-engine/src/github/npm-install.ts에서
// 이미 같은 문제를 겪고 고친 것과 동일 원인). shell:true로 우회하는 대신 npm의 JS 진입점을
// process.execPath로 직접 실행해 문제 자체를 피한다(같은 파일의 resolveNpmCliJs 전략을 이식 —
// 이 스크립트는 독립 부트스트랩이라 아직 아무 의존성도 설치 전이라 import로 공유할 수 없음).
function resolveNpmCliJs() {
  const fromEnv = process.env.npm_execpath;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const nodeBinDir = path.dirname(process.execPath);
  const candidates = [
    path.join(nodeBinDir, "node_modules", "npm", "bin", "npm-cli.js"), // Windows
    path.join(path.dirname(nodeBinDir), "lib", "node_modules", "npm", "bin", "npm-cli.js"), // Unix
  ];
  return candidates.find((c) => existsSync(c)) ?? null;
}

try {
  console.error("[ensure-mcp-deps] seomedic MCP 서버 의존성 설치 중(최초 1회, 몇 분 걸릴 수 있음)...");
  const npmCliJs = resolveNpmCliJs();
  if (npmCliJs) {
    execFileSync(process.execPath, [npmCliJs, "install"], { cwd: dataDir, stdio: "inherit" });
  } else {
    // npm CLI 진입점을 못 찾은 예외적 상황에만 기존 방식으로 폴백(정상 환경에선 도달 안 함)
    const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
    execFileSync(npmCmd, ["install"], { cwd: dataDir, stdio: "inherit" });
  }
  console.error("[ensure-mcp-deps] 설치 완료");
  ensureNodeModulesLink();
} catch (err) {
  console.error(`[ensure-mcp-deps] npm install 실패: ${err.message} — 다음 세션에서 재시도됩니다`);
  // 실패 시 installedPkgPath를 지워 다음 세션에서 diff가 다시 감지하도록 함(재시도 보장)
  try {
    writeFileSync(installedPkgPath, "");
  } catch {}
}
