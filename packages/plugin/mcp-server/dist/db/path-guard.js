import fs from "node:fs";
import path from "node:path";
export class PathGuardError extends Error {
    constructor(message) {
        super(`경로 보안 위반: ${message}`);
        this.name = "PathGuardError";
    }
}
const DB_DIR_NAME = ".seomedic";
const DB_FILE_NAME = "seomedic.db";
/**
 * Windows는 드라이브 문자가 대소문자를 구분하지 않으므로(`D:\x` == `d:\x`) 단순 문자열 접두어
 * 비교로는 confine 검사가 뚫릴 수 있다 — 항상 소문자로 비교한다(실측 기반 설계, M0 크로스플랫폼 리스크 메모 반영).
 */
function isWithin(root, target) {
    const rootNorm = root.toLowerCase();
    const targetNorm = target.toLowerCase();
    return targetNorm === rootNorm || targetNorm.startsWith(rootNorm + path.sep);
}
/**
 * `.seomedic/` 폴더가 실제로 project root 내부에 있는지 확인한다.
 * `fs.realpathSync`로 심볼릭 링크를 실제 경로로 풀어낸 뒤 비교하므로, `.seomedic`이
 * 심볼릭 링크로 프로젝트 밖을 가리키게 만들어도(공격 시나리오) 걸러진다.
 */
export function resolveSeomedicDbPath(projectRoot) {
    const root = path.resolve(projectRoot);
    if (!fs.existsSync(root)) {
        throw new PathGuardError(`프로젝트 루트가 존재하지 않음: ${root}`);
    }
    const realRoot = fs.realpathSync(root);
    const dbDir = path.join(root, DB_DIR_NAME);
    fs.mkdirSync(dbDir, { recursive: true, mode: 0o700 });
    // mkdirSync의 mode는 디렉터리를 새로 만들 때만 적용되고 기존 디렉터리는 바꾸지 않는다 —
    // 이미 존재하던 .seomedic/(과거 버전이 만든)도 소유자 전용으로 명시 재적용한다
    // (04_PROJECT_SPEC M11/S3: "SQLite 파일 권한 제한"·".seomedic/ 파일 권한 제한", Must-Have).
    // Windows는 POSIX mode가 의미 없어(NTFS ACL 기반) 스킵한다(github/token.ts의 기존 패턴과 동일).
    if (process.platform !== "win32")
        fs.chmodSync(dbDir, 0o700);
    const realDbDir = fs.realpathSync(dbDir);
    if (!isWithin(realRoot, realDbDir)) {
        throw new PathGuardError(`.seomedic 디렉터리가 프로젝트 루트 밖을 가리킴: ${realDbDir} (root: ${realRoot})`);
    }
    return path.join(realDbDir, DB_FILE_NAME);
}
//# sourceMappingURL=path-guard.js.map