import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { planCanonicalFix, writeCanonicalFix } from "../../src/fixers/canonical-fixer.js";

const cleanupDirs: string[] = [];
afterEach(() => {
  for (const dir of cleanupDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function writeFixtureFile(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seomedic-canonical-fix-test-"));
  cleanupDirs.push(dir);
  const filePath = path.join(dir, "page.tsx");
  fs.writeFileSync(filePath, content);
  return filePath;
}

const STATIC_NO_ALTERNATES = `export const metadata = {
  title: "About",
};

export default function AboutPage() {
  return <h1>About</h1>;
}
`;

const STATIC_WITH_CANONICAL = `export const metadata = {
  title: "About",
  alternates: {
    canonical: "/about",
  },
};

export default function AboutPage() {
  return <h1>About</h1>;
}
`;

const STATIC_WITH_ALTERNATES_NO_CANONICAL = `export const metadata = {
  title: "About",
  alternates: {
    languages: {
      "en-US": "/en/about",
    },
  },
};

export default function AboutPage() {
  return <h1>About</h1>;
}
`;

const DYNAMIC_GENERATE_METADATA = `export async function generateMetadata() {
  return { title: "dynamic" };
}

export default function AboutPage() {
  return <h1>About</h1>;
}
`;

const NO_METADATA_AT_ALL = `export default function AboutPage() {
  return <h1>About</h1>;
}
`;

const METADATA_VARIABLE_REFERENCE = `const baseMetadata = { title: "About" };
export const metadata = baseMetadata;

export default function AboutPage() {
  return <h1>About</h1>;
}
`;

const METADATA_WITH_SPREAD = `const baseMetadata = { title: "About" };
export const metadata = {
  ...baseMetadata,
  description: "About page",
};

export default function AboutPage() {
  return <h1>About</h1>;
}
`;

const ALTERNATES_WITH_SPREAD = `const baseAlternates = { canonical: "/legacy-about" };
export const metadata = {
  title: "About",
  alternates: {
    ...baseAlternates,
  },
};

export default function AboutPage() {
  return <h1>About</h1>;
}
`;

describe("planCanonicalFix — alternates 필드 자체가 없음(새로 추가 가능)", () => {
  it("alternates.canonical을 새로 추가한다", () => {
    const filePath = writeFixtureFile(STATIC_NO_ALTERNATES);
    const plan = planCanonicalFix(filePath, "/about");
    expect(plan.applicable).toBe(true);
    expect(plan.updatedText).toContain('alternates: { canonical: "/about" }');
    expect(plan.updatedText).not.toBe(plan.originalText);
  });

  it("writeCanonicalFix가 실제로 디스크에 반영한다", () => {
    const filePath = writeFixtureFile(STATIC_NO_ALTERNATES);
    const plan = planCanonicalFix(filePath, "/about");
    writeCanonicalFix(filePath, plan.updatedText!);
    const onDisk = fs.readFileSync(filePath, "utf-8");
    expect(onDisk).toContain('alternates: { canonical: "/about" }');
  });

  it("루트 경로는 canonical 값이 '/'로 들어간다(절대 URL·origin 아님)", () => {
    const filePath = writeFixtureFile(STATIC_NO_ALTERNATES);
    const plan = planCanonicalFix(filePath, "/");
    expect(plan.updatedText).toContain('alternates: { canonical: "/" }');
    expect(plan.updatedText).not.toContain("http");
  });
});

describe("planCanonicalFix — alternates는 있지만 canonical 없음(canonical만 추가)", () => {
  it("기존 alternates 필드(languages)는 보존하고 canonical만 추가한다", () => {
    const filePath = writeFixtureFile(STATIC_WITH_ALTERNATES_NO_CANONICAL);
    const plan = planCanonicalFix(filePath, "/about");
    expect(plan.applicable).toBe(true);
    expect(plan.updatedText).toContain("languages");
    expect(plan.updatedText).toContain('canonical: "/about"');
  });
});

describe("planCanonicalFix — 이미 canonical 존재(덮어쓰기 절대 금지, 멱등)", () => {
  it("값과 무관하게 변경하지 않는다", () => {
    const filePath = writeFixtureFile(STATIC_WITH_CANONICAL);
    const plan = planCanonicalFix(filePath, "/different-value");
    expect(plan.applicable).toBe(true);
    expect(plan.updatedText).toBe(plan.originalText); // 변경 없음(멱등)
    expect(plan.updatedText).toContain('canonical: "/about"'); // 기존 값 그대로
  });
});

describe("planCanonicalFix — 동적/불확실 구조는 손대지 않음(report_only 폴백)", () => {
  it("generateMetadata() 동적 함수는 applicable=false, 파일 무변경", () => {
    const filePath = writeFixtureFile(DYNAMIC_GENERATE_METADATA);
    const before = fs.readFileSync(filePath, "utf-8");
    const plan = planCanonicalFix(filePath, "/about");
    expect(plan.applicable).toBe(false);
    expect(fs.readFileSync(filePath, "utf-8")).toBe(before);
  });

  it("metadata export 자체가 없으면 applicable=false(새로 만들지 않음)", () => {
    const filePath = writeFixtureFile(NO_METADATA_AT_ALL);
    const plan = planCanonicalFix(filePath, "/about");
    expect(plan.applicable).toBe(false);
  });

  it("metadata가 변수 참조면 applicable=false", () => {
    const filePath = writeFixtureFile(METADATA_VARIABLE_REFERENCE);
    const plan = planCanonicalFix(filePath, "/about");
    expect(plan.applicable).toBe(false);
  });

  it("metadata 최상위에 스프레드가 섞이면 applicable=false(스프레드 출처의 필드를 정적으로 알 수 없음)", () => {
    const filePath = writeFixtureFile(METADATA_WITH_SPREAD);
    const before = fs.readFileSync(filePath, "utf-8");
    const plan = planCanonicalFix(filePath, "/about");
    expect(plan.applicable).toBe(false);
    expect(fs.readFileSync(filePath, "utf-8")).toBe(before);
  });

  it("alternates 내부에 스프레드가 섞이면 applicable=false(스프레드가 이미 canonical을 담고 있을 수 있음)", () => {
    const filePath = writeFixtureFile(ALTERNATES_WITH_SPREAD);
    const plan = planCanonicalFix(filePath, "/about");
    expect(plan.applicable).toBe(false);
  });
});

describe("planCanonicalFix — 파일 없음", () => {
  it("page.tsx 자체가 없으면 applicable=false", () => {
    const plan = planCanonicalFix("/no/such/path/page.tsx", "/about");
    expect(plan.applicable).toBe(false);
  });
});
