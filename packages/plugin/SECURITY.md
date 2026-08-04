# SeoMedic 보안 정책

## 이 플러그인이 접근하는 것
- 당신이 지정한 URL(진단 대상) — 크롤·렌더 목적으로만 사용
- 로컬 프로젝트의 `.seomedic/` 폴더(SQLite, 진단 결과 저장) — gitignore 대상

## 이 플러그인이 절대 하지 않는 것
- 진단 결과·크롤 데이터를 외부 서버로 전송(텔레메트리 없음)
- 사설 IP·클라우드 메타데이터 주소(예: `169.254.169.254`) 크롤(SSRF 방지)
- API 키/토큰/비밀번호 등 시크릿을 코드·로그·DB에 저장
- 승인 없이 canonical/noindex/robots/sitemap/JSON-LD/title/meta/alt 변경(Phase 1은 분석 전용이라 소스 수정 자체를 하지 않고, Phase 1.5 수정 기능도 gated 항목은 승인 게이트를 반드시 거침)

## 취약점 신고
보안 문제를 발견하면 저장소 이슈로 신고해주세요(민감한 취약점은 공개 이슈 대신 비공개 채널을 통해 알려주시길 권장합니다).

## 의존성
`npm audit --audit-level=high`를 CI에서 게이트로 사용합니다. 고위험 취약점 발견 시 배포하지 않습니다.

**현재 상태(2026-07-27 실측)**: 워크스페이스(배송 코드) 기준 high/critical 취약점 0건 — CI 게이트(`npm run audit`) 통과. moderate 다수는 전부 `lighthouse` 패키지가 번들한 계측(@opentelemetry/@sentry) 라이브러리의 전이 의존성이며, 이 프로젝트는 해당 계측 코드 경로(amqplib·mongoose·hapi 등)를 호출하지 않습니다. 최신 상태는 `npm audit`으로 직접 재확인할 수 있습니다.

## 의존성 라이선스
전체 서드파티 패키지에서 GPL/AGPL 등 카피레프트 라이선스는 발견되지 않았습니다. 상세 내역은 `THIRD_PARTY_NOTICES.md`를 참고하세요.
