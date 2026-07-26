export type JsonLdNode = Record<string, unknown>;
/**
 * JSON-LD 블록 하나를 파싱해 @graph/배열을 평탄화한 노드 목록으로 만든다.
 * 파싱 실패나 최상위 요소가 객체가 아니면 null(호출자가 "무효" 처리).
 * jsonld.ts(구조 유효성 검사)·qa-structure.ts·jsonld-required-fields.ts가 공유한다.
 */
export declare function parseJsonLdNodes(text: string): JsonLdNode[] | null;
/** 노드의 @type을 배열로 정규화한다(schema.org는 문자열 또는 배열 둘 다 허용). */
export declare function getTypes(node: JsonLdNode): string[];
