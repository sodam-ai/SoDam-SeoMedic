import fs from "node:fs";
import path from "node:path";

export type NextRouterType = "app" | "pages" | "unknown";

export interface NextDetectionResult {
  isNextjs: boolean;
  /** node_modules에 실제 설치된 버전(확인 가능한 경우). 없으면 package.json에 선언된 semver 범위. */
  version: string | null;
  router: NextRouterType;
  reason: string;
}

/**
 * 오탐(non-Next.js 프로젝트에 잘못 손대는 것) 방지를 위한 1차(선언적) 게이트.
 * package.json은 절대 require()하지 않고 JSON.parse로만 읽는다(코드 실행 없이 순수 데이터만 —
 * M6 파서 안전 원칙과 동일: 신뢰 불가 입력을 실행하지 않는다).
 *
 * 2차(기능적) 게이트는 이 함수의 책임이 아니다 — render-bridge/server-launcher.ts가 실제로
 * next 바이너리를 resolve/실행하면서 자연스럽게 증명한다(실패 시 RenderBridgeError). 이 함수가
 * "확실히 아니다"라고 판단할 근거가 없으면 판단을 단정하지 않고 `unknown` 등으로 정직하게 남긴다.
 */
export function detectNextjs(projectRoot: string): NextDetectionResult {
  const packageJsonPath = path.join(projectRoot, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return { isNextjs: false, version: null, router: "unknown", reason: "package.json이 없습니다" };
  }

  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
  } catch {
    return { isNextjs: false, version: null, router: "unknown", reason: "package.json 파싱 실패" };
  }

  const declaredRange = pkg.dependencies?.next ?? pkg.devDependencies?.next;
  if (!declaredRange) {
    return { isNextjs: false, version: null, router: "unknown", reason: "package.json에 next 의존성이 없습니다" };
  }

  const installedVersion = readInstalledNextVersion(projectRoot);
  const router = detectRouter(projectRoot);

  return {
    isNextjs: true,
    version: installedVersion ?? declaredRange,
    router,
    reason: installedVersion
      ? `next@${installedVersion} 설치 확인됨(${router === "unknown" ? "라우터 미확인" : router + " router"})`
      : `package.json에 선언됨(${declaredRange}), node_modules 미확인 — 설치 필요할 수 있음`,
  };
}

function readInstalledNextVersion(projectRoot: string): string | null {
  const nextPkgPath = path.join(projectRoot, "node_modules", "next", "package.json");
  try {
    const nextPkg = JSON.parse(fs.readFileSync(nextPkgPath, "utf-8"));
    return typeof nextPkg.version === "string" ? nextPkg.version : null;
  } catch {
    return null;
  }
}

function detectRouter(projectRoot: string): NextRouterType {
  const appRouterMarkers = ["app/layout.tsx", "app/layout.jsx", "app/layout.js", "src/app/layout.tsx", "src/app/layout.js"];
  const pagesRouterMarkers = ["pages/_app.tsx", "pages/_app.jsx", "pages/_app.js", "src/pages/_app.tsx", "src/pages/_app.js"];

  if (appRouterMarkers.some((p) => fs.existsSync(path.join(projectRoot, p)))) return "app";
  if (pagesRouterMarkers.some((p) => fs.existsSync(path.join(projectRoot, p)))) return "pages";
  return "unknown";
}
