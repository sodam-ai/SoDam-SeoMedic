# SeoMedic — 디자인 문서

> Show Me The PRD로 생성 (2026-07-02) · **v2.5 (최종본 — 정합성 감사 완료)**
> 기반: `RESEARCH_SOURCES.md` + `RESEARCH_SOURCES-ADD.md` + 경쟁 리서치 + 자기검증 + 외부 근거 실측

## 한 줄 소개
**어느 프로젝트에서나** `/plugin install`로 설치해 쓰는 Claude Code 플러그인. **URL이면 SEO/GEO 진단**(스택 무관), **Next.js 소스면 실제 코드 수정**(위험 변경은 승인), **회귀까지 감지**. **Google 우선.**

## 문서 구성

| 문서 | 내용 | 언제 |
|------|------|------|
| [01_PRD.md](./01_PRD.md) | 제품 정의·사용자·기능·성공기준 | 시작 전 |
| [02_DATA_MODEL.md](./02_DATA_MODEL.md) | SQLite 데이터 구조(안정 매칭키·프로젝트별 저장) | 저장 설계 |
| [03_PHASES.md](./03_PHASES.md) | Phase 1→1.5→2→3 (+마켓 배포) | 개발 순서 |
| [04_PROJECT_SPEC.md](./04_PROJECT_SPEC.md) | 플러그인 아키텍처 + AI 규칙 + 보안·법적·문서화 | 코딩 시마다 |

## 핵심 차별점 (근거 실측 완료)
시장: ①"분석만 오픈소스" vs ②"JS 눈속임 SaaS(OTTO=구독끊으면 소멸)". → 빈 공간 = **"URL이면 분석, Next.js 소스면 진짜 코드수정(승인형), 회귀 감지 — 어느 프로젝트에서나 설치."**
가장 단단한 근거: **Google 공식 — raw HTML canonical 우선, JS 주입 canonical 불안정** → 소스 수정이 JS 주입보다 구조적 우위.

---

## ✅ 확정된 결정 (Decision Log v2.5 — 전부 가역)

| 결정 | 값 | 근거 |
|------|----|------|
| **배포 형태** | **Claude Code 마켓플레이스 플러그인**(범용, 어느 프로젝트에서나) | 사용자 지시. 원래 목적("재사용·범용")의 자연스러운 배포. 선례: claude-seo·aaron-seo-geo |
| **아키텍처** | 얇은 플러그인(commands/skills) + **npm MCP 엔진**(`npx @seomedic/mcp`) | 무거운 Playwright/SQLite는 마크다운에 못 담음 → 엔진 분리, npm이 의존성·크로스플랫폼 처리 |
| **GitHub 저장소 수정** | clone→브랜치→**PR(제안)**, 남의 repo는 fork+PR. **main 직접 push·force·자동 머지 금지** | 범용 확장(남의 것도 개선) + 비가역 위험 차단. Dependabot/Renovate 등 PR 봇 모델(확인됨) |
| **보안** | **핵심 요구사항(OWASP ASVS · Secure by Design)** — 04_SPEC에 Must/Should/Could로 반영 | 마켓 배포·소스 수정·URL 크롤러라 SSRF·명령어주입·경로조작·시크릿·공급망이 실질 위험 |
| **법률·저작권** | **핵심 요구사항** — 04_SPEC에 Must/Should/Could + **법무 검토 필요** 구분 | 마켓 공개·상업 사용·타인 저작물 크롤·의존성 라이선스가 실질 위험 |
| **문서화** | **핵심 요구사항** — 왕초보용 README·GUIDE·TROUBLESHOOTING·FAQ(04_SPEC), 문서 없이는 '완료' 아님 | 비개발자·처음 사용자도 설치·사용 가능해야 채택됨 |
| **저장 위치** | 대상 프로젝트별 `.seomedic/`(gitignore) | 베이스라인은 프로젝트별 → 홈 저장 시 충돌 |
| **라이선스** | ~~권장 MIT(최종 확정 필요·법무)~~ **Apache License 2.0로 채택 확정**(2026-08-10) + SECURITY.md + DISCLAIMER.md + THIRD_PARTY_NOTICES | 상업·수정·재배포 허용(저작권·특허 고지 유지+NOTICE 준수 조건). 저작권자명·연도의 법무 최종 확정만 별도 대기 |
| MVP 구조 | Phase 1(분석+회귀) / 1.5(수정기) 분리 | 위험이 수정기에 집중 → 격리 |
| 제품명 | **SeoMedic** | 진단→처방 |
| 수정 지원 스택 | Next.js만, 그 외 report-only | Metadata API 내장(공식) |
| safe/gated | "추가"만 자동, 색인영향=승인 | title=랭킹신호, alt=환각 위험 |
| 크롤 기본 | 단일 URL 기본·사이트모드 200p/depth3/1req·s·robots·**소유 사이트만** | 예의·법적 안전·무한크롤 방지 |
| 다국어 | KO 기본 + `--lang en` | 사용자 KO + 기술용어 EN |

> **미결 = ① 라이선스 최종 확정(저작권자·연도) ② 법무 검토 6건(L1·L2·L4·L5·L12·L13).** 그 외 제품·기술 결정은 완료. **법적 게이트 통과 후 배포** — 그 전까지 코드 착수는 가능.

## ⚠️ 마켓 배포로 새로 켜진 위험 (v2.1에서 1급으로 격상, 04_SPEC에 반영)
| 위험 | 심각도 | 대응 |
|------|--------|------|
| **법적** — 다수 사용자가 임의 제3자 사이트 크롤 | 치명 | robots 준수·rate limit·**소유 사이트만**·DISCLAIMER 동의 |
| **보안** — 플러그인이 남의 PC에서 실행 | 높음 | 텔레메트리·유출 금지·시크릿 env-only·SECURITY.md |
| **책임** — 도구가 소스를 수정 | 높음 | 승인 게이트·dry-run·build 검증·"무보증" 고지 |
| **크로스플랫폼** — Win/Mac/Linux·Playwright 설치 | 중간 | `${CLAUDE_PLUGIN_ROOT}`·3 OS 검증·설치 안내 |

## 🔧 개정 이력
- **v1.1** 적대적 자기검증(치명 3 수정, 수정기 Phase 1.5 격리)
- **v1.2** 외부 근거 14개 실측(반증 0), 정정 4곳
- **v2.0** 남은 미결 자동 확정
- **v2.1** 마켓플레이스 플러그인·범용 배포 확정 + 크로스플랫폼
- **v2.2** 보안 핵심 요구사항(OWASP ASVS·Secure by Design)
- **v2.3** 법률·저작권·라이선스·상업적 이용(법무 검토 구분, MIT→권장으로 완화)
- **v2.4** 왕초보 문서화 요구사항(README·GUIDE·TROUBLESHOOTING·FAQ)
- **v2.5** GitHub 저장소 수정(clone→브랜치→PR, main 직접 push 금지) + **최종 정합성 감사**(버전·명령어·결정로그 통일)

## 다음 단계 (구현)
[03_PHASES.md](./03_PHASES.md)의 "Phase 1 시작 프롬프트"로 착수. 산출물 = 마켓 설치 가능한 SeoMedic 플러그인 + npm 엔진.
