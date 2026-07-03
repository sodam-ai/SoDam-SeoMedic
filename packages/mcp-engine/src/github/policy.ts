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
export function evaluateRepoPolicy(input: RepoPolicyInput): RepoPolicyResult {
  if (input.isArchived) {
    return { allowed: false, blockReason: "archived(보관됨) 저장소는 PR을 받을 수 없습니다", warnings: [] };
  }
  if (input.isDisabled) {
    return { allowed: false, blockReason: "disabled(비활성화됨) 저장소입니다", warnings: [] };
  }

  const warnings: string[] = [];
  if (!input.hasLicense) warnings.push("LICENSE 파일이 없습니다 — 저장소의 기여 규칙을 알 수 없어 주의가 필요합니다");
  if (!input.hasContributing) warnings.push("CONTRIBUTING 가이드가 없습니다 — PR 제출 관례를 미리 확인할 수 없습니다");

  return { allowed: true, blockReason: null, warnings };
}
