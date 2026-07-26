export declare class PathGuardError extends Error {
    constructor(message: string);
}
/**
 * `.seomedic/` 폴더가 실제로 project root 내부에 있는지 확인한다.
 * `fs.realpathSync`로 심볼릭 링크를 실제 경로로 풀어낸 뒤 비교하므로, `.seomedic`이
 * 심볼릭 링크로 프로젝트 밖을 가리키게 만들어도(공격 시나리오) 걸러진다.
 */
export declare function resolveSeomedicDbPath(projectRoot: string): string;
