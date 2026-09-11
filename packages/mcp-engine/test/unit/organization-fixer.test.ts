import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { planOrganizationFix, writeOrganizationFix, ORGANIZATION_MARKER } from "../../src/fixers/organization-fixer.js";

const cleanupDirs: string[] = [];
afterEach(() => {
  for (const dir of cleanupDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function tempFilePath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seomedic-organization-fix-test-"));
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

describe("planOrganizationFix — 파일 없음/구조 인식 불가(fail-closed)", () => {
  it("파일이 없으면 applicable=false", () => {
    const filePath = tempFilePath();
    const plan = planOrganizationFix(filePath, "내 회사");
    expect(plan.applicable).toBe(false);
  });

  it("<body> 요소가 0개면 applicable=false, 원본 그대로 보존(추측 금지)", () => {
    const filePath = tempFilePath();
    const noBody = `export default function RootLayout() { return <div>no html/body here</div>; }\n`;
    fs.writeFileSync(filePath, noBody);

    const plan = planOrganizationFix(filePath, "내 회사");
    expect(plan.applicable).toBe(false);
    expect(plan.reason).toContain("<body>");
  });

  it("<body> 요소가 2개 이상(이례적 구조)이면 applicable=false — 확신할 수 없으면 안 건드림", () => {
    const filePath = tempFilePath();
    const twoBodies = `function A() { return <body>a</body>; }\nfunction B() { return <body>b</body>; }\n`;
    fs.writeFileSync(filePath, twoBodies);

    const plan = planOrganizationFix(filePath, "내 회사");
    expect(plan.applicable).toBe(false);
    expect(plan.reason).toContain("2개");
  });
});

describe("planOrganizationFix — 정상 케이스(신규 삽입)", () => {
  it("정확히 1개의 <body>가 있으면 applicable=true로 Organization JSON-LD 삽입을 제안한다", () => {
    const filePath = tempFilePath();
    fs.writeFileSync(filePath, SIMPLE_LAYOUT);

    const plan = planOrganizationFix(filePath, "SeoMedic 테스트 픽스처");
    expect(plan.applicable).toBe(true);
    expect(plan.updatedText).toContain(ORGANIZATION_MARKER);
    expect(plan.updatedText).toContain('type="application/ld+json"');
    expect(plan.updatedText).toContain("dangerouslySetInnerHTML");
    expect(plan.updatedText).toContain("SeoMedic 테스트 픽스처");
    expect(plan.updatedText).toContain("Organization");
  });

  it("logo·sameAs·url 필드는 절대 넣지 않는다(페이지에 원본이 없어 지어내면 값 발명이 됨)", () => {
    const filePath = tempFilePath();
    fs.writeFileSync(filePath, SIMPLE_LAYOUT);

    const plan = planOrganizationFix(filePath, "SeoMedic 테스트 픽스처");
    expect(plan.updatedText).not.toContain('"url"');
    expect(plan.updatedText).not.toContain('"logo"');
    expect(plan.updatedText).not.toContain('"sameAs"');
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

    const plan = planOrganizationFix(filePath, "내 회사");
    expect(plan.updatedText).toContain('className="antialiased"');
    expect(plan.updatedText).toContain("{children}");
  });

  it("writeOrganizationFix가 실제로 디스크에 반영한다", () => {
    const filePath = tempFilePath();
    fs.writeFileSync(filePath, SIMPLE_LAYOUT);

    const plan = planOrganizationFix(filePath, "내 회사");
    writeOrganizationFix(filePath, plan.updatedText!);
    expect(fs.readFileSync(filePath, "utf-8")).toBe(plan.updatedText);
  });
});

describe("planOrganizationFix — 멱등성", () => {
  it("이미 마커가 있으면 applicable=false(재삽입 안 함), 텍스트 무변화", () => {
    const filePath = tempFilePath();
    fs.writeFileSync(filePath, SIMPLE_LAYOUT);

    const firstPlan = planOrganizationFix(filePath, "내 회사");
    writeOrganizationFix(filePath, firstPlan.updatedText!);

    const secondPlan = planOrganizationFix(filePath, "내 회사");
    expect(secondPlan.applicable).toBe(false);
    expect(secondPlan.updatedText).toBe(secondPlan.originalText);
  });
});

describe("planOrganizationFix — M7 소스 주입 방지(dangerouslySetInnerHTML 이스케이프)", () => {
  it("orgName에 </script>가 포함돼도 브라우저가 스크립트 태그를 조기 종료시킬 수 없게 이스케이프한다", () => {
    const filePath = tempFilePath();
    fs.writeFileSync(filePath, SIMPLE_LAYOUT);

    const maliciousName = 'foo</script><script>alert(1)</script>bar';
    const plan = planOrganizationFix(filePath, maliciousName);
    expect(plan.applicable).toBe(true);

    const scriptLineStart = plan.updatedText!.indexOf('dangerouslySetInnerHTML');
    const scriptLineEnd = plan.updatedText!.indexOf('/>', scriptLineStart);
    const injectedBlock = plan.updatedText!.slice(scriptLineStart, scriptLineEnd);
    expect(injectedBlock).not.toContain("</script>");
    expect(injectedBlock).toContain("\\u003c");
  });
});
