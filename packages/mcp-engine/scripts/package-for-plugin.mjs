// mcp-engine의 빌드 산출물(dist/)을 packages/plugin/mcp-server/에 복사한다.
// 이유: Claude Code 마켓플레이스 설치는 플러그인 자기 디렉터리(packages/plugin)만 캐시에 복사하고
// 형제 폴더(packages/mcp-engine)는 복사하지 않는다(공식 문서 확인, "path traversal limitations").
// 그래서 .mcp.json이 실행할 서버 코드는 packages/plugin 안에 실제로 존재해야 한다.
import { cpSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const engineRoot = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const pluginServerRoot = path.resolve(engineRoot, "..", "plugin", "mcp-server");

const engineDist = path.join(engineRoot, "dist");
if (!existsSync(engineDist)) {
  console.error(`[package-for-plugin] ${engineDist} 없음 — 먼저 "npm run build"를 실행하세요.`);
  process.exit(1);
}

rmSync(pluginServerRoot, { recursive: true, force: true });
mkdirSync(pluginServerRoot, { recursive: true });
cpSync(engineDist, path.join(pluginServerRoot, "dist"), { recursive: true });

const enginePkg = JSON.parse(readFileSync(path.join(engineRoot, "package.json"), "utf-8"));
// SessionStart 훅이 이 package.json만으로 `npm install`을 돌린다 — devDependencies·scripts는
// 빌드 산출물 실행에 불필요해서 제외(설치 용량·시간 최소화).
const trimmedPkg = {
  name: enginePkg.name,
  version: enginePkg.version,
  type: enginePkg.type,
  main: enginePkg.main,
  engines: enginePkg.engines,
  dependencies: enginePkg.dependencies,
  // postinstall만 유지 — SessionStart 훅이 이 package.json으로 `npm install`을 돌릴 때
  // Playwright 브라우저(chromium)도 함께 자동 설치되어야 렌더링 기능이 실제로 동작한다.
  scripts: { postinstall: enginePkg.scripts.postinstall },
};
writeFileSync(path.join(pluginServerRoot, "package.json"), JSON.stringify(trimmedPkg, null, 2) + "\n");

console.log(`[package-for-plugin] ${pluginServerRoot}에 dist/ + package.json 복사 완료`);
