// Phase 1.5(수정기) 스키마. 02_DATA_MODEL.md의 Fix 필드를 그대로 반영한다.
// 0001_init.ts는 무수정(최소 침습 원칙) — 신규 마이그레이션으로 분리.
// backup_path는 PRD 스키마에는 없는 감사용 부가 컬럼(git-safety의 backupFiles() 매니페스트 기록용).
export const MIGRATION_0002_FIX = `
CREATE TABLE IF NOT EXISTS fix (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  finding_id INTEGER NOT NULL REFERENCES finding (id),
  fix_type TEXT NOT NULL CHECK (fix_type IN ('file_edit', 'pr', 'report_only')),
  risk_level TEXT NOT NULL CHECK (risk_level IN ('add_safe', 'gated')),
  target_path TEXT,
  dry_run_diff TEXT NOT NULL,
  validation TEXT,
  idempotency_marker TEXT,
  approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected', 'auto')),
  applied_at TEXT,
  backup_path TEXT
);

CREATE INDEX IF NOT EXISTS idx_fix_finding ON fix (finding_id);
CREATE INDEX IF NOT EXISTS idx_fix_approval_status ON fix (approval_status);
`;
//# sourceMappingURL=0002_fix.js.map