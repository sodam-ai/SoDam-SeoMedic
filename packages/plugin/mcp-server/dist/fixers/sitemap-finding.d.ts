export interface MissingSitemapResult {
    /** 실제로 sitemap.ts에 추가할 절대 URL(기존 sitemap 항목에서 origin을 추론해 붙임). */
    missingUrls: string[];
    /** 추론에 쓴 origin(기존 sitemap 첫 항목 기준). sitemap이 비어있으면 null. */
    baseOriginInferred: string | null;
    /** origin을 추론할 수 없어(sitemap이 비어있어) 절대 URL을 못 만든, 빠진 경로만(경로 그대로, 자동수정 불가). */
    skippedPaths: string[];
}
/**
 * "크롤된 페이지"와 "sitemap에 실린 URL"을 경로(pathname) 기준으로 비교한다.
 * 크롤된 페이지는 로컬 브릿지의 실제 주소(예: http://127.0.0.1:53214/about)이고
 * sitemap 항목은 보통 실제 배포 도메인(예: https://example.com/about)이라 호스트가 다르므로
 * 전체 URL이 아니라 경로만 비교해야 한다(설계 검토에서 확인된 실제 불일치 지점).
 *
 * sitemap에 항목이 하나도 없으면(빈 배열) 새로 추가할 URL의 절대 origin을 추론할 방법이 없다 —
 * 이 경우 억지로 도메인을 추측하지 않고(fail-closed) skippedPaths로만 보고한다(자동수정 대상 아님).
 */
export declare function findMissingSitemapPaths(crawledUrls: string[], sitemapUrls: string[]): MissingSitemapResult;
