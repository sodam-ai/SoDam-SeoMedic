# SeoMedic (플러그인)

Claude Code에서 웹사이트의 SEO/GEO(검색엔진·생성형 AI 노출) 상태를 진단하는 플러그인입니다.

- 자세한 설치·사용 가이드는 저장소 루트의 `README.md`를 확인하세요.
- 이 폴더(`packages/plugin`)는 마켓플레이스 설치 시 실제로 복제되는 부분이며, 진단 엔진 본체(`@seomedic/mcp`)는 이 폴더 안(`mcp-server/dist/`)에 함께 번들되어 `node`로 직접 실행됩니다(`.mcp.json` 참고 — 최초 세션 시작 시 SessionStart 훅이 의존성을 설치합니다).

## 명령어
| 명령어 | 설명 |
|---|---|
| `/seo-audit <url>` | URL의 SEO/GEO 진단(분석 전용, 소스 수정 없음) |
| `/seo-check [url]` | 이전 진단(베이스라인) 대비 회귀 확인 |
| `/seo-fix` | 로컬 Next.js 프로젝트 자동 수정(승인 게이트) + GitHub 저장소 대상 수정 제안(PR, 본인 소유 저장소는 검증 완료·fork 경로는 실험적) |

보안·면책 정보는 `SECURITY.md`, `DISCLAIMER.md`를 참고하세요.
