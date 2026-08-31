import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Project, SyntaxKind } from "ts-morph";
import { planMetaDescriptionFix, writeMetaDescriptionFix } from "../../src/fixers/meta-description-fixer.js";

const cleanupDirs: string[] = [];
afterEach(() => {
  for (const dir of cleanupDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function writeFixtureFile(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seomedic-meta-desc-fix-test-"));
  cleanupDirs.push(dir);
  const filePath = path.join(dir, "page.tsx");
  fs.writeFileSync(filePath, content);
  return filePath;
}

const METADATA_NO_DESCRIPTION = `export const metadata = {
  title: "About",
};

export default function AboutPage() {
  return <h1>회사 소개</h1>;
}
`;

const METADATA_WITH_DESCRIPTION = `export const metadata = {
  title: "About",
  description: "기존 설명",
};

export default function AboutPage() {
  return <h1>회사 소개</h1>;
}
`;

const METADATA_WITH_EMPTY_DESCRIPTION = `export const metadata = {
  title: "About",
  description: "",
};

export default function AboutPage() {
  return <h1>회사 소개</h1>;
}
`;

const METADATA_WITH_SPREAD = `const base = { title: "About" };
export const metadata = {
  ...base,
};

export default function AboutPage() {
  return <h1>회사 소개</h1>;
}
`;

const NO_METADATA_EXPORT = `import Image from "next/image";

export default function AboutPage() {
  return <h1>회사 소개</h1>;
}
`;

const NO_METADATA_NO_IMPORTS = `export default function AboutPage() {
  return <h1>회사 소개</h1>;
}
`;

const USE_CLIENT_NO_METADATA = `"use client";

import { useState } from "react";

export default function AboutPage() {
  const [open] = useState(false);
  return <h1>회사 소개</h1>;
}
`;

const DYNAMIC_GENERATE_METADATA = `export async function generateMetadata() {
  return { title: "About" };
}

export default function AboutPage() {
  return <h1>회사 소개</h1>;
}
`;

function extractWrittenDescription(updatedText: string): string {
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile("page.tsx", updatedText);
  const metadataDecl = sourceFile.getVariableDeclarationOrThrow("metadata");
  const objLit = metadataDecl.getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
  const descProp = objLit.getPropertyOrThrow("description").asKindOrThrow(SyntaxKind.PropertyAssignment);
  const initializer = descProp.getInitializerIfKindOrThrow(SyntaxKind.StringLiteral);
  return initializer.getLiteralValue();
}

describe("planMetaDescriptionFix — <main> 첫 문단을 description으로 복사", () => {
  it("description이 없으면 <main> 첫 문단을 그대로 복사해 추가한다", () => {
    const filePath = writeFixtureFile(METADATA_NO_DESCRIPTION);
    const plan = planMetaDescriptionFix(filePath, "이것은 본문 첫 문단입니다.");
    expect(plan.applicable).toBe(true);
    expect(plan.updatedText).toContain('description: "이것은 본문 첫 문단입니다."');
    expect(plan.updatedText).not.toBe(plan.originalText);
  });

  it("writeMetaDescriptionFix가 실제로 디스크에 반영한다", () => {
    const filePath = writeFixtureFile(METADATA_NO_DESCRIPTION);
    const plan = planMetaDescriptionFix(filePath, "이것은 본문 첫 문단입니다.");
    writeMetaDescriptionFix(filePath, plan.updatedText!);
    const onDisk = fs.readFileSync(filePath, "utf-8");
    expect(onDisk).toContain('description: "이것은 본문 첫 문단입니다."');
  });

  it("description 외 다른 필드(title 등)는 그대로 보존한다", () => {
    const filePath = writeFixtureFile(METADATA_NO_DESCRIPTION);
    const plan = planMetaDescriptionFix(filePath, "본문 문단");
    expect(plan.updatedText).toContain('title: "About"');
    expect(plan.updatedText).toContain('description: "본문 문단"');
  });

  it("155자 넘는 문단은 단어 경계에서 잘리고 말줄임표가 붙는다", () => {
    const filePath = writeFixtureFile(METADATA_NO_DESCRIPTION);
    const longText = "가나다라마바사아자차카타파하 ".repeat(20); // 훨씬 김
    const plan = planMetaDescriptionFix(filePath, longText);
    expect(plan.applicable).toBe(true);
    const written = extractWrittenDescription(plan.updatedText!);
    expect(written.length).toBeLessThanOrEqual(158); // 155 + "..."
    expect(written.endsWith("...")).toBe(true);
  });

  it("155자 이하 문단은 그대로(말줄임표 없음)", () => {
    const filePath = writeFixtureFile(METADATA_NO_DESCRIPTION);
    const shortText = "짧은 본문 문단입니다.";
    const plan = planMetaDescriptionFix(filePath, shortText);
    expect(extractWrittenDescription(plan.updatedText!)).toBe(shortText);
  });
});

describe("planMetaDescriptionFix — 이미 description 존재(멱등, 절대 덮어쓰지 않음)", () => {
  it("description이 이미 있으면 변경하지 않는다", () => {
    const filePath = writeFixtureFile(METADATA_WITH_DESCRIPTION);
    const plan = planMetaDescriptionFix(filePath, "새 본문 문단");
    expect(plan.applicable).toBe(true);
    expect(plan.updatedText).toBe(plan.originalText);
  });

  it("description이 빈 문자열이어도 '존재'로 취급해 덮어쓰지 않는다(add-safe-guard 원칙)", () => {
    const filePath = writeFixtureFile(METADATA_WITH_EMPTY_DESCRIPTION);
    const plan = planMetaDescriptionFix(filePath, "새 본문 문단");
    expect(plan.applicable).toBe(true);
    expect(plan.updatedText).toBe(plan.originalText);
  });
});

describe("planMetaDescriptionFix — 복사할 원본(<main> 문단)이 없으면 report_only 폴백", () => {
  it("mainFirstParagraphText가 null이면 applicable=false, 파일 무변경", () => {
    const filePath = writeFixtureFile(METADATA_NO_DESCRIPTION);
    const before = fs.readFileSync(filePath, "utf-8");
    const plan = planMetaDescriptionFix(filePath, null);
    expect(plan.applicable).toBe(false);
    expect(fs.readFileSync(filePath, "utf-8")).toBe(before);
  });
});

describe("planMetaDescriptionFix — 안전하게 확신할 수 없는 구조는 손대지 않음(report_only 폴백)", () => {
  it("generateMetadata() 동적 함수는 applicable=false, 파일 무변경", () => {
    const filePath = writeFixtureFile(DYNAMIC_GENERATE_METADATA);
    const before = fs.readFileSync(filePath, "utf-8");
    const plan = planMetaDescriptionFix(filePath, "본문 문단");
    expect(plan.applicable).toBe(false);
    expect(fs.readFileSync(filePath, "utf-8")).toBe(before);
  });

  it("metadata에 스프레드가 섞이면 applicable=false", () => {
    const filePath = writeFixtureFile(METADATA_WITH_SPREAD);
    const before = fs.readFileSync(filePath, "utf-8");
    const plan = planMetaDescriptionFix(filePath, "본문 문단");
    expect(plan.applicable).toBe(false);
    expect(fs.readFileSync(filePath, "utf-8")).toBe(before);
  });
});

describe("planMetaDescriptionFix — 파일 없음", () => {
  it("page.tsx 자체가 없으면 applicable=false", () => {
    const plan = planMetaDescriptionFix("/no/such/path/page.tsx", "본문 문단");
    expect(plan.applicable).toBe(false);
  });
});

describe("planMetaDescriptionFix — metadata export 자체가 없으면 새로 삽입한다", () => {
  it("import가 있는 파일: 마지막 import 문 뒤에 새 export를 삽입하고 import는 그대로 보존한다", () => {
    const filePath = writeFixtureFile(NO_METADATA_EXPORT);
    const plan = planMetaDescriptionFix(filePath, "본문 문단");
    expect(plan.applicable).toBe(true);
    expect(plan.updatedText).toContain('import Image from "next/image";');
    expect(plan.updatedText).toContain('export const metadata = {\n  description: "본문 문단",\n};');
    const importIdx = plan.updatedText!.indexOf("import Image");
    const exportIdx = plan.updatedText!.indexOf("export const metadata");
    expect(importIdx).toBeLessThan(exportIdx);
  });

  it("import가 전혀 없는 파일에도 안전하게 삽입된다", () => {
    const filePath = writeFixtureFile(NO_METADATA_NO_IMPORTS);
    const plan = planMetaDescriptionFix(filePath, "본문 문단");
    expect(plan.applicable).toBe(true);
    expect(plan.updatedText).toContain('export const metadata = {\n  description: "본문 문단",\n};');
  });

  it("writeMetaDescriptionFix로 실제 디스크에 반영되고 재파싱해도 유효한 구문이다", () => {
    const filePath = writeFixtureFile(NO_METADATA_EXPORT);
    const plan = planMetaDescriptionFix(filePath, "본문 문단");
    writeMetaDescriptionFix(filePath, plan.updatedText!);
    const onDisk = fs.readFileSync(filePath, "utf-8");
    expect(extractWrittenDescription(onDisk)).toBe("본문 문단");
  });

  it("'use client' 컴포넌트는 metadata export를 삽입하지 않는다(Next.js 제약)", () => {
    const filePath = writeFixtureFile(USE_CLIENT_NO_METADATA);
    const before = fs.readFileSync(filePath, "utf-8");
    const plan = planMetaDescriptionFix(filePath, "본문 문단");
    expect(plan.applicable).toBe(false);
    expect(plan.reason).toContain("use client");
    expect(fs.readFileSync(filePath, "utf-8")).toBe(before);
  });

  it("mainFirstParagraphText가 null이면(복사할 원본 없음) 삽입하지 않고 report_only", () => {
    const filePath = writeFixtureFile(NO_METADATA_EXPORT);
    const before = fs.readFileSync(filePath, "utf-8");
    const plan = planMetaDescriptionFix(filePath, null);
    expect(plan.applicable).toBe(false);
    expect(fs.readFileSync(filePath, "utf-8")).toBe(before);
  });
});

describe("planMetaDescriptionFix — 악의적/경계 입력값(본문 텍스트)도 안전하게 처리", () => {
  it("큰따옴표·백슬래시가 섞인 본문도 값이 정확히 보존되고 파일이 깨지지 않는다", () => {
    const filePath = writeFixtureFile(METADATA_NO_DESCRIPTION);
    const text = `그는 "안녕\\하세요"라고 말했다`;
    const plan = planMetaDescriptionFix(filePath, text);
    expect(plan.applicable).toBe(true);
    expect(extractWrittenDescription(plan.updatedText!)).toBe(text);
  });

  it("백틱이 섞인 본문도 일반 문자열로 안전하게 처리된다", () => {
    const filePath = writeFixtureFile(METADATA_NO_DESCRIPTION);
    const text = "가격은 `${price}`원 입니다";
    const plan = planMetaDescriptionFix(filePath, text);
    expect(extractWrittenDescription(plan.updatedText!)).toBe(text);
  });

  it("</script> 문자열이 섞인 본문도 값 그대로 보존된다", () => {
    const filePath = writeFixtureFile(METADATA_NO_DESCRIPTION);
    const text = "안내: </script><script>alert(1)</script> 종료 시간 안내";
    const plan = planMetaDescriptionFix(filePath, text);
    expect(extractWrittenDescription(plan.updatedText!)).toBe(text);
  });

  it("이모지 등 멀티바이트 유니코드가 섞인 본문도 값이 정확히 보존된다", () => {
    const filePath = writeFixtureFile(METADATA_NO_DESCRIPTION);
    const text = "환영합니다 🎉🚀 최고의 서비스";
    const plan = planMetaDescriptionFix(filePath, text);
    expect(extractWrittenDescription(plan.updatedText!)).toBe(text);
  });

  it("writeMetaDescriptionFix로 실제 디스크에 쓴 뒤 다시 읽어도 악의적 입력 값이 동일하게 보존된다(round-trip)", () => {
    const filePath = writeFixtureFile(METADATA_NO_DESCRIPTION);
    const text = `"인용" \`백틱\` </script> 혼합 테스트`;
    const plan = planMetaDescriptionFix(filePath, text);
    writeMetaDescriptionFix(filePath, plan.updatedText!);
    const onDisk = fs.readFileSync(filePath, "utf-8");
    expect(extractWrittenDescription(onDisk)).toBe(text);
  });
});
