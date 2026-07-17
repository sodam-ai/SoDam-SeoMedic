/**
 * 현재 findings와 베이스라인 스냅샷을 finding_key로 비교해 "원복(regression)"을 찾는다.
 *
 * 핵심 규칙: Baseline.snapshot은 그 시점에 "이미 감지되어 있던" finding_key만 담고 있다
 * (문제가 없으면 애초에 Finding이 안 생기므로 스냅샷에도 안 들어간다). 그래서:
 *   - 베이스라인에 없던 finding_key가 지금 나타났다 = 그때는 없던 문제가 다시/새로 생겼다 = 원복 후보
 *   - 베이스라인에 이미 있던 finding_key(open이든 acknowledged든)는 "계속 있던 것"이라
 *     새로 회귀했다고 볼 수 없다 → 후보에서 제외(중복 알림 방지)
 *
 * "의도된 변경" 처리: 원복 후보인 finding의 현재 status가 이미 'acknowledged'로 표시돼 있으면
 * (사용자가 이번 라운드에서 이미 승인한 경우) classification='intended', 아니면 'regression'이다.
 * acknowledged로 확정된 뒤 사용자가 새 baseline을 저장하면(user_ack), 다음 비교부터는
 * 이 finding_key가 베이스라인에 포함되어 후보에서 아예 빠진다 — 그래서 재차 회귀로 안 뜬다.
 */
export function classifyRegressions(currentFindings, baselineSnapshot) {
    const revertedKeys = [];
    const classification = {};
    for (const finding of currentFindings) {
        if (baselineSnapshot[finding.finding_key]) {
            continue; // 베이스라인 시점에 이미 존재하던 문제 — 새로 회귀한 게 아님
        }
        revertedKeys.push(finding.finding_key);
        classification[finding.finding_key] = finding.status === "acknowledged" ? "intended" : "regression";
    }
    return { revertedKeys, classification };
}
//# sourceMappingURL=classify.js.map