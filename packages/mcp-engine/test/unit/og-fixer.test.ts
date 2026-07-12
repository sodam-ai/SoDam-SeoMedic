import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { planOgFix, writeOgFix } from "../../src/fixers/og-fixer.js";

const cleanupDirs: string[] = [];
afterEach(() => {
  for (const dir of cleanupDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function writeFixtureFile(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seomedic-og-fix-test-"));
  cleanupDirs.push(dir);
  const filePath = path.join(dir, "page.tsx");
  fs.writeFileSync(filePath, content);
  return filePath;
}

const STATIC_NO_OPENGRAPH = `export const metadata = {
  title: "About",
};

export default function AboutPage() {
  return <h1>About</h1>;
}
`;

const STATIC_WITH_OPENGRAPH_BOTH = `export const metadata = {
  title: "About",
  openGraph: {
    title: "About (OG)",
    url: "/about",
  },
};

export default function AboutPage() {
  return <h1>About</h1>;
}
`;

const STATIC_WITH_OPENGRAPH_TITLE_ONLY = `export const metadata = {
  title: "About",
  openGraph: {
    title: "About (OG)",
  },
};

export default function AboutPage() {
  return <h1>About</h1>;
}
`;

const STATIC_WITH_OPENGRAPH_EMPTY_TITLE = `export const metadata = {
  title: "About",
  openGraph: {
    title: "",
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

const OPENGRAPH_VARIABLE_REFERENCE = `const baseOg = { title: "About" };
export const metadata = {
  title: "About",
  openGraph: baseOg,
};

export default function AboutPage() {
  return <h1>About</h1>;
}
`;

const OPENGRAPH_WITH_SPREAD = `const baseOg = { title: "About" };
export const metadata = {
  title: "About",
  openGraph: {
    ...baseOg,
  },
};

export default function AboutPage() {
  return <h1>About</h1>;
}
`;

describe("planOgFix — openGraph 필드 자체가 없음(새로 생성)", () => {
  it("소스 값 둘 다 있으면 openGraph를 title·url 둘 다 담아 새로 생성한다", () => {
    const filePath = writeFixtureFile(STATIC_NO_OPENGRAPH);
    const plan = planOgFix(filePath, "제목", "/about");
    expect(plan.applicable).toBe(true);
    expect(plan.updatedText).toContain('openGraph: { title: "제목", url: "/about" }');
    expect(plan.added).toEqual([
      { field: "title", value: "제목" },
      { field: "url", value: "/about" },
    ]);
  });

  it("소스 값이 title만 있으면 title만 담아 생성한다", () => {
    const filePath = writeFixtureFile(STATIC_NO_OPENGRAPH);
    const plan = planOgFix(filePath, "제목", null);
    expect(plan.applicable).toBe(true);
    expect(plan.updatedText).toContain('openGraph: { title: "제목" }');
    expect(plan.updatedText).not.toContain("url:");
  });

  it("writeOgFix가 실제로 디스크에 반영한다", () => {
    const filePath = writeFixtureFile(STATIC_NO_OPENGRAPH);
    const plan = planOgFix(filePath, "제목", "/about");
    writeOgFix(filePath, plan.updatedText!);
    const onDisk = fs.readFileSync(filePath, "utf-8");
    expect(onDisk).toContain('openGraph: { title: "제목", url: "/about" }');
  });

  it("소스 값이 둘 다 null이면 applicable=false(복사할 게 없음)", () => {
    const filePath = writeFixtureFile(STATIC_NO_OPENGRAPH);
    const before = fs.readFileSync(filePath, "utf-8");
    const plan = planOgFix(filePath, null, null);
    expect(plan.applicable).toBe(false);
    expect(fs.readFileSync(filePath, "utf-8")).toBe(before);
  });
});

describe("planOgFix — openGraph는 있지만 필드 일부만 부재(독립 필드 처리)", () => {
  it("openGraph.url만 없으면 url만 추가하고 기존 title은 보존한다", () => {
    const filePath = writeFixtureFile(STATIC_WITH_OPENGRAPH_TITLE_ONLY);
    const plan = planOgFix(filePath, "새 제목", "/about");
    expect(plan.applicable).toBe(true);
    expect(plan.updatedText).toContain('title: "About (OG)"'); // 기존 값 보존
    expect(plan.updatedText).toContain('url: "/about"'); // 새로 추가
    expect(plan.added).toEqual([{ field: "url", value: "/about" }]);
  });
});

describe("planOgFix — openGraph.title·url 둘 다 이미 존재(덮어쓰기 절대 금지, 멱등)", () => {
  it("값과 무관하게 변경하지 않는다", () => {
    const filePath = writeFixtureFile(STATIC_WITH_OPENGRAPH_BOTH);
    const plan = planOgFix(filePath, "다른 제목", "/different");
    expect(plan.applicable).toBe(true);
    expect(plan.updatedText).toBe(plan.originalText); // 변경 없음(멱등)
    expect(plan.added).toEqual([]);
  });

  it("빈 문자열로 존재해도 존재로 취급해 건드리지 않는다", () => {
    const filePath = writeFixtureFile(STATIC_WITH_OPENGRAPH_EMPTY_TITLE);
    const plan = planOgFix(filePath, "새 제목", null);
    expect(plan.applicable).toBe(true);
    expect(plan.updatedText).toBe(plan.originalText); // title이 빈 문자열이어도 존재로 취급, 무변경
    expect(plan.added).toEqual([]);
  });
});

describe("planOgFix — 동적/불확실 구조는 손대지 않음(report_only 폴백)", () => {
  it("generateMetadata() 동적 함수는 applicable=false, 파일 무변경", () => {
    const filePath = writeFixtureFile(DYNAMIC_GENERATE_METADATA);
    const before = fs.readFileSync(filePath, "utf-8");
    const plan = planOgFix(filePath, "제목", "/about");
    expect(plan.applicable).toBe(false);
    expect(fs.readFileSync(filePath, "utf-8")).toBe(before);
  });

  it("openGraph가 변수 참조면 applicable=false", () => {
    const filePath = writeFixtureFile(OPENGRAPH_VARIABLE_REFERENCE);
    const plan = planOgFix(filePath, "제목", "/about");
    expect(plan.applicable).toBe(false);
  });

  it("openGraph 내부에 스프레드가 섞이면 applicable=false", () => {
    const filePath = writeFixtureFile(OPENGRAPH_WITH_SPREAD);
    const plan = planOgFix(filePath, "제목", "/about");
    expect(plan.applicable).toBe(false);
  });
});

describe("planOgFix — 파일 없음", () => {
  it("page.tsx 자체가 없으면 applicable=false", () => {
    const plan = planOgFix("/no/such/path/page.tsx", "제목", "/about");
    expect(plan.applicable).toBe(false);
  });
});
