// Phase 2(GSC/GA4/PSI 연동) 스캐폴딩 스키마. 02_DATA_MODEL.md 120~130행의 Integration 필드를
// 그대로 반영한다. 0001~0003은 무수정(최소 침습 원칙) — 신규 마이그레이션으로 분리.
// CREATE TABLE IF NOT EXISTS만 쓴다(0003의 ALTER TABLE ADD COLUMN과 다름) — connection.ts를 확인해
// 0001/0002와 동일하게 매 open마다 그대로 재실행해도 안전함을 확인했다(SQLite IF NOT EXISTS는
// CREATE TABLE엔 있지만 ALTER TABLE ADD COLUMN엔 없다는 게 0003의 버그 원인이었음 — 이번엔 해당 없음).
export const MIGRATION_0004_INTEGRATION = `
CREATE TABLE IF NOT EXISTS integration (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES project (id),
  type TEXT NOT NULL CHECK (type IN ('gsc', 'ga4', 'psi')),
  auth_method TEXT NOT NULL CHECK (auth_method IN ('service_account')),
  credential_env_ref TEXT NOT NULL,
  property_scope TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_integration_project ON integration (project_id);
`;
//# sourceMappingURL=0004_integration.js.map