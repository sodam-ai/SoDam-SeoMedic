import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { planNoindexFix, writeNoindexFix } from "../../src/fixers/noindex-fixer.js";

const cleanupDirs: string[] = [];
afterEach(() => {
  for (const dir of cleanupDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function writeFixtureFile(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seomedic-noindex-fix-test-"));
  cleanupDirs.push(dir);
  const filePath = path.join(dir, "page.tsx");
  fs.writeFileSync(filePath, content);
  return filePath;
}

const STATIC_INDEX_FALSE = `export const metadata = {
  title: "About",
  robots: {
    index: false,
  },
};

export default function AboutPage() {
  return <h1>About</h1>;
}
`;

const STATIC_INDEX_FALSE_WITH_FOLLOW = `export const metadata = {
  title: "About",
  robots: {
    index: false,
    follow: true,
  },
};

export default function AboutPage() {
  return <h1>About</h1>;
}
`;

const STATIC_INDEX_TRUE = `export const metadata = {
  title: "About",
  robots: {
    index: true,
  },
};

export default function AboutPage() {
  return <h1>About</h1>;
}
`;

const NO_ROBOTS_FIELD = `export const metadata = {
  title: "About",
};

export default function AboutPage() {
  return <h1>About</h1>;
}
`;

const ROBOTS_AS_STRING = `export const metadata = {
  title: "About",
  robots: "noindex, nofollow",
};

export default function AboutPage() {
  return <h1>About</h1>;
}
`;

const ROBOTS_INDEX_VARIABLE = `const shouldIndex = false;
export const metadata = {
  title: "About",
  robots: {
    index: shouldIndex,
  },
};

export default function AboutPage() {
  return <h1>About</h1>;
}
`;

const ROBOTS_NO_INDEX_FIELD = `export const metadata = {
  title: "About",
  robots: {
    follow: false,
  },
};

export default function AboutPage() {
  return <h1>About</h1>;
}
`;

const ROBOTS_WITH_SPREAD = `const base = { index: false };
export const metadata = {
  title: "About",
  robots: {
    ...base,
  },
};

export default function AboutPage() {
  return <h1>About</h1>;
}
`;

const ROBOTS_WITH_GOOGLEBOT_OVERRIDE = `export const metadata = {
  title: "About",
  robots: {
    index: false,
    googleBot: {
      index: false,
    },
  },
};

export default function AboutPage() {
  return <h1>About</h1>;
}
`;

const DYNAMIC_GENERATE_METADATA = `export async function generateMetadata() {
  return { robots: { index: false } };
}

export default function AboutPage() {
  return <h1>About</h1>;
}
`;

describe("planNoindexFix — robots.index: false → true 교정", () => {
  it("index:false를 true로 뒤집는다", () => {
    const filePath = writeFixtureFile(STATIC_INDEX_FALSE);
    const plan = planNoindexFix(filePath);
    expect(plan.applicable).toBe(true);
    expect(plan.updatedText).toContain("index: true");
    expect(plan.updatedText).not.toBe(plan.originalText);
  });

  it("writeNoindexFix가 실제로 디스크에 반영한다", () => {
    const filePath = writeFixtureFile(STATIC_INDEX_FALSE);
    const plan = planNoindexFix(filePath);
    writeNoindexFix(filePath, plan.updatedText!);
    const onDisk = fs.readFileSync(filePath, "utf-8");
    expect(onDisk).toContain("index: true");
  });

  it("index 외 다른 필드(follow 등)는 그대로 보존한다", () => {
    const filePath = writeFixtureFile(STATIC_INDEX_FALSE_WITH_FOLLOW);
    const plan = planNoindexFix(filePath);
    expect(plan.applicable).toBe(true);
    expect(plan.updatedText).toContain("index: true");
    expect(plan.updatedText).toContain("follow: true");
  });
});

describe("planNoindexFix — 이미 index:true(멱등)", () => {
  it("변경하지 않는다", () => {
    const filePath = writeFixtureFile(STATIC_INDEX_TRUE);
    const plan = planNoindexFix(filePath);
    expect(plan.applicable).toBe(true);
    expect(plan.updatedText).toBe(plan.originalText);
  });
});

describe("planNoindexFix — 안전하게 확신할 수 없는 구조는 손대지 않음(report_only 폴백)", () => {
  it("robots 필드 자체가 없으면 applicable=false(레이아웃 등에서 상속됐을 수 있음)", () => {
    const filePath = writeFixtureFile(NO_ROBOTS_FIELD);
    const before = fs.readFileSync(filePath, "utf-8");
    const plan = planNoindexFix(filePath);
    expect(plan.applicable).toBe(false);
    expect(fs.readFileSync(filePath, "utf-8")).toBe(before);
  });

  it("robots가 문자열 리터럴이면 applicable=false", () => {
    const filePath = writeFixtureFile(ROBOTS_AS_STRING);
    const plan = planNoindexFix(filePath);
    expect(plan.applicable).toBe(false);
  });

  it("robots.index가 변수 참조면 applicable=false", () => {
    const filePath = writeFixtureFile(ROBOTS_INDEX_VARIABLE);
    const plan = planNoindexFix(filePath);
    expect(plan.applicable).toBe(false);
  });

  it("robots에 index 필드 자체가 없으면 applicable=false", () => {
    const filePath = writeFixtureFile(ROBOTS_NO_INDEX_FIELD);
    const plan = planNoindexFix(filePath);
    expect(plan.applicable).toBe(false);
  });

  it("robots에 스프레드가 섞이면 applicable=false", () => {
    const filePath = writeFixtureFile(ROBOTS_WITH_SPREAD);
    const before = fs.readFileSync(filePath, "utf-8");
    const plan = planNoindexFix(filePath);
    expect(plan.applicable).toBe(false);
    expect(fs.readFileSync(filePath, "utf-8")).toBe(before);
  });

  it("robots.googleBot 별도 재정의가 있으면 applicable=false(top-level만 고치면 Googlebot 기준 여전히 noindex일 위험)", () => {
    const filePath = writeFixtureFile(ROBOTS_WITH_GOOGLEBOT_OVERRIDE);
    const before = fs.readFileSync(filePath, "utf-8");
    const plan = planNoindexFix(filePath);
    expect(plan.applicable).toBe(false);
    expect(fs.readFileSync(filePath, "utf-8")).toBe(before);
  });

  it("generateMetadata() 동적 함수는 applicable=false, 파일 무변경", () => {
    const filePath = writeFixtureFile(DYNAMIC_GENERATE_METADATA);
    const before = fs.readFileSync(filePath, "utf-8");
    const plan = planNoindexFix(filePath);
    expect(plan.applicable).toBe(false);
    expect(fs.readFileSync(filePath, "utf-8")).toBe(before);
  });
});

describe("planNoindexFix — 파일 없음", () => {
  it("page.tsx 자체가 없으면 applicable=false", () => {
    const plan = planNoindexFix("/no/such/path/page.tsx");
    expect(plan.applicable).toBe(false);
  });
});
