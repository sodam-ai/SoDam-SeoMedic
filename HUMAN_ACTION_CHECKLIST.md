# SeoMedic — 사람 행동이 필요한 4건 실행 가이드

> 코드로 해결할 수 없는 항목만 모았다. 각 항목은 `CHECKPOINT.md`/`CHECKPOINT_1.5.md`/`CHECKPOINT_2.md`에
> 이미 "남은 작업"으로 추적되고 있음 — 이 문서는 그걸 실제로 처리할 수 있는 실행 단계로 풀어쓴 것.
> ⚠️ 이 문서는 법률 자문이 아니다(L1 항목 참고). 실제 신고·계약·공개 전 전문가 확인 권장.

---

## 1. 법무 검토 6건

`.PRD/04_PROJECT_SPEC.md` 161~192행 원문 근거. **이미 확보된 사실**과 **전문가 판단이 필요한 것**을 구분한다.

### 이미 확보됨 (법무 검토 시 그대로 제출 가능한 근거)
- `license-checker`로 전체 353개 서드파티 패키지 실제 스캔 → **GPL/AGPL 등 카피레프트 0건**(`CHECKPOINT.md` M9-1).
- Apache-2.0 NOTICE 3건(playwright/playwright-core/import-in-the-middle) 원문 그대로 `THIRD_PARTY_NOTICES.md`에 재게시 완료.
- MPL-2.0 3건(axe-core·lightningcss 계열) — 수정 없이 사용, 카피레프트 전이 없음 확인(전문가 재검토는 여전히 권장).
- LICENSE는 **Apache License 2.0으로 채택 확정**(2026-08-10, 프로젝트 소유자 결정 — 커밋 `02229b1`). 저작권자는 "SoDam AI Studio(2026)"로 채워짐 — 단 이 표기·연도의 최종 확정과 copyleft 최종 검토(L2)는 여전히 전문가 검토 대기.

### 전문가 검토가 실제로 필요한 6건
| 항목 | 무엇을 결정해야 하는지 | 참고 |
|---|---|---|
| **L1** | 라이선스 종류는 Apache-2.0으로 확정(소유자 결정, 2026-08-10). **저작권자명·연도의 법무 공식 최종 확정**만 남음 | `04_PROJECT_SPEC.md:161` |
| **L2** | 위 라이선스 스캔 결과에 대한 전문가 최종 승인(카피레프트 재확인) | `04_PROJECT_SPEC.md:162` |
| **L4** | 크롤 콘텐츠 저작권 — fair use 경계(국가별·CFAA·DB권) | `04_PROJECT_SPEC.md:164` |
| **L5** | Google/Naver/Bing/Next.js/Claude/ChatGPT 등 상표 지명적 공정사용 경계 | `04_PROJECT_SPEC.md:165` |
| **L12** | AI가 생성한 코드/문서(이 PRD 포함)의 저작권·상업적 이용 가능성 | `04_PROJECT_SPEC.md:177` |
| **L13** | 제품명 "SeoMedic" 상표 사용 가능성 | `04_PROJECT_SPEC.md:183` |

**실행 단계**: 위 표를 그대로 변호사/전문가에게 전달 → 6건 각각 결정 수령 → `LICENSE`·`README`(법률 섹션)·`DISCLAIMER.md` 갱신은 결정 즉시 코드 세션에서 반영 가능(순수 문서 수정, 새 인터뷰 불필요).

---

## 2. GitHub "fork(남의 저장소)" 경로 실증 — ✅ 완료 (2026-07-13)

**결과**: 실제 GitHub에서 sodam-ai(주 계정) 토큰으로 sodam-test(부계정) 소유 저장소를 대상으로
`runGithubFix()` 실행 → `createFork` → `waitForForkReady` → sandbox clone까지 실제로 성공.
`github.com/sodam-ai/seomedic-fork-test`에 "forked from sodam-test/seomedic-fork-test" 표시로
최종 확인함(스크린샷 검토). 상세 기록은 `CHECKPOINT_1.5.md`의 "GitHub fork 경로 실증" 섹션 참고.

