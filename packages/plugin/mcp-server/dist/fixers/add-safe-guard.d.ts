import { type ObjectLiteralExpression, type ArrayLiteralExpression, type Expression } from "ts-morph";
export declare class AddSafeViolationError extends Error {
    constructor(message: string);
}
/**
 * 정규식이 아니라 AST(ts-morph)로만 "이미 존재하는가"를 판정한다 — 정규식 매칭은
 * dom-signals.ts가 이미 "ReDoS·오탐 위험"으로 거부한 원칙과 동일하게 여기서도 배제한다.
 *
 * 값이 빈 문자열/빈 객체/공백이어도 "존재"로 취급한다 — "비어보이니 덮어써도 된다"는 판단 자체를
 * 하지 않는다. add_safe의 정의는 "없는 것만 추가"이지 "비어 보이는 것도 채우기"가 아니다.
 */
export declare function assertFieldAbsent(objLiteral: ObjectLiteralExpression, key: string): void;
export declare function assertArrayEntryAbsent(arrLiteral: ArrayLiteralExpression, matcher: (element: Expression) => boolean): void;
