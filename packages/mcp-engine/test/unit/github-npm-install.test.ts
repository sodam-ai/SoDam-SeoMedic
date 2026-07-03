import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { installDependenciesSafely, NpmInstallError } from "../../src/github/npm-install.js";

const cleanupDirs: string[] = [];
afterEach(() => {
  for (const dir of cleanupDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/**
 * postinstall이 실행되면 marker 파일을 만드는 최소 패키지 — --ignore-scripts가 실제로
 * postinstall 실행을 막는지(임의 코드 실행 방지) 눈으로 보이는 증거로 확인한다.
 */
function makeFixtureWithPostinstall(): { projectRoot: string; markerPath: string } {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "seomedic-npm-install-test-"));
  cleanupDirs.push(projectRoot);
  const markerPath = path.join(projectRoot, "postinstall-ran.marker");

  fs.writeFileSync(
    path.join(projectRoot, "package.json"),
    JSON.stringify(
      {
        name: "seomedic-npm-install-fixture",
        version: "1.0.0",
        scripts: {
          postinstall: `node -e "require('fs').writeFileSync(${JSON.stringify(markerPath)}, 'ran')"`,
        },
      },
      null,
      2,
    ),
  );
  return { projectRoot, markerPath };
}

describe("installDependenciesSafely — postinstall 스크립트 실행 방지(제3자 코드 신뢰 안 함)", () => {
  it("--ignore-scripts로 설치해 postinstall이 실제로 실행되지 않는다", async () => {
    const { projectRoot, markerPath } = makeFixtureWithPostinstall();
    await installDependenciesSafely(projectRoot);
    expect(fs.existsSync(markerPath)).toBe(false); // postinstall이 안 돌았다는 실제 증거
  }, 60_000);

  it("존재하지 않는 프로젝트 경로면 에러로 실패한다", async () => {
    const bogus = path.join(os.tmpdir(), "seomedic-no-such-project-" + Date.now());
    await expect(installDependenciesSafely(bogus)).rejects.toThrow(NpmInstallError);
  }, 30_000);
});
