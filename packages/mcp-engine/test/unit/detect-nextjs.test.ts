import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { detectNextjs } from "../../src/next-detect/detect-nextjs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REAL_NEXTJS_FIXTURE = path.resolve(__dirname, "../fixtures/nextjs-minimal");

const cleanupDirs: string[] = [];
afterEach(() => {
  for (const dir of cleanupDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});
function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seomedic-detect-test-"));
  cleanupDirs.push(dir);
  return dir;
}

describe("detectNextjs — 실제 Next.js 픽스처(App Router, 실제 설치됨)", () => {
  it("실제 설치된 next 버전과 App Router를 정확히 감지한다", () => {
    const result = detectNextjs(REAL_NEXTJS_FIXTURE);
    expect(result.isNextjs).toBe(true);
    expect(result.router).toBe("app");
    expect(result.version).toBe("16.2.10"); // node_modules/next/package.json에서 실제로 읽은 값
  });
});

describe("detectNextjs — 오탐 방지(negative cases)", () => {
  it("package.json 자체가 없으면 false", () => {
    const dir = makeTempDir();
    expect(detectNextjs(dir).isNextjs).toBe(false);
  });

  it("package.json은 있지만 next 의존성이 없으면 false", () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "x", dependencies: { react: "^19.0.0" } }));
    const result = detectNextjs(dir);
    expect(result.isNextjs).toBe(false);
    expect(result.reason).toContain("next 의존성이 없습니다");
  });

  it("package.json이 깨진 JSON이면 false(파싱 에러로 죽지 않음)", () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, "package.json"), "{ invalid json");
    expect(detectNextjs(dir).isNextjs).toBe(false);
  });

  it("next가 devDependencies에 있어도 감지한다", () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "x", devDependencies: { next: "^16.0.0" } }));
    expect(detectNextjs(dir).isNextjs).toBe(true);
  });

  it("node_modules에 next가 실제로 없으면(선언만 있음) version은 선언된 range를 반환하고 reason에 '미확인' 표시", () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "x", dependencies: { next: "^16.0.0" } }));
    const result = detectNextjs(dir);
    expect(result.isNextjs).toBe(true);
    expect(result.version).toBe("^16.0.0");
    expect(result.reason).toContain("미확인");
  });

  it("app/layout.tsx도 pages/_app.tsx도 없으면 router=unknown(단정하지 않음)", () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "x", dependencies: { next: "^16.0.0" } }));
    expect(detectNextjs(dir).router).toBe("unknown");
  });

  it("pages/_app.tsx만 있으면 pages router로 감지", () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "x", dependencies: { next: "^16.0.0" } }));
    fs.mkdirSync(path.join(dir, "pages"), { recursive: true });
    fs.writeFileSync(path.join(dir, "pages", "_app.tsx"), "export default function App() {}");
    expect(detectNextjs(dir).router).toBe("pages");
  });
});
