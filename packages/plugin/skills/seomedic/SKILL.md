---
name: seomedic
description: 웹 URL의 SEO/GEO(검색엔진·생성형AI 노출) 상태를 진단하거나, 이전 결과 대비 회귀를 확인해야 할 때 사용. "SEO 점검", "이 사이트 검색 노출 어때", "canonical/메타태그 확인", "이전보다 나빠졌나" 같은 요청에 활성화.
---

# SeoMedic 사용 지침

이 스킬은 `seomedic` MCP 서버(`npx -y @seomedic/mcp`)가 제공하는 도구를 조합해 SEO/GEO 진단을 안내한다.

## 언제 무엇을 쓰는가
- 새 URL을 처음 진단 → `/seo-audit` (또는 `seomedic_audit` MCP 도구 직접 호출)
- 이전 진단과 비교해 나빠진 게 있는지 → `/seo-check`
- 소스 코드 자동 수정 요청 → 아직 미지원(Phase 1.5 예정), `/seo-fix` 안내 문구로 응답

## 항상 지킬 것
- 크롤 대상이 사용자 본인 소유/권한 사이트인지 먼저 확인한다(권한 없는 제3자 사이트 무단 크롤 금지).
- `overall_score`는 절대 순위가 아니라 내부 참고 라벨이다 — "72점"처럼 절대 수치로 단정하지 않는다.
- CWV(Core Web Vitals)는 Lighthouse **lab 데이터**(3회 측정 중앙값)이며 실제 사용자 데이터(CrUX field)와 다를 수 있음을 명시한다.
- Phase 1은 **분석 전용**이다. 어떤 진단 과정에서도 사용자의 소스 파일을 수정하지 않는다.
