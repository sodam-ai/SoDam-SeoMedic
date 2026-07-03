import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { planSitemapFix, writeSitemapFix } from "../../src/fixers/sitemap-fixer.js";

const cleanupDirs: string[] = [];
afterEach(() => {
  for (const dir of cleanupDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function writeFixtureFile(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seomedic-sitemap-fix-test-"));
  cleanupDirs.push(dir);
  const filePath = path.join(dir, "sitemap.ts");
  fs.writeFileSync(filePath, content);
  return filePath;
}

const STATIC_SITEMAP = `import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: "https://example.com/" }];
}
`;

const DYNAMIC_SITEMAP = `import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap {
  const pages = getPagesFromDatabase();
  return pages.map((p) => ({ url: p.url }));
}
`;

describe("planSitemapFix — 정적 배열(add_safe 적용 가능)", () => {
  it("없는 URL을 추가 대상으로 잡는다", () => {
    const filePath = writeFixtureFile(STATIC_SITEMAP);
    const plan = planSitemapFix(filePath, ["https://example.com/new-page"]);
    expect(plan.applicable).toBe(true);
    expect(plan.urlsToAdd).toEqual(["https://example.com/new-page"]);
    expect(plan.updatedText).toContain("https://example.com/new-page");
  });

  it("이미 있는 URL은 추가 대상에서 제외된다(멱등성)", () => {
    const filePath = writeFixtureFile(STATIC_SITEMAP);
    const plan = planSitemapFix(filePath, ["https://example.com/"]);
    expect(plan.applicable).toBe(true);
    expect(plan.urlsToAdd).toEqual([]);
  });

  it("여러 URL 중 없는 것만 골라 추가한다", () => {
    const filePath = writeFixtureFile(STATIC_SITEMAP);
    const plan = planSitemapFix(filePath, ["https://example.com/", "https://example.com/new-a", "https://example.com/new-b"]);
    expect(plan.urlsToAdd).toEqual(["https://example.com/new-a", "https://example.com/new-b"]);
  });

  it("2회 연속 plan을 실행해도(재실행) 같은 URL을 중복 추가하지 않는다", () => {
    const filePath = writeFixtureFile(STATIC_SITEMAP);
    const plan1 = planSitemapFix(filePath, ["https://example.com/new-page"]);
    writeSitemapFix(filePath, plan1.updatedText!);

    const plan2 = planSitemapFix(filePath, ["https://example.com/new-page"]);
    expect(plan2.urlsToAdd).toEqual([]); // 이미 파일에 반영됐으니 추가 대상 없음
  });

  it("writeSitemapFix가 실제로 디스크에 반영한다", () => {
    const filePath = writeFixtureFile(STATIC_SITEMAP);
    const plan = planSitemapFix(filePath, ["https://example.com/persisted"]);
    writeSitemapFix(filePath, plan.updatedText!);
    const onDisk = fs.readFileSync(filePath, "utf-8");
    expect(onDisk).toContain("https://example.com/persisted");
  });
});

describe("planSitemapFix — 동적 계산(gated로 폴백, report_only)", () => {
  it("동적 계산이 섞인 sitemap.ts는 applicable=false로 손대지 않는다", () => {
    const filePath = writeFixtureFile(DYNAMIC_SITEMAP);
    const before = fs.readFileSync(filePath, "utf-8");
    const plan = planSitemapFix(filePath, ["https://example.com/new"]);
    expect(plan.applicable).toBe(false);
    // 파일이 실제로 변경되지 않았는지도 확인(디스크에 아무것도 안 씀)
    expect(fs.readFileSync(filePath, "utf-8")).toBe(before);
  });
});

describe("planSitemapFix — 파일 없음", () => {
  it("sitemap.ts 자체가 없으면 applicable=false", () => {
    const plan = planSitemapFix("/no/such/path/sitemap.ts", ["https://example.com/x"]);
    expect(plan.applicable).toBe(false);
  });
});
