# SeoMedic (플러그인)

Claude Code에서 웹사이트의 SEO/GEO(검색엔진·생성형 AI 노출) 상태를 진단하는 플러그인입니다.

- 자세한 설치·사용 가이드는 저장소 루트의 `README.md`를 확인하세요.
- 이 폴더(`packages/plugin`)는 마켓플레이스 설치 시 실제로 복제되는 부분이며, 진단 엔진 본체(`@seomedic/mcp`)는 `npx`로 별도 실행됩니다.

## 명령어
| 명령어 | 설명 |
|---|---|
| `/seo-audit <url>` | URL의 SEO/GEO 진단(분석 전용, 소스 수정 없음) |
| `/seo-check [url]` | 이전 진단(베이스라인) 대비 회귀 확인 |
| `/seo-fix` | (Phase 1.5 예정) 아직 미구현 |

보안·면책 정보는 `SECURITY.md`, `DISCLAIMER.md`를 참고하세요.
