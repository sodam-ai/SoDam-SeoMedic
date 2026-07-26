export interface RepoPolicyInput {
    isArchived: boolean;
    isDisabled: boolean;
    hasLicense: boolean;
    hasContributing: boolean;
}
export interface RepoPolicyResult {
    allowed: boolean;
    blockReason: string | null;
    warnings: string[];
}
/**
 * archived/disabled 저장소는 PR을 받을 수 없거나(archived) 받아선 안 되므로(disabled) 아예 차단한다.
 * LICENSE·CONTRIBUTING이 없으면 경고만 하고 진행은 허용한다 — 없다고 자동수정을 아예 막으면 지나치게
 * 보수적이고, 이건 "저장소의 기여 규칙을 존중"하라는 DO-NOT 원칙의 정보성 안내 수준으로 충분하다.
 */
export declare function evaluateRepoPolicy(input: RepoPolicyInput): RepoPolicyResult;
