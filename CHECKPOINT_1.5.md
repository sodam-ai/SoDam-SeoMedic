# SeoMedic Phase 1.5(수정기) — 마일스톤 체크포인트

> 근거: Plan Mode 설계(승인됨, `C:\Users\PC\AppData\Roaming\claude-code\plans\cheeky-whistling-yao.md`).
> Phase 1(M0~M9)은 `CHECKPOINT.md`에서 별도 추적, 커밋 `8bcaf8e`로 완료·보존됨.
> 1.5a(로컬 폴더 fix) 먼저 완결 후 1.5b(GitHub PR 모드) 착수.

## 1.5a-1: git-safety 모듈 — done
- `git-safety/git-guard.ts`: `checkGitClean`(argv배열 spawn, `-- .`로 대상폴더만 스코프), `backupFiles`(대상파일만, sha256 매니페스트), `revertViaGitCheckout`
- 검증: 실제 git repo(init+commit)로 clean/dirty/not_a_repo/추적안된새파일 케이스 + **PATH 실제 제거로 git_not_found 재현** + 실제 checkout 롤백. 8/8 테스트.
- 발견: Windows core.autocrlf가 checkout 시 줄바꿈을 정규화함(테스트 assertion 정규화로 수정, 코드 결함 아님).

## 1.5a-2: render-bridge 모듈(SSRF 분리 경로) — done
- `local-loopback.ts`(assertLocalBridgeUrl — 일반 SSRF가드 미사용, 127.0.0.1 리터럴+origin 완전일치만 통과)
- `server-launcher.ts`(launchLocalNextServer — next 바이너리 직접 spawn, `npm run build` 미경유, tree-kill로 프로세스 트리 종료)
- `local-fetch.ts`(fetchLocalBridgeHtml)
- **실제 Next.js 테스트 픽스처 신설**(`test/fixtures/nextjs-minimal/`, 실제 next@16.2.10 설치) — build→start→헬스체크→raw HTML 획득까지 실제 실행 검증(7.74초, 목업 아님).
- 12/12 테스트(local-loopback 7·local-fetch 3·server-launcher 2).

## 1.5a-3: finding_key 안정화 — done
- `logical-url.ts`(toLogicalPageUrl — 임시 포트를 고정 placeholder 호스트로 치환, 해싱 전용)
- 검증: 서로 다른 랜덤 포트 2개로 같은 경로 넣어도 finding_key가 동일함을 실제로 증명. 5/5 테스트.

## 1.5a-4: next-detect 모듈 — done
- `detect-nextjs.ts`(JSON.parse만 사용, require() 금지 — package.json 선언 확인 + node_modules 실치버전 확인 + App/Pages 라우터 감지)
- 검증: **실제 픽스처 프로젝트로 next@16.2.10·app router 정확 감지** 확인 + 6개 오탐방지 negative case. 8/8 테스트.

## 1.5a-5: add-safe-guard + fixers registry — done
- `fixers/add-safe-guard.ts`(assertFieldAbsent/assertArrayEntryAbsent — ts-morph AST 기반, 정규식 금지)
- `fixers/sitemap-fixer.ts`(정적 배열 리터럴 sitemap.ts 전용, 동적 계산 발견 시 report_only 폴백)
- `fixers/registry.ts`(rule_id 유일성 검증, rules/registry.ts 패턴 미러링)
- **설계 중 발견한 중요 이슈**: sitemap 완전성 검사("크롤된 페이지 vs sitemap 목록 비교")는 본질적으로 **사이트 전체** 단위 판정인데, Phase 1의 `rules/registry.ts`·`evaluateAllRules`는 **페이지 단위**(`RuleContext.pageUrl` 하나)로만 평가하도록 설계돼 있어 이 모델에 안 맞음. 억지로 rules 엔진에 끼워맞추지 않고, **Phase 1.5 fix 오케스트레이터가 크롤 결과+`crawler/sitemap.ts`의 기존 `fetchSitemapUrls()`를 직접 비교해 Finding을 직접 생성**하기로 결정(Phase 1의 rules/registry.ts는 무수정 — 최소 침습 원칙 유지). `fixers/registry.ts` 주석에 명시.
- 검증: 정적 배열(추가 성공·멱등성·재실행 안전) + 동적 계산(파일 미변경 확인) + 파일없음 케이스. 12/12 테스트(sitemap-fixer 7·add-safe-guard 5).

## 누적 테스트: 190/190 통과(Phase 1의 145개 전부 무손상 + Phase 1.5 신규 45개)

## 남은 작업
- [ ] 1.5a-6: DB 마이그레이션 0002_fix + fix 리포지토리
- [ ] 1.5a-7: fix 오케스트레이터 + MCP 툴 5개(seomedic_fix_plan/approve/reject/apply/rollback)
- [ ] 1.5a-8: 실제 Next.js 프로젝트로 전체 통합 검증(add_safe 실제 적용+build통과, gated 미승인시 무변경, 멱등성, git dirty 거부)
- [ ] (1.5a 완결 후) 1.5b: GitHub 저장소 모드
