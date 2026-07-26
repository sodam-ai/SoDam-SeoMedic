import { XMLParser } from "fast-xml-parser";
import { safeFetch } from "./fetch-client.js";
const MAX_SITEMAP_BYTES = 50 * 1024 * 1024; // 50MB 상한
const MAX_SITEMAP_INDEX_ENTRIES = 50; // sitemap-index가 가리키는 하위 sitemap 처리 상한(폭주 방지)
// 사이트맵은 커스텀 엔티티가 필요 없는 규격이라 XXE 표면을 아예 없앤다(processEntities: false).
// maxNestedTags 기본값(100)이 이미 과도한 중첩을 막아주지만, 사이트맵 구조상 중첩이 얕으므로 더 낮게 제한한다.
const parser = new XMLParser({
    ignoreAttributes: true,
    processEntities: false,
    maxNestedTags: 20,
});
function toArray(value) {
    if (value === undefined)
        return [];
    return Array.isArray(value) ? value : [value];
}
async function defaultSitemapFetcher(url) {
    return safeFetch(url, { maxBytes: MAX_SITEMAP_BYTES });
}
/**
 * sitemap.xml(또는 sitemap-index.xml)을 가져와 최종 URL 목록으로 평탄화한다.
 * sitemap-index는 최대 MAX_SITEMAP_INDEX_ENTRIES개까지만 하위 sitemap을 따라가고,
 * 그 이상은 truncated=true로 표시해 상위(큐)가 알 수 있게 한다.
 *
 * fetcher는 기본값(safeFetch 기반)이 기존 동작을 그대로 보존한다 — 로컬 렌더 브릿지(127.0.0.1)는
 * safeFetch가 SSRF 가드로 차단하므로, fix 오케스트레이터만 fetchLocalBridgeHtml 기반 fetcher를 넘긴다.
 */
export async function fetchSitemapUrls(sitemapUrl, maxPages, fetcher = defaultSitemapFetcher) {
    const urls = [];
    let truncated = false;
    const res = await fetcher(sitemapUrl);
    if (res.status !== 200) {
        return { urls, truncated };
    }
    let parsed;
    try {
        parsed = parser.parse(res.bodyText);
    }
    catch {
        return { urls, truncated: false }; // 파싱 실패 시 조용히 빈 목록(크롤러가 일반 링크 탐색으로 폴백)
    }
    if (parsed.sitemapindex) {
        const childSitemaps = toArray(parsed.sitemapindex.sitemap)
            .map((s) => (typeof s?.loc === "string" ? s.loc : undefined))
            .filter((loc) => Boolean(loc));
        const limited = childSitemaps.slice(0, MAX_SITEMAP_INDEX_ENTRIES);
        if (childSitemaps.length > MAX_SITEMAP_INDEX_ENTRIES)
            truncated = true;
        for (const child of limited) {
            if (urls.length >= maxPages) {
                truncated = true;
                break;
            }
            const childResult = await fetchSitemapUrls(child, maxPages - urls.length, fetcher);
            urls.push(...childResult.urls);
            if (childResult.truncated)
                truncated = true;
        }
        return { urls: urls.slice(0, maxPages), truncated };
    }
    if (parsed.urlset) {
        const entries = toArray(parsed.urlset.url)
            .map((u) => (typeof u?.loc === "string" ? u.loc : undefined))
            .filter((loc) => Boolean(loc));
        if (entries.length > maxPages)
            truncated = true;
        return { urls: entries.slice(0, maxPages), truncated };
    }
    return { urls, truncated };
}
//# sourceMappingURL=sitemap.js.map