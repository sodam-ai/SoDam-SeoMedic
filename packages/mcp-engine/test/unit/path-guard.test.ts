import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { resolveSeomedicDbPath, PathGuardError } from "../../src/db/path-guard.js";

const cleanupDirs: string[] = [];

afterEach(() => {
  for (const dir of cleanupDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seomedic-test-"));
  cleanupDirs.push(dir);
  return dir;
}

describe("resolveSeomedicDbPath", () => {
  it("정상 프로젝트 루트에 .seomedic/seomedic.db 경로를 만든다", () => {
    const projectRoot = makeTempProject();
    const dbPath = resolveSeomedicDbPath(projectRoot);
    expect(dbPath.endsWith("seomedic.db")).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, ".seomedic"))).toBe(true);
  });

  it("존재하지 않는 프로젝트 루트는 거부", () => {
    const nonExistent = path.join(os.tmpdir(), "seomedic-does-not-exist-" + Date.now());
    expect(() => resolveSeomedicDbPath(nonExistent)).toThrow(PathGuardError);
  });

  it("두 번 호출해도 같은 경로(멱등)", () => {
    const projectRoot = makeTempProject();
    const p1 = resolveSeomedicDbPath(projectRoot);
    const p2 = resolveSeomedicDbPath(projectRoot);
    expect(p1).toBe(p2);
  });

  it("드라이브 문자 대소문자가 달라도(Windows) 같은 경로로 취급", () => {
    const projectRoot = makeTempProject();
    const p1 = resolveSeomedicDbPath(projectRoot);
    const upperCased = projectRoot.charAt(0).toUpperCase() + projectRoot.slice(1);
    const lowerCased = projectRoot.charAt(0).toLowerCase() + projectRoot.slice(1);
    if (upperCased !== lowerCased) {
      // 드라이브 문자가 있는 환경(Windows)에서만 의미 있는 검사
      const p2 = resolveSeomedicDbPath(lowerCased === projectRoot ? upperCased : lowerCased);
      expect(p2.toLowerCase()).toBe(p1.toLowerCase());
    }
  });

  it("심볼릭 링크로 프로젝트 밖을 가리키면 차단(가능한 환경에서만)", () => {
    const projectRoot = makeTempProject();
    const outsideDir = makeTempProject(); // 프로젝트 루트 밖의 별도 디렉터리
    const linkPath = path.join(projectRoot, ".seomedic");
    try {
      fs.symlinkSync(outsideDir, linkPath, "junction");
    } catch {
      // Windows에서 개발자 모드/권한이 없어 심볼릭 링크 생성이 막히는 환경이면 이 케이스는 건너뛴다
      return;
    }
    expect(() => resolveSeomedicDbPath(projectRoot)).toThrow(PathGuardError);
  });
});
