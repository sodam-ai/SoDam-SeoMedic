import { SyntaxKind } from "ts-morph";
export class AddSafeViolationError extends Error {
    constructor(message) {
        super(`add_safe 위반: ${message}`);
        this.name = "AddSafeViolationError";
    }
}
/**
 * property의 실제(semantic) key를 구한다. ts-morph의 getName()은 이름 노드의 raw source text를
 * 그대로 반환해 따옴표 붙은 키("title")나 계산된 키(["title"])를 "title"과 다른 문자열로 취급한다
 * (실측 확인됨 — 이 때문에 objLiteral.getProperty(key)의 raw text 매칭이 이런 키를 못 잡아 add_safe
 * 위반 감지를 우회당하는 실제 버그가 있었다). 판별이 불가능한 경우(계산된 키의 표현식이 정적 문자열
 * 리터럴이 아님 등)는 null을 반환해 호출부가 "존재할 수도 있다"고 보수적으로 처리하게 한다
 * (추측 금지, fail-closed).
 */
function getStaticPropertyKey(prop) {
    const nameNode = prop.asKind(SyntaxKind.PropertyAssignment)?.getNameNode() ??
        prop.asKind(SyntaxKind.ShorthandPropertyAssignment)?.getNameNode() ??
        prop.asKind(SyntaxKind.MethodDeclaration)?.getNameNode() ??
        prop.asKind(SyntaxKind.GetAccessor)?.getNameNode() ??
        prop.asKind(SyntaxKind.SetAccessor)?.getNameNode();
    if (!nameNode)
        return null; // SpreadAssignment 등 이름 자체가 없는 요소 — 판별 불가로 처리
    const stringLiteral = nameNode.asKind(SyntaxKind.StringLiteral);
    if (stringLiteral)
        return stringLiteral.getLiteralValue();
    const identifier = nameNode.asKind(SyntaxKind.Identifier);
    if (identifier)
        return identifier.getText();
    const numericLiteral = nameNode.asKind(SyntaxKind.NumericLiteral);
    if (numericLiteral)
        return numericLiteral.getText();
    const computed = nameNode.asKind(SyntaxKind.ComputedPropertyName);
    if (computed) {
        const literal = computed.getExpression().asKind(SyntaxKind.StringLiteral);
        return literal ? literal.getLiteralValue() : null; // 정적 문자열이 아닌 계산된 키는 판별 불가
    }
    return null; // PrivateIdentifier 등 그 외 — 판별 불가로 안전 처리
}
/**
 * 정규식이 아니라 AST(ts-morph)로만 "이미 존재하는가"를 판정한다 — 정규식 매칭은
 * dom-signals.ts가 이미 "ReDoS·오탐 위험"으로 거부한 원칙과 동일하게 여기서도 배제한다.
 *
 * 값이 빈 문자열/빈 객체/공백이어도 "존재"로 취급한다 — "비어보이니 덮어써도 된다"는 판단 자체를
 * 하지 않는다. add_safe의 정의는 "없는 것만 추가"이지 "비어 보이는 것도 채우기"가 아니다.
 */
export function assertFieldAbsent(objLiteral, key) {
    for (const prop of objLiteral.getProperties()) {
        const name = getStaticPropertyKey(prop);
        if (name === null) {
            throw new AddSafeViolationError(`필드 "${key}" 존재 여부를 정적으로 확신할 수 없는 프로퍼티가 있음(계산된 키 등) — 추측 금지, 존재로 간주`);
        }
        if (name === key) {
            throw new AddSafeViolationError(`필드 "${key}"가 이미 존재함 — add_safe는 순수 추가만 허용(덮어쓰기 금지)`);
        }
    }
}
export function assertArrayEntryAbsent(arrLiteral, matcher) {
    const found = arrLiteral.getElements().some((el) => matcher(el));
    if (found) {
        throw new AddSafeViolationError("일치하는 배열 항목이 이미 존재함 — add_safe는 중복 추가를 허용하지 않음(멱등)");
    }
}
//# sourceMappingURL=add-safe-guard.js.map