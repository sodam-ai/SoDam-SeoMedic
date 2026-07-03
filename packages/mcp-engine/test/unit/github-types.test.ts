import { describe, it, expect } from "vitest";
import { parseRepoUrl, InvalidRepoUrlError } from "../../src/github/types.js";

describe("parseRepoUrl", () => {
  it("https URL 형태를 파싱한다", () => {
    expect(parseRepoUrl("https://github.com/octocat/hello-world")).toEqual({ owner: "octocat", repo: "hello-world" });
  });

  it(".git 접미사를 제거한다", () => {
    expect(parseRepoUrl("https://github.com/octocat/hello-world.git")).toEqual({ owner: "octocat", repo: "hello-world" });
  });

  it("스킴 없는 github.com 형태도 파싱한다", () => {
    expect(parseRepoUrl("github.com/octocat/hello-world")).toEqual({ owner: "octocat", repo: "hello-world" });
  });

  it("owner/repo 축약형을 파싱한다", () => {
    expect(parseRepoUrl("octocat/hello-world")).toEqual({ owner: "octocat", repo: "hello-world" });
  });

  it("github.com이 아닌 호스트는 거부한다(사설 GHE 등 범위 밖 — 조용히 잘못 파싱하지 않음)", () => {
    expect(() => parseRepoUrl("https://gitlab.com/octocat/hello-world")).toThrow(InvalidRepoUrlError);
  });

  it("경로가 owner/repo 형태가 아니면 거부한다", () => {
    expect(() => parseRepoUrl("https://github.com/octocat")).toThrow(InvalidRepoUrlError);
  });

  it("완전히 잘못된 문자열은 거부한다", () => {
    expect(() => parseRepoUrl("not a url at all!!")).toThrow(InvalidRepoUrlError);
  });
});
