import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getGithubRepoCacheRoot } from "../../src/github/repo-cache-path.js";

const createdDirs: string[] = [];
afterEach(() => {
  for (const dir of createdDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("getGithubRepoCacheRoot", () => {
  it("owner/repo별로 고유하고 안정적인(재현 가능한) 경로를 반환한다", () => {
    const p1 = getGithubRepoCacheRoot({ owner: "octocat", repo: "hello-world" });
    createdDirs.push(p1);
    const p2 = getGithubRepoCacheRoot({ owner: "octocat", repo: "hello-world" });
    expect(p1).toBe(p2); // 같은 저장소는 항상 같은 경로 — 회귀 이력이 실제로 누적되려면 안정적이어야 함

    const other = getGithubRepoCacheRoot({ owner: "octocat", repo: "other-repo" });
    createdDirs.push(other);
    expect(other).not.toBe(p1);
  });

  it("os.tmpdir()이 아니라 홈 디렉터리 기반의 영속 경로다(sandbox와 완전히 분리)", () => {
    const p = getGithubRepoCacheRoot({ owner: "octocat", repo: "hello-world" });
    createdDirs.push(p);
    expect(p.toLowerCase().startsWith(os.tmpdir().toLowerCase())).toBe(false);
    expect(p.startsWith(os.homedir())).toBe(true);
  });

  it("실제로 디렉터리를 생성한다(호출 즉시 존재)", () => {
    const p = getGithubRepoCacheRoot({ owner: "octocat", repo: "hello-world" });
    createdDirs.push(p);
    expect(fs.existsSync(p)).toBe(true);
  });

  it("owner/repo에 위험한 문자(경로 구분자 등)가 섞여도 경로 이탈 없이 안전하게 처리한다", () => {
    const p = getGithubRepoCacheRoot({ owner: "../../etc", repo: "passwd" });
    createdDirs.push(p);
    const cacheParent = path.join(os.homedir(), ".seomedic-github-cache");
    expect(p.startsWith(cacheParent)).toBe(true); // 상위 경로 이탈 없음
  });
});
