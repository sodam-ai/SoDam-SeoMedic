import type { FixRecord } from "../db/repositories/fix.js";
import type { FindingRecord } from "../db/repositories/finding.js";
/**
 * fix마다 브랜치명이 결정론적이어야 한다 — 매번 랜덤(예: 타임스탬프·UUID 포함)이면 duplicate-guard.ts가
 * "이미 같은 문제로 PR을 냈는지"를 판단할 기준 자체가 사라진다(설계 검토에서 확인된 핵심 전제).
 * rule_id만으로 결정하는 이유: 같은 프로젝트에서 같은 rule_id 문제는 항상 같은 브랜치로 수렴시켜,
 * 재스캔해도 새 브랜치가 계속 늘어나지 않게 한다(PR 스팸 방지 원칙과 직결).
 */
export declare function buildFixBranchName(ruleId: string): string;
export interface PrContent {
    title: string;
    body: string;
}
/**
 * PR 본문에는 "무엇을 왜 바꿨는지"(법률 L8 accountability)와 함께, add_safe도 그냥 병합해도 되는
 * 무해한 변경이 아니라 사람이 diff를 검토해야 한다는 점을 명시한다(DO-NOT: "safe니까 무해 가정 금지").
 */
export declare function buildPrContent(fixes: Array<{
    fix: FixRecord;
    finding: FindingRecord;
}>): PrContent;
