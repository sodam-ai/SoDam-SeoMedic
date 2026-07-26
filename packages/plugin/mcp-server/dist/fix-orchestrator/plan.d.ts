import { type FindingRecord } from "../db/repositories/finding.js";
import { type FixRecord } from "../db/repositories/fix.js";
import type { SeomedicDb } from "../db/connection.js";
import type { ScannedPage } from "./scan.js";
export declare class FixPlanBlockedError extends Error {
    readonly reason: "dirty" | "git_not_found" | "not_a_repo" | "not_nextjs";
    constructor(reason: "dirty" | "git_not_found" | "not_a_repo" | "not_nextjs", message: string);
}
export interface PlannedFix {
    fix: FixRecord;
    finding: FindingRecord;
}
export interface FixPlanResult {
    projectId: number;
    auditRunId: number;
    findings: FindingRecord[];
    plannedFixes: PlannedFix[];
    reportOnlyFindings: FindingRecord[];
    truncated: boolean;
}
export interface PlanLocalFixOptions {
    /**
     * Project.target에 쓸 값을 projectRoot 대신 지정한다(기본값=projectRoot, 1.5a 동작 그대로 유지).
     * GitHub 모드 전용 — sandbox clone 경로는 실행마다 새로 생기는 임시 경로라, 그걸 그대로 target으로
     * 쓰면 findOrCreateProject가 매번 새 Project를 만들어버려 회귀 이력이 절대 안 쌓인다(설계 검토 중
     * 발견 — repo-cache-path.ts로 DB 파일 자체는 영속화했지만, project.target 값이 여전히 휘발성이면
     * 같은 DB 안에서도 매번 다른 프로젝트로 취급되는 두 번째 층의 문제였음). GitHub 오케스트레이터는
     * `owner/repo` 같은 안정적인 문자열을 넘긴다.
     */
    projectTargetOverride?: string;
}
/**
 * git-clean 확인 → Next.js 감지 → 로컬 서버 기동 → 크롤+렌더+규칙평가(scanLocalFix) →
 * Finding 저장 → fixer가 있는 Finding에 한해 dry-run Fix 생성. 서버는 스캔이 끝나면 항상 종료한다.
 *
 * git dirty면 아예 시작하지 않는다(백업 없이 진행 금지 — PRD "절대 하지 마" 원칙과 동일,
 * 플랜 단계는 아직 아무 파일도 안 건드리지만 dirty 상태에서 진행해봤자 apply 때 다시 막히므로
 * 사용자에게 조기에 알리는 게 낫다는 판단).
 */
export declare function planLocalFix(db: SeomedicDb, projectRoot: string, options?: PlanLocalFixOptions): Promise<FixPlanResult>;
/**
 * R-CANONICAL-MISSING과 달리 이 rule은 JS가 **이미 계산해 렌더링한** canonical 값이 있을 때만 발생한다
 * (raw HTML엔 없고 rendered DOM엔 있음 — canonical.ts의 canonicalJsOnlyRule 조건). 그 값은 반드시
 * 그대로 보존해 raw HTML/소스로 이전해야 하며, planCanonicalFixForFinding처럼 페이지 자기 경로로
 * 자기참조 값을 새로 계산해서는 안 된다 — JS가 계산한 canonical이 의도적으로 다른 경로를 가리킬 수
 * 있기 때문(예: 페이지네이션 2페이지가 1페이지를 canonical로 지정하는 경우). 자기참조를 가정하면 이런
 * 의도적인 비자기참조 canonical을 조용히 깨뜨릴 위험이 있다(Plan Mode 확정 결정).
 */
export declare function planJsOnlyCanonicalFixForFinding(db: SeomedicDb, projectRoot: string, finding: FindingRecord, pages: ScannedPage[]): FixRecord | null;
