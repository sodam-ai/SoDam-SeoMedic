import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { findPageFilePath } from "../../src/fix-orchestrator/page-file-resolver.js";

const cleanupDirs: string[] = [];
afterEach(() => {
  for (const dir of cleanupDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function makeTempProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seomedic-page-resolver-test-"));
  cleanupDirs.push(dir);
  return dir;
}

describe("findPageFilePath", () => {
  it("루트 경로('/')는 app/page.tsx를 찾는다", () => {
    const root = makeTempProject();
    fs.mkdirSync(path.join(root, "app"), { recursive: true });
    fs.writeFileSync(path.join(root, "app", "page.tsx"), "export default function Home() { return null; }");

    expect(findPageFilePath(root, "/")).toBe(path.join("app", "page.tsx"));
  });

  it("중첩 경로('/about')는 app/about/page.tsx를 찾는다", () => {
    const root = makeTempProject();
    fs.mkdirSync(path.join(root, "app", "about"), { recursive: true });
    fs.writeFileSync(path.join(root, "app", "about", "page.tsx"), "export default function About() { return null; }");

    expect(findPageFilePath(root, "/about")).toBe(path.join("app", "about", "page.tsx"));
  });

  it("src/app 레이아웃도 찾는다", () => {
    const root = makeTempProject();
    fs.mkdirSync(path.join(root, "src", "app", "contact"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "app", "contact", "page.tsx"), "export default function Contact() { return null; }");

    expect(findPageFilePath(root, "/contact")).toBe(path.join("src", "app", "contact", "page.tsx"));
  });

  it("jsx/js 확장자도 찾는다", () => {
    const root = makeTempProject();
    fs.mkdirSync(path.join(root, "app", "blog"), { recursive: true });
    fs.writeFileSync(path.join(root, "app", "blog", "page.jsx"), "export default function Blog() { return null; }");

    expect(findPageFilePath(root, "/blog")).toBe(path.join("app", "blog", "page.jsx"));
  });

  it("동적 세그먼트([slug])는 실제 값이 리터럴 폴더명과 일치하지 않아 null을 반환한다(별도 특수처리 불필요)", () => {
    const root = makeTempProject();
    fs.mkdirSync(path.join(root, "app", "[slug]"), { recursive: true });
    fs.writeFileSync(path.join(root, "app", "[slug]", "page.tsx"), "export default function Slug() { return null; }");

    expect(findPageFilePath(root, "/hello-world")).toBeNull();
  });

  it("경로가 존재하지 않으면 null을 반환한다", () => {
    const root = makeTempProject();
    expect(findPageFilePath(root, "/nowhere")).toBeNull();
  });

  it("app 디렉터리 자체가 없으면 null을 반환한다", () => {
    const root = makeTempProject();
    expect(findPageFilePath(root, "/")).toBeNull();
  });

  it("trailing slash는 무시한다('/about/'도 '/about'과 동일하게 처리)", () => {
    const root = makeTempProject();
    fs.mkdirSync(path.join(root, "app", "about"), { recursive: true });
    fs.writeFileSync(path.join(root, "app", "about", "page.tsx"), "export default function About() { return null; }");

    expect(findPageFilePath(root, "/about/")).toBe(path.join("app", "about", "page.tsx"));
  });
});
