import Database from "better-sqlite3";
export type SeomedicDb = Database.Database;
/**
 * projectRoot 아래 `.seomedic/seomedic.db`를 열고(없으면 생성) 스키마를 적용한다.
 * WAL 모드 + foreign_keys on. 이 함수가 반환하는 DB 핸들에 대한 모든 쿼리는
 * repositories/*.ts를 통해서만 나가야 하며, 전부 파라미터 바인딩을 써야 한다(보안 M8).
 */
export declare function openSeomedicDb(projectRoot: string): SeomedicDb;