**남은 잔여 리스크(낮음)**: PR 생성(`createPullRequest`)은 테스트 저장소에 `package.json`이 없어
그 직전 단계에서 멈춰 이번엔 실행되지 않았음 — 다만 이 함수 자체는 own-repo 시나리오(PR #1)에서
이미 실제 검증됨.

**후처리 필요**: 아래 "실행 단계 6"(토큰 폐기·테스트 저장소/fork 정리) 진행 권장.

<details>
<summary>과거 기록(실증 전 상태) — 펼쳐서 보기</summary>

**과거 상태**: "내 저장소" 시나리오는 실제 PR(#1)로 검증 완료. fork 경로만 fake client로만 검증됨(`CHECKPOINT_1.5.md:170-227`).

**필요한 것**: 사용자가 소유하지 않은(또는 협업자 권한만 있는) 테스트용 GitHub 저장소 1개.

### 실행 단계 (own-repo 테스트 때 실제로 썼던 절차 그대로 재사용)
1. **테스트 저장소 준비**: 별도 계정으로 새 저장소를 만들거나(예: 부계정), 이미 존재하는 남의 공개 저장소 중 fork 가능한 것을 고른다. `.gitignore`가 있는 저장소를 권장(own-repo 테스트에서 `.gitignore` 없어서 `node_modules`가 untracked로 남는 문제가 실제로 있었음 — `CHECKPOINT_1.5.md:187-190`).
2. **Fine-grained PAT 발급**: 저장소 1개로 범위 제한, 만료 기간 짧게(7일 권장). **Repository permissions를 선택 후 반드시 별도로 Add + Save까지 해야 실제로 반영됨**(선택만 하고 저장 안 누르면 반영 안 됨 — own-repo 테스트에서 실제로 겪은 함정, `CHECKPOINT_1.5.md:186-187`).
3. **환경변수 설정**: `SEOMEDIC_GITHUB_TOKEN`에 위 토큰 설정.
4. **직접 스크립트로 호출**(MCP 서버 경유 X — MCP 서버는 Claude Code의 자식 프로세스라 터미널 환경변수가 전달 안 됨, own-repo 테스트에서 이미 확인된 우회 방법): `createOctokitGithubClient` + `runGithubFix()`를 임시 스크립트로 같은 프로세스 안에서 직접 호출.
5. **확인할 것**: `isOwnRepo`가 false로 정확히 판별되는지, `createFork` 실제 응답 형태(owner/name 위치)가 `api-client.ts` 상단 주석의 가정과 일치하는지, fork 생성 후 폴링이 정상 종료되는지, PR이 fork에서 원본으로 정확히 열리는지.
6. **후처리**: 테스트 종료 후 토큰 폐기, 테스트로 생성된 fork/PR 정리(own-repo 테스트 때처럼 웹에서 직접 삭제 권장 — `gh repo delete`는 CLI 토큰 scope 문제로 실패했던 전례 있음).

</details>

---

## 3. Mac/Linux 수동 실행 검증

**현재 상태**: CI(3-OS × Node 22)가 typecheck+build+318개 유닛테스트 레벨에서 그린. 하지만 이건 **사람이 실제로 `/seo-audit`·`/seo-fix`를 Mac/Linux에서 써본 것과 다름**(`CHECKPOINT_1.5.md:296-301`).

**필요한 것**: Mac 또는 Linux 환경 1개(개인 소유·클라우드 VM·CI 러너 수동 접속 등 무관).

### 체크리스트
- [ ] `npm install` → Playwright Chromium 자동 설치 확인
- [ ] `claude --plugin-dir ... --mcp-config ... --strict-mcp-config -p "..."` 세션 격리 방식으로 `/seo-audit https://example.com` 실행 → 실제 리포트 생성 확인
- [ ] 로컬 Next.js 픽스처(또는 실제 프로젝트)로 `/seo-fix` 로컬 폴더 모드 실행 → gated 승인 흐름 실제 동작 확인
- [ ] **`better-sqlite3` 네이티브 모듈 동작 확인** — CI가 그린이어도 실제 prebuilt 바이너리 로딩은 사전 보장 안 됨(`CHECKPOINT.md` M9-3 명시된 한계)
- [ ] `github/npm-install.ts`의 Unix 레이아웃 처리(`npm_execpath` 우선 확인 로직)가 실제 환경에서도 정상 동작하는지 — 이건 CI가 이미 한 번 실제 버그를 잡아 수정한 지점이라(`CHECKPOINT_1.5.md:326-330`) 재발 여부 특히 주의

---

## 4. Phase 2 남은 2건 — 착수 전 결정·준비 필요

`.PRD/03_PHASES.md:94-103`의 Phase 2 성공기준 중 이 2가지만 미완료다. 둘 다 **코드가 아니라 사람의
결정/외부 인증이 먼저 필요**하다는 게 이미 `CHECKPOINT_2.md`에 기록돼 있었는데, 실행 가능한 형태로
풀어쓴 적은 없었다 — 여기서 처음 정리한다.

### 4-A. AI 크롤러 정책 적용 — ✅ 구현 완료(2026-08-19)

**결과**: 옵션 1(PRD 제안 기본값 채택 — 검색봇 허용/학습봇 차단, 기존 OG fixer와 동일하게 승인 후
적용)을 사용자에게 구체적으로 제시·명시 승인받아 구현했다. `app/robots.ts`가 없을 때만 새 파일
생성을 제안하고(있으면 절대 재구성하지 않음), plan→apply→rollback 전체 생명주기와 통합 테스트
4개(실제 `next build` 포함)까지 완료. 상세 기록은 `CHECKPOINT.md` "Phase 2 '4-A' 구현 완료" 섹션
참고.

**남은 것**: 사람의 실사용 검증(아래 "3. Mac/Linux 수동 실행 검증"에 통합) 전까지는 코드 작업
기준으로만 완료 선언된 상태.

### 4-B. GSC/GA4/PSI 실연동 — PSI는 ✅ 코드 완료(2026-08-19), GSC/GA4는 외부 인증 2종 준비 필요

**PSI 결과**: 실제 Google PSI v5 API를 호출하는 클라이언트(`integrations/psi-client.ts`)를 구현하고
`/seo-audit` 흐름(진입 페이지 한정, CWV와 동일 샘플링)에 연결·리포트에 field 데이터 섹션까지 노출
완료했다. `PAGESPEED_API_KEY` 환경변수 하나만 있으면 된다(서비스계정·속성 소유권 불필요 — 그래서
`Integration` DB 엔티티를 거치지 않고 `github/token.ts`와 같은 env-only 패턴으로 단순하게 구현됨).
상세 기록은 `CHECKPOINT.md` "Phase 2 '4-B' PSI 실연동 완료" 섹션 참고.

**PSI에 남은 것(사람 전용)**: 아래 발급 절차로 실제 키를 만들어 `PAGESPEED_API_KEY`에 설정한 뒤
`/seo-audit https://example.com` 1회 실행 → 리포트에 "Core Web Vitals (field)" 섹션이 실제로
나타나는지 확인. 특히 CLS 수치(코드가 API의 `percentile`값을 100으로 나눠 계산 — 공식 문서 예시로만
확인, 실제 응답 미검증)가 상식적인 범위(보통 0~1 사이)로 나오는지 눈으로 한 번 봐주면 가장 좋다.

**GSC/GA4 결과**(2026-08-20 갱신): 실제 REST client 코드(`integrations/gsc-client.ts`·`ga4-client.ts`)는
완료했다 — 서비스계정 인증(Google 공식 `google-auth-library`)·API 호출·응답 파싱까지 canned
테스트로 검증됐다. **다만 리포트/audit-orchestrator에는 아직 배선하지 않았다**(PSI처럼 audit 결과에
자동으로 섞이지 않음) — 신뢰도가 특히 낮은 두 결정(리포트에 어떻게 노출할지, 기본 조회 기간 28일이
적절한지)은 사람과 함께 정하는 게 안전하다고 판단해 의도적으로 남겨뒀다. 상세는 `CHECKPOINT.md`
"GSC/GA4 실 client 구현(1차)" 섹션 참고.

**아래 외부 인증 준비가 여전히 먼저 필요하다** — 준비가 끝나면 실제 키로 이 client들을 처음 호출해
공식 문서 근거로만 구현한 두 가지(GSC 최근 데이터 불완전 가능성·GA4 `metricValues` 파싱)를 재검증하고,
바로 이어서 orchestrator/report 배선까지 진행할 수 있다.

⚠️ 아래는 Google API의 안정적인 표준 절차(서비스계정 방식)를 기준으로 정리한 것이지, 실시간으로
Google Cloud Console 화면을 열어 확인한 것은 아니다 — 메뉴 이름·위치는 구글 쪽에서 종종 바뀌므로,
막히는 단계가 있으면 Google 공식 문서로 최종 확인 권장.

| 대상 | 필요한 것 | 난이도 |
|---|---|---|
| **PSI**(PageSpeed Insights) | Google Cloud Console에서 "PageSpeed Insights API" 활성화 + API 키 발급만 하면 끝 — **속성 소유권 불필요**(공개 API) | 가장 쉬움, **가장 먼저 실증 권장**(`CHECKPOINT_2.md:153` 기존 권고와 동일) |
| **GSC**(Search Console) | ① Google Cloud 프로젝트에서 "Search Console API" 활성화 ② 서비스계정 생성 + JSON 키 다운로드 ③ **Search Console 자체 화면**에서 그 서비스계정 이메일을 진단 대상 속성의 사용자로 추가(소유권 위임 아님, 조회 권한만) | 중간 — 소유한 속성이 있어야 함 |
| **GA4**(Analytics Data API) | ① 같은(또는 별도) 서비스계정으로 "Google Analytics Data API" 활성화 ② **GA4 관리자 화면 > 속성 액세스 관리**에서 서비스계정 이메일을 "뷰어"로 추가 | 중간 — GA4 속성이 있어야 함 |

**공통 주의**: 서비스계정 JSON 키는 절대 저장소에 커밋하지 않는다 — 기존 `credential-loader.ts` 설계
그대로 `env var가 파일 "경로"만 가리키게` 유지(`CHECKPOINT_2.md:83-86`). 3개 다 준비되지 않아도
PSI만으로 먼저 부분 착수 가능(독립적).

---

## 참고
- 이 3건(1~3번)이 닫히면 PRD Phase 1.5의 문자 그대로의 성공기준(`01_PRD.md:119-123`, `03_PHASES.md:77-81`)이 **완전히** 충족된다(현재는 "코드 작업" 기준으로만 완료 선언된 상태 — `CHECKPOINT_1.5.md` "Phase 1.5 완료 선언" 섹션 참고).
- 4번(Phase 2 잔여) — **4-A(AI 크롤러 정책)·4-B의 PSI 부분 모두 2026-08-19 코드 완료.** PRD가 정의한
  Phase 2 기능 스코프는 이제 전부 코드 기준으로 구현됐다. 남은 건 GSC/GA4(사람의 서비스계정·속성
  권한 부여 먼저 필요)와, PSI 자체도 실제 키로의 최종 실사용 확인뿐이다.
