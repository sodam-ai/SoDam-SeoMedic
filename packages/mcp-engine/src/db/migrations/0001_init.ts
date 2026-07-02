// SeoMedic Phase 1 스키마. Fix/Integration 테이블은 Phase 1.5/2 범위라 여기 포함하지 않는다(YAGNI).
// 크롤 원본 전체 텍스트는 저장하지 않는다(법률 L4 + 02_DATA_MODEL 결정) — html_hash만 저장.
// TS 문자열 상수로 두는 이유: tsc 빌드는 .ts만 dist/로 컴파일하므로, 별도 .sql 파일은 dist에
// 복사되지 않아 npm 배포 후 런타임에 못 찾는 문제가 생긴다(자산 복사 파이프라인 없이 안전한 선택).
export const MIGRATION_0001_INIT = `
CREATE TABLE IF NOT EXISTS project (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('analyze', 'analyze-fix')),
  source_available INTEGER NOT NULL DEFAULT 0,
  detected_stack TEXT,
  local_server_cmd TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_run (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES project (id),
  scope TEXT NOT NULL CHECK (scope IN ('technical', 'on-page', 'all')),
  render_source TEXT,
  overall_score INTEGER,
  started_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS page (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  audit_run_id INTEGER NOT NULL REFERENCES audit_run (id),
  url TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  raw_has_content INTEGER NOT NULL,
  rendered_diff TEXT,
  html_hash TEXT NOT NULL,
  html_excerpt TEXT,
  lcp_ms REAL,
  inp_proxy_tbt_ms REAL,
  cls_unitless REAL
);

CREATE TABLE IF NOT EXISTS finding (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  finding_key TEXT NOT NULL,
  audit_run_id INTEGER NOT NULL REFERENCES audit_run (id),
  category TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  rule_version INTEGER NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  page_url TEXT NOT NULL,
  current_value TEXT,
  recommended_value TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'fixed', 'reverted', 'acknowledged', 'ignored'))
);

CREATE INDEX IF NOT EXISTS idx_finding_key ON finding (finding_key);
CREATE INDEX IF NOT EXISTS idx_finding_audit_run ON finding (audit_run_id);

CREATE TABLE IF NOT EXISTS baseline (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES project (id),
  snapshot TEXT NOT NULL,
  created_by TEXT NOT NULL CHECK (created_by IN ('auto', 'user_ack')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS regression (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES project (id),
  baseline_id INTEGER NOT NULL REFERENCES baseline (id),
  reverted_keys TEXT NOT NULL,
  classification TEXT NOT NULL,
  detected_at TEXT NOT NULL
);
`;
