export interface SitemapFixPlan {
    /** false면 add_safe로 처리할 수 없는 구조라는 뜻(동적 계산 등) — report_only로 폴백해야 한다. */
    applicable: boolean;
    reason: string;
    /** applicable=true일 때만 존재. 실제로 추가될 URL 목록(이미 있는 건 제외돼 있음 — 멱등). */
    urlsToAdd?: string[];
    originalText?: string;
    updatedText?: string;
}
export declare function planSitemapFix(filePath: string, missingUrls: string[]): SitemapFixPlan;
/** plan에서 확정된 텍스트를 실제로 디스크에 쓴다(applyFix 직전 재검증은 오케스트레이터의 책임). */
export declare function writeSitemapFix(filePath: string, updatedText: string): void;
