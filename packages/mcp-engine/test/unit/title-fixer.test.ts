import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
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
