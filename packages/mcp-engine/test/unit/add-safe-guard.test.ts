import { describe, it, expect } from "vitest";
import { Project, SyntaxKind } from "ts-morph";
import { assertFieldAbsent, assertArrayEntryAbsent, AddSafeViolationError } from "../../src/fixers/add-safe-guard.js";

function parseObjectLiteral(code: string) {
  const project = new Project({ useInMemoryFileSystem: true });
  const sf = project.createSourceFile("x.ts", `const x = ${code};`);
  return sf.getVariableDeclarations()[0].getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
}

describe("assertFieldAbsent", () => {
  it("필드가 없으면 통과(에러 없음)", () => {
    const obj = parseObjectLiteral(`{ title: "hello" }`);
    expect(() => assertFieldAbsent(obj, "description")).not.toThrow();
  });

  it("필드가 이미 있으면 AddSafeViolationError", () => {
    const obj = parseObjectLiteral(`{ title: "hello" }`);
    expect(() => assertFieldAbsent(obj, "title")).toThrow(AddSafeViolationError);
  });

  it("값이 빈 문자열이어도 '존재'로 취급한다(비어보인다고 덮어쓰기 허용 안 함)", () => {
    const obj = parseObjectLiteral(`{ title: "" }`);
    expect(() => assertFieldAbsent(obj, "title")).toThrow(AddSafeViolationError);
  });
});

describe("assertArrayEntryAbsent", () => {
  it("일치하는 항목이 없으면 통과", () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const sf = project.createSourceFile("x.ts", `const x = [{ id: 1 }];`);
    const arr = sf.getVariableDeclarations()[0].getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression);
    expect(() => assertArrayEntryAbsent(arr, () => false)).not.toThrow();
  });

  it("일치하는 항목이 있으면 AddSafeViolationError", () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const sf = project.createSourceFile("x.ts", `const x = [{ id: 1 }];`);
    const arr = sf.getVariableDeclarations()[0].getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression);
    expect(() => assertArrayEntryAbsent(arr, () => true)).toThrow(AddSafeViolationError);
  });
});
