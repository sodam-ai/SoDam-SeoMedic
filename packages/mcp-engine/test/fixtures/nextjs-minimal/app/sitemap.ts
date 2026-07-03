import type { MetadataRoute } from "next";

// add-safe-guard 테스트용: 정적 배열 리터럴 반환(동적 계산 없음) — add_safe 판정 대상 형태.
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: "https://example.com/", lastModified: new Date(0) }];
}
