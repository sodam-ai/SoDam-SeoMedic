import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Project, SyntaxKind } from "ts-morph";
import { planTitleFix, writeTitleFix } from "../../src/fixers/title-fixer.js";

const cleanupDirs: string[] = [];
afterEach(() => {
  for (const dir of cleanupDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function writeFixtureFile(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seomedic-title-fix-test-"));
  cleanupDirs.push(dir);
  const filePath = path.join(dir, "page.tsx");
  fs.writeFileSync(filePath, content);
  return filePath;
}

const METADATA_NO_TITLE = `export const metadata = {
  alternates: {
    canonical: "/about",
  },
};

export default function AboutPage() {
  return <h1>회사 소개</h1>;
}
`;

const METADATA_WITH_TITLE = `export const metadata = {
  title: "About",
  alternates: {
    canonical: "/about",
  },
};

export default function AboutPage() {
  return <h1>회사 소개</h1>;
}
`;

const METADATA_WITH_EMPTY_TITLE = `export const metadata = {
  title: "",
  alternates: {
    canonical: "/about",
  },
};

export default function AboutPage() {
  return <h1>회사 소개</h1>;
}
`;

const METADATA_WITH_SPREAD = `const base = { alternates: { canonical: "/about" } };
export const metadata = {
  ...base,
};

export default function AboutPage() {
  return <h1>회사 소개</h1>;
}
`;

const NO_METADATA_EXPORT = `export default function AboutPage() {
  return <h1>회사 소개</h1>;
}
`;

const DYNAMIC_GENERATE_METADATA = `export async function generateMetadata() {
  return { alternates: { canonical: "/about" } };
}

export default function AboutPage() {
  return <h1>회사 소개</h1>;
}
`;

describe("planTitleFix — 같은 페이지 h1 텍스트를 title로 복사", () => {
  it("title이 없으면 h1 텍스트를 그대로 복사해 추가한다", () => {
    const filePath = writeFixtureFile(METADATA_NO_TITLE);
    const plan = planTitleFix(filePath, "회사 소개");
    expect(plan.applicable).toBe(true);
    expect(plan.updatedText).toContain('title: "회사 소개"');
    expect(plan.updatedText).not.toBe(plan.originalText);
  });

  it("writeTitleFix가 실제로 디스크에 반영한다", () => {
    const filePath = writeFixtureFile(METADATA_NO_TITLE);
    const plan = planTitleFix(filePath, "회사 소개");
    writeTitleFix(filePath, plan.updatedText!);
    const onDisk = fs.readFileSync(filePath, "utf-8");
    expect(onDisk).toContain('title: "회사 소개"');
  });

  it("title 외 다른 필드(alternates.canonical 등)는 그대로 보존한다", () => {
    const filePath = writeFixtureFile(METADATA_NO_TITLE);
    const plan = planTitleFix(filePath, "회사 소개");
    expect(plan.updatedText).toContain('title: "회사 소개"');
    expect(plan.updatedText).toContain("canonical:");
    expect(plan.updatedText).toContain("/about");
  });

  it("h1 텍스트를 값 그대로 복사할 뿐 새로 짓지 않는다(다른 문자열이면 그 값이 그대로 들어감)", () => {
    const filePath = writeFixtureFile(METADATA_NO_TITLE);
    const plan = planTitleFix(filePath, "완전히 다른 h1 텍스트");
    expect(plan.updatedText).toContain('title: "완전히 다른 h1 텍스트"');
  });
});

describe("planTitleFix — 이미 title 존재(멱등, 절대 덮어쓰지 않음)", () => {
  it("title이 이미 있으면 변경하지 않는다", () => {
    const filePath = writeFixtureFile(METADATA_WITH_TITLE);
    const plan = planTitleFix(filePath, "회사 소개");
    expect(plan.applicable).toBe(true);
    expect(plan.updatedText).toBe(plan.originalText);
  });

  it("title이 빈 문자열이어도 '존재'로 취급해 덮어쓰지 않는다(add-safe-guard 원칙)", () => {
    const filePath = writeFixtureFile(METADATA_WITH_EMPTY_TITLE);
    const plan = planTitleFix(filePath, "회사 소개");
    expect(plan.applicable).toBe(true);
    expect(plan.updatedText).toBe(plan.originalText);
  });
});

describe("planTitleFix — 복사할 원본(h1)이 없으면 report_only 폴백", () => {
  it("h1Title이 null이면 applicable=false, 파일 무변경", () => {
    const filePath = writeFixtureFile(METADATA_NO_TITLE);
    const before = fs.readFileSync(filePath, "utf-8");
    const plan = planTitleFix(filePath, null);
    expect(plan.applicable).toBe(false);
    expect(fs.readFileSync(filePath, "utf-8")).toBe(before);
  });
});

describe("planTitleFix — 안전하게 확신할 수 없는 구조는 손대지 않음(report_only 폴백)", () => {
  it("metadata export 자체가 없으면 applicable=false(1차 범위 밖 — 신규 export 생성은 다루지 않음)", () => {
    const filePath = writeFixtureFile(NO_METADATA_EXPORT);
    const before = fs.readFileSync(filePath, "utf-8");
    const plan = planTitleFix(filePath, "회사 소개");
    expect(plan.applicable).toBe(false);
    expect(fs.readFileSync(filePath, "utf-8")).toBe(before);
  });

  it("generateMetadata() 동적 함수는 applicable=false, 파일 무변경", () => {
    const filePath = writeFixtureFile(DYNAMIC_GENERATE_METADATA);
    const before = fs.readFileSync(filePath, "utf-8");
    const plan = planTitleFix(filePath, "회사 소개");
    expect(plan.applicable).toBe(false);
    expect(fs.readFileSync(filePath, "utf-8")).toBe(before);
  });

  it("metadata에 스프레드가 섞이면 applicable=false", () => {
    const filePath = writeFixtureFile(METADATA_WITH_SPREAD);
    const before = fs.readFileSync(filePath, "utf-8");
    const plan = planTitleFix(filePath, "회사 소개");
    expect(plan.applicable).toBe(false);
    expect(fs.readFileSync(filePath, "utf-8")).toBe(before);
  });
});

describe("planTitleFix — 파일 없음", () => {
  it("page.tsx 자체가 없으면 applicable=false", () => {
    const plan = planTitleFix("/no/such/path/page.tsx", "회사 소개");
    expect(plan.applicable).toBe(false);
  });
});

/**
 * updatedText를 실제로 다시 ts-morph로 파싱해 title 프로퍼티의 리터럴 값을 추출한다 — 결과 문자열을
 * 육안으로 대조하는 대신, "AST 왕복(round-trip)"으로 원본 h1 값이 정확히, 변형 없이 그대로 들어갔는지
 * 기계적으로 검증한다(따옴표·백슬래시·백틱 등 이스케이프가 깨지면 이 파싱 자체가 실패하거나 값이
 * 달라져 즉시 드러남).
 */
function extractWrittenTitle(updatedText: string): string {
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile("page.tsx", updatedText);
  const metadataDecl = sourceFile.getVariableDeclarationOrThrow("metadata");
  const objLit = metadataDecl.getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
  const titleProp = objLit.getPropertyOrThrow("title").asKindOrThrow(SyntaxKind.PropertyAssignment);
  const initializer = titleProp.getInitializerIfKindOrThrow(SyntaxKind.StringLiteral);
  return initializer.getLiteralValue();
}

describe("planTitleFix — 악의적/경계 입력값(h1 텍스트)도 안전하게 처리", () => {
  it("큰따옴표·백슬래시가 섞인 h1도 값이 정확히 보존되고 파일이 깨지지 않는다", () => {
    const filePath = writeFixtureFile(METADATA_NO_TITLE);
    const h1 = `그는 "안녕\\하세요"라고 말했다`;
    const plan = planTitleFix(filePath, h1);
    expect(plan.applicable).toBe(true);
    expect(extractWrittenTitle(plan.updatedText!)).toBe(h1);
  });

  it("백틱(템플릿 리터럴 문자)이 섞인 h1도 일반 문자열로 안전하게 처리된다", () => {
    const filePath = writeFixtureFile(METADATA_NO_TITLE);
    const h1 = "가격은 `${price}`원 입니다";
    const plan = planTitleFix(filePath, h1);
    expect(plan.applicable).toBe(true);
    expect(extractWrittenTitle(plan.updatedText!)).toBe(h1);
  });

  it("</script> 문자열이 섞인 h1도(스크립트 태그 컨텍스트가 아니므로) 값 그대로 보존된다", () => {
    // jsonld-website-fixer.ts와 달리 이 fixer는 dangerouslySetInnerHTML로 <script>에 주입하는 게
    // 아니라 일반 TS 문자열 리터럴(metadata.title)에 넣으므로 HTML 파서 조기종료 위험 자체가 없다 —
    // 그래도 실제로 값이 안전하게 보존되는지 직접 확인한다(추측 금지).
    const filePath = writeFixtureFile(METADATA_NO_TITLE);
    const h1 = "안내: </script><script>alert(1)</script> 종료 시간 안내";
    const plan = planTitleFix(filePath, h1);
    expect(plan.applicable).toBe(true);
    expect(extractWrittenTitle(plan.updatedText!)).toBe(h1);
  });

  it("줄바꿈(U+2028 포함)이 섞인 h1도 값이 보존되고 유효한 TS로 재파싱된다", () => {
    const filePath = writeFixtureFile(METADATA_NO_TITLE);
    const h1 = "첫째 줄\n둘째 줄 셋째 줄";
    const plan = planTitleFix(filePath, h1);
    expect(plan.applicable).toBe(true);
    expect(extractWrittenTitle(plan.updatedText!)).toBe(h1);
  });

  it("매우 긴 h1(2000자)도 안전하게 처리된다", () => {
    const filePath = writeFixtureFile(METADATA_NO_TITLE);
    const h1 = "가".repeat(2000);
    const plan = planTitleFix(filePath, h1);
    expect(plan.applicable).toBe(true);
    expect(extractWrittenTitle(plan.updatedText!)).toBe(h1);
  });

  it("이모지 등 멀티바이트 유니코드가 섞인 h1도 값이 정확히 보존된다", () => {
    const filePath = writeFixtureFile(METADATA_NO_TITLE);
    const h1 = "환영합니다 🎉🚀 최고의 서비스";
    const plan = planTitleFix(filePath, h1);
    expect(plan.applicable).toBe(true);
    expect(extractWrittenTitle(plan.updatedText!)).toBe(h1);
  });

  it("writeTitleFix로 실제 디스크에 쓴 뒤 다시 읽어도 악의적 입력 값이 동일하게 보존된다(round-trip)", () => {
    const filePath = writeFixtureFile(METADATA_NO_TITLE);
    const h1 = `"인용" \`백틱\` </script> 혼합 테스트`;
    const plan = planTitleFix(filePath, h1);
    writeTitleFix(filePath, plan.updatedText!);
    const onDisk = fs.readFileSync(filePath, "utf-8");
    expect(extractWrittenTitle(onDisk)).toBe(h1);
  });
});
