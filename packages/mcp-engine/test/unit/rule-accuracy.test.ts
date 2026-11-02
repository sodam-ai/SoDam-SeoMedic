import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractSignalsFromHtml } from "../../src/render/dom-signals.js";
import { ALL_RULES } from "../../src/rules/registry.js";
import type { RuleContext, RuleViolation } from "../../src/rules/types.js";

/**
 * 규칙 정확도 측정 — PRD 01_PRD §5 "진단 정확도: known-good/known-bad 픽스처에서 오탐 0, 재현율 ≥ 90%".
 *
 * 픽스처 규칙 (test/fixtures/accuracy/):
 *   <규칙ID>.good[.변형].html  = 이 규칙 위반이 "없는" 페이지 → 발화하면 오탐
 *   <규칙ID>.bad[.변형].html   = 이 규칙 위반이 "있는" 페이지 → 발화 안 하면 미탐
 *   <위 파일명 - .html>.raw.html = (선택) JS 실행 전(raw) HTML. 있으면 본 파일은 "JS 실행 후(rendered)" 페이지로
 *                                  취급한다. raw/rendered가 달라야 판정되는 규칙(R-CANONICAL-JS-ONLY 등)용.
 *                                  없으면 같은 HTML을 raw·rendered 양쪽에 쓴다.
 *   변형 이름이 `known-gap`으로 시작하면 "알려진 공백" — 규칙이 지금 실제로 잘못 동작하는 사례를 숨기지 않고
 *      기록한다(good-gap = 지금 오탐, bad-gap = 지금 미탐). 일반 오탐·재현율 계산에서는 빼되 표에 따로 센다.
 *      규칙이 고쳐져 더 이상 틀리지 않으면 이 테스트가 실패하며 "known-gap 접두사를 떼어 승격"하라고 알려준다.
 *
 * 범위(CHECKPOINT 2026-09-05 7차 설계): **새로 만드는 규칙부터** + "핵심 규칙"(색인·표시에 직접 영향 +
 * HTML만으로 판정 가능)에 적용한다. CWV·상태코드·사이트 전체 판정 규칙은 HTML 문자열만으로 판정되지 않아 대상이 아니다.
 */

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "../fixtures/accuracy");
const MAIN_PATTERN = /^(R-[A-Z0-9-]+)\.(good|bad)(?:\.([a-z0-9-]+))?\.html$/;
const RAW_SUFFIX = /\.raw\.html$/;
const MIN_RECALL = 0.9;

interface Fixture {
  file: string;
  rawFile: string | null;
  ruleId: string;
  kind: "good" | "bad";
  knownGap: boolean;
}

