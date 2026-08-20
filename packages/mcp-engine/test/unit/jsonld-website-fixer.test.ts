import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { planJsonLdWebsiteFix, writeJsonLdWebsiteFix, JSONLD_WEBSITE_MARKER } from "../../src/fixers/jsonld-website-fixer.js";

const cleanupDirs: string[] = [];
afterEach(() => {
  for (const dir of cleanupDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function tempFilePath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seomedic-jsonld-website-fix-test-"));
  cleanupDirs.push(dir);
  return path.join(dir, "layout.tsx");
}

const SIMPLE_LAYOUT = `export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
`;

describe("planJsonLdWebsiteFix — 파일 없음/구조 인식 불가(fail-closed)", () => {
  it("파일이 없으면 applicable=false", () => {
    const filePath = tempFilePath();
    const plan = planJsonLdWebsiteFix(filePath, "내 사이트");
    expect(plan.applicable).toBe(false);
  });

  it("<body> 요소가 0개면 applicable=false, 원본 그대로 보존(추측 금지)", () => {
    const filePath = tempFilePath();
    const noBody = `export default function RootLayout() { return <div>no html/body here</div>; }\n`;
    fs.writeFileSync(filePath, noBody);

    const plan = planJsonLdWebsiteFix(filePath, "내 사이트");
    expect(plan.applicable).toBe(false);
    expect(plan.reason).toContain("<body>");
  });

  it("<body> 요소가 2개 이상(이례적 구조)이면 applicable=false — 확신할 수 없으면 안 건드림", () => {
    const filePath = tempFilePath();
    const twoBodies = `function A() { return <body>a</body>; }\nfunction B() { return <body>b</body>; }\n`;
    fs.writeFileSync(filePath, twoBodies);

    const plan = planJsonLdWebsiteFix(filePath, "내 사이트");
    expect(plan.applicable).toBe(false);
    expect(plan.reason).toContain("2개");
  });
});

describe("planJsonLdWebsiteFix — 정상 케이스(신규 삽입)", () => {
  it("정확히 1개의 <body>가 있으면 applicable=true로 WebSite JSON-LD 삽입을 제안한다", () => {
    const filePath = tempFilePath();
    fs.writeFileSync(filePath, SIMPLE_LAYOUT);

    const plan = planJsonLdWebsiteFix(filePath, "SeoMedic 테스트 픽스처");
    expect(plan.applicable).toBe(true);
    expect(plan.updatedText).toContain(JSONLD_WEBSITE_MARKER);
    expect(plan.updatedText).toContain('type="application/ld+json"');
    expect(plan.updatedText).toContain("dangerouslySetInnerHTML");
    expect(plan.updatedText).toContain("SeoMedic 테스트 픽스처");
    expect(plan.updatedText).toContain("WebSite");
  });

  it("url 필드는 절대 넣지 않는다(실제 배포 도메인을 알 방법이 없어 넣으면 오히려 틀린 값)", () => {
    const filePath = tempFilePath();
    fs.writeFileSync(filePath, SIMPLE_LAYOUT);

    const plan = planJsonLdWebsiteFix(filePath, "SeoMedic 테스트 픽스처");
    expect(plan.updatedText).not.toContain('"url"');
  });

  it("기존 <body> 내용({children}·속성)을 그대로 보존한다", () => {
    const filePath = tempFilePath();
    const withClassName = `export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
`;
    fs.writeFileSync(filePath, withClassName);

    const plan = planJsonLdWebsiteFix(filePath, "내 사이트");
    expect(plan.updatedText).toContain('className="antialiased"');
    expect(plan.updatedText).toContain("{children}");
  });

  it("writeJsonLdWebsiteFix가 실제로 디스크에 반영한다", () => {
    const filePath = tempFilePath();
    fs.writeFileSync(filePath, SIMPLE_LAYOUT);

    const plan = planJsonLdWebsiteFix(filePath, "내 사이트");
    writeJsonLdWebsiteFix(filePath, plan.updatedText!);
    expect(fs.readFileSync(filePath, "utf-8")).toBe(plan.updatedText);
  });
});

describe("planJsonLdWebsiteFix — 멱등성", () => {
  it("이미 마커가 있으면 applicable=false(재삽입 안 함), 텍스트 무변화", () => {
    const filePath = tempFilePath();
    fs.writeFileSync(filePath, SIMPLE_LAYOUT);

    const firstPlan = planJsonLdWebsiteFix(filePath, "내 사이트");
    writeJsonLdWebsiteFix(filePath, firstPlan.updatedText!);

    const secondPlan = planJsonLdWebsiteFix(filePath, "내 사이트");
    expect(secondPlan.applicable).toBe(false);
    expect(secondPlan.updatedText).toBe(secondPlan.originalText);
  });
});

describe("planJsonLdWebsiteFix — M7 소스 주입 방지(dangerouslySetInnerHTML 이스케이프)", () => {
  it("siteName에 </script>가 포함돼도 브라우저가 스크립트 태그를 조기 종료시킬 수 없게 이스케이프한다", () => {
    const filePath = tempFilePath();
    fs.writeFileSync(filePath, SIMPLE_LAYOUT);

    const maliciousName = 'foo</script><script>alert(1)</script>bar';
    const plan = planJsonLdWebsiteFix(filePath, maliciousName);
    expect(plan.applicable).toBe(true);

    // 삽입된 JSON-LD 스크립트 블록 자체는 리터럴 "</script>"를 포함하지 않아야 한다(이스케이프됨).
    const scriptLineStart = plan.updatedText!.indexOf('dangerouslySetInnerHTML');
    const scriptLineEnd = plan.updatedText!.indexOf('/>', scriptLineStart);
    const injectedBlock = plan.updatedText!.slice(scriptLineStart, scriptLineEnd);
    expect(injectedBlock).not.toContain("</script>");
    expect(injectedBlock).toContain("\\u003c");
  });
});
