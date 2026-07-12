# SeoMedic — 사람 행동이 필요한 3건 실행 가이드

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
- LICENSE 저작권자는 "SoDam AI Studio(2026)"로 **임시** 채움(MIT 채택 자체·copyleft 최종 검토는 미결).

### 전문가 검토가 실제로 필요한 6건
| 항목 | 무엇을 결정해야 하는지 | 참고 |
|---|---|---|
| **L1** | 최종 라이선스(MIT 권장이나 확정 아님) + 저작권자명·연도 최종 확정 | `04_PROJECT_SPEC.md:161` |
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

## 참고
- 이 3건이 닫히면 PRD Phase 1.5의 문자 그대로의 성공기준(`01_PRD.md:119-123`, `03_PHASES.md:77-81`)이 **완전히** 충족된다(현재는 "코드 작업" 기준으로만 완료 선언된 상태 — `CHECKPOINT_1.5.md` "Phase 1.5 완료 선언" 섹션 참고).
- Phase 2 실연동(GSC/GA4/PSI, AI 크롤러 정책)은 이 3건과 무관하게 별도 새 세션 인터뷰가 필요(`CHECKPOINT_2.md` 참고).