function loadFixtures(): { fixtures: Fixture[]; problems: string[] } {
  // 점(.)으로 시작하는 항목·디렉터리는 픽스처가 아니다 — 외부 도구가 작업 폴더에 상태 폴더(.omc 등)를 만들어도
  // 명명 규칙 위반으로 오판하지 않는다. 일반 파일(.html)의 오타는 아래 problems에서 여전히 잡힌다.
  const files = readdirSync(FIXTURE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
    .map((entry) => entry.name);
  const rawHalves = new Map<string, string>();
  for (const file of files) {
    if (RAW_SUFFIX.test(file)) rawHalves.set(file.replace(RAW_SUFFIX, ".html"), file);
  }

  const fixtures: Fixture[] = [];
  const problems: string[] = [];
  for (const file of files) {
    if (RAW_SUFFIX.test(file)) continue;
    const m = MAIN_PATTERN.exec(file);
    if (!m) {
      problems.push(file);
      continue;
    }
    fixtures.push({
      file,
      rawFile: rawHalves.get(file) ?? null,
      ruleId: m[1],
      kind: m[2] as "good" | "bad",
      knownGap: (m[3] ?? "").startsWith("known-gap"),
    });
  }
  for (const [main, raw] of rawHalves) {
    if (!fixtures.some((f) => f.file === main)) problems.push(`${raw} (짝이 되는 ${main} 없음)`);
  }
  return { fixtures, problems };
}

/** 규칙 하나만 평가한다(다른 규칙이 픽스처에서 발화해도 이 측정과 무관). */
function violationsOf(ruleId: string, renderedHtml: string, rawHtml: string | null): RuleViolation[] {
  const rule = ALL_RULES.find((r) => r.id === ruleId);
  if (!rule) throw new Error(`레지스트리에 없는 rule_id: ${ruleId}`);
  const renderedSignals = extractSignalsFromHtml(renderedHtml);
  const rawSignals = rawHtml === null ? renderedSignals : extractSignalsFromHtml(rawHtml);
  const ctx: RuleContext = {
    pageUrl: "https://example.com/",
    statusCode: 200,
    finalUrl: "https://example.com/",
    redirectChain: [],
    rawSignals,
    renderedSignals,
  };
  const result = rule.evaluate(ctx);
  const list = result === null ? [] : Array.isArray(result) ? result : [result];
  return list.filter((v) => v.ruleId === ruleId);
}

function fires(f: Fixture): boolean {
  const rendered = readFileSync(join(FIXTURE_DIR, f.file), "utf8");
  const raw = f.rawFile ? readFileSync(join(FIXTURE_DIR, f.rawFile), "utf8") : null;
  return violationsOf(f.ruleId, rendered, raw).length > 0;
}

describe("규칙 정확도 (known-good/known-bad 픽스처)", () => {
  const { fixtures, problems } = loadFixtures();
  const ruleIds = [...new Set(fixtures.map((f) => f.ruleId))].sort();
  const regular = (id: string, kind: "good" | "bad") =>
    fixtures.filter((f) => f.ruleId === id && f.kind === kind && !f.knownGap);

  it("픽스처 파일명이 전부 규칙에 맞는다(오타·짝 없는 raw 파일로 조용히 무시되는 파일 없음)", () => {
    expect(problems, `명명 규칙 위반 파일: ${problems.join(", ")}`).toEqual([]);
  });

  it("측정 대상 규칙이 1개 이상이다(인프라가 조용히 비어 있지 않음)", () => {
    expect(ruleIds.length).toBeGreaterThan(0);
  });

  it("모든 픽스처의 rule_id가 실제 레지스트리에 존재한다", () => {
    const registered = new Set(ALL_RULES.map((r) => r.id));
    const unknown = ruleIds.filter((id) => !registered.has(id));
    expect(unknown, `레지스트리에 없는 rule_id: ${unknown.join(", ")}`).toEqual([]);
  });

  it("측정 대상 규칙마다 일반 good·bad 픽스처가 각각 1개 이상 있다(known-gap만으로는 측정 불가)", () => {
    for (const ruleId of ruleIds) {
      expect(regular(ruleId, "good").length, `${ruleId}: 일반 good 픽스처 없음`).toBeGreaterThan(0);
      expect(regular(ruleId, "bad").length, `${ruleId}: 일반 bad 픽스처 없음`).toBeGreaterThan(0);
    }
  });

  it("규칙별 오탐 0 · 재현율 ≥ 90% (결과 표 출력)", () => {
    const rows: string[] = [];
    for (const ruleId of ruleIds) {
      const goods = regular(ruleId, "good");
      const bads = regular(ruleId, "bad");
      const gaps = fixtures.filter((f) => f.ruleId === ruleId && f.knownGap);

      const falsePositives = goods.filter(fires);
      const detected = bads.filter(fires);
      const recall = detected.length / bads.length;

      rows.push(
        `${ruleId.padEnd(32)} 오탐 ${falsePositives.length}/${goods.length}  재현 ${detected.length}/${bads.length} (${Math.round(recall * 100)}%)` +
          (gaps.length > 0 ? `  알려진 공백 ${gaps.length}건(${gaps.map((g) => g.kind === "good" ? "오탐" : "미탐").join("·")})` : ""),
      );

      expect(
        falsePositives.map((f) => f.file),
        `${ruleId} 오탐(정상 페이지에서 발화): ${falsePositives.map((f) => f.file).join(", ")}`,
      ).toEqual([]);
      expect(
        recall,
        `${ruleId} 재현율 부족 — 놓친 문제 픽스처: ${bads.filter((f) => !detected.includes(f)).map((f) => f.file).join(", ")}`,
      ).toBeGreaterThanOrEqual(MIN_RECALL);
    }
    console.log(`\n[규칙 정확도] 측정 대상 ${ruleIds.length}/${ALL_RULES.length}개 규칙\n${rows.join("\n")}\n`);
  });

  it("알려진 공백(known-gap)은 지금도 여전히 틀리게 동작한다 — 고쳐졌다면 일반 픽스처로 승격해야 한다", () => {
    for (const f of fixtures.filter((x) => x.knownGap)) {
      const expectedToFire = f.kind === "good"; // good-gap=지금 오탐(발화), bad-gap=지금 미탐(미발화)
      expect(
        fires(f),
        `${f.file}: 규칙이 이제 올바르게 동작함 — 파일명에서 'known-gap-'을 떼어 일반 픽스처로 승격하세요`,
      ).toBe(expectedToFire);
    }
  });
});
