import { createHash } from "node:crypto";
import type { SeomedicDb } from "../connection.js";

const EXCERPT_MAX_CHARS = 500;

export interface PageRecord {
  id: number;
  audit_run_id: number;
  url: string;
  status_code: number;
  raw_has_content: number;
  rendered_diff: string | null;
  html_hash: string;
  html_excerpt: string | null;
  lcp_ms: number | null;
  inp_proxy_tbt_ms: number | null;
  cls_unitless: number | null;
}

export interface CreatePageInput {
  auditRunId: number;
  url: string;
  statusCode: number;
  rawHasContent: boolean;
  /** 원문 전체는 절대 저장하지 않는다(법률 L4) — 이 함수 내부에서 해시+짧은 요약으로만 변환한다. */
  rawHtml: string;
  renderedDiff?: string | null;
  lcpMs?: number | null;
  inpProxyTbtMs?: number | null;
  clsUnitless?: number | null;
}

export function createPage(db: SeomedicDb, input: CreatePageInput): PageRecord {
  const htmlHash = createHash("sha256").update(input.rawHtml).digest("hex");
  const htmlExcerpt = input.rawHtml.slice(0, EXCERPT_MAX_CHARS);

  const result = db
    .prepare(
      `INSERT INTO page (audit_run_id, url, status_code, raw_has_content, rendered_diff, html_hash, html_excerpt, lcp_ms, inp_proxy_tbt_ms, cls_unitless)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.auditRunId,
      input.url,
      input.statusCode,
      input.rawHasContent ? 1 : 0,
      input.renderedDiff ?? null,
      htmlHash,
      htmlExcerpt,
      input.lcpMs ?? null,
      input.inpProxyTbtMs ?? null,
      input.clsUnitless ?? null,
    );
  return findPageById(db, Number(result.lastInsertRowid))!;
}

export function findPageById(db: SeomedicDb, id: number): PageRecord | undefined {
  return db.prepare(`SELECT * FROM page WHERE id = ?`).get(id) as PageRecord | undefined;
}

export function findPagesByAuditRun(db: SeomedicDb, auditRunId: number): PageRecord[] {
  return db.prepare(`SELECT * FROM page WHERE audit_run_id = ?`).all(auditRunId) as PageRecord[];
}
