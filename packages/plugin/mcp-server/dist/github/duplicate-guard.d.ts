import type { SeomedicDb } from "../db/connection.js";
export interface DuplicateCheckResult {
    isDuplicate: boolean;
    reason: string | null;
}
/**
 * DB만 믿지 않는다 — 사용자가 SeoMedic 밖에서(GitHub 웹 UI로) PR을 직접 닫거나 병합했을 수 있어,
 * DB 기록과 실제 GitHub 상태가 어긋날 수 있다(Plan Mode 설계에서 지적된 위험: "API 이중 확인").
 * listOpenPrBranches를 주입받아 실제 GitHub 없이도 교차확인 로직 자체를 검증할 수 있게 한다.
 */
export declare function checkDuplicatePr(db: SeomedicDb, repoOwner: string, repoName: string, branchName: string, listOpenPrBranches: () => Promise<string[]>): Promise<DuplicateCheckResult>;
