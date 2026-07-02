# SeoMedic — Phase 분리 계획

> 개정: v2.5 (최종 — 수정기 Phase 1.5 격리 + GitHub 저장소 모드·보안/법률/문서 배포 게이트 반영)
> 우선순위 원칙(자료 22장): 기술 SEO → 콘텐츠·엔티티 → 구조화 → GEO/AEO → 측정.

> **v1.1 재구성 이유(강력 추천)**: 원안은 Phase 1에 크롤·렌더·규칙엔진·**수정기·승인·회귀**까지 다 넣어 4~6주에 비현실적이었고, 치명 결함(fix 렌더 브릿지·safe 경계·롤백)이 전부 "수정기"에 몰려 있었다. → **분석+회귀를 먼저 완결(Phase 1)**, 위험한 수정기를 **Phase 1.5로 분리**해 리스크를 격리한다. *(확인됨 — 리뷰 지적)*

---

## Phase 1: 분석 + 회귀 (MVP, 예상 4~6주 — 주: 마켓 배포·보안/법률/문서 게이트 포함이라 게이트 비중 크면 재산정)

### 목표
아무 URL이나 신뢰성 있게 진단하고, 재검사 때 원복까지 잡는 **분석 전용 완결 도구**. (수정 없음 = 안전)

### 기능
- [ ] **기술 SEO 분석 엔진** — 크롤 + Playwright 렌더 → 크롤가능성·인덱싱·canonical·상태코드·리다이렉트·**raw vs 렌더드 DOM 비교**·CWV(3회 중앙값)
- [ ] **회귀 자동 감지** — 안정 키(page_url+rule_id+rule_version) 베이스라인 diff, 원복 vs 의도 구분
- [ ] **우선순위 리포트** — 임팩트 순 + Markdown/JSON
- [ ] **크롤 안전장치** — max-pages·depth·rate-limit·robots.txt 준수·식별 UA (04_SPEC 크롤 정책)

### 데이터
- Project, AuditRun, Page, Finding(+finding_key/rule_version), Baseline, Regression

### 전제/설치
- **Playwright 브라우저 바이너리(수백MB) 설치 필요** → 첫 실행 시 자동 설치 안내 또는 시스템 Chrome 채널 사용.

### "진짜 제품" 체크리스트 (분석 도구)
- [ ] 실제 라이브 URL 크롤·렌더 (목업 X)
- [ ] known-good/known-bad 픽스처로 **오탐 0·핵심 규칙 재현율 ≥90%** 검증
- [ ] CWV 3회 중앙값 + "lab≠field" 명시
- [ ] `npx`/스킬로 남이 실제 실행 가능(브라우저 설치 안내 포함)
- [ ] 제3자 사이트 1개로 end-to-end
- [ ] **마켓 플러그인으로 설치 → 다른 프로젝트에서 `/seo-audit` 실행** 검증(Win/Mac/Linux)
- [ ] **배포 게이트**: SECURITY.md·DISCLAIMER.md·MIT·"소유 사이트만" 경고·텔레메트리 0 확인
- [ ] **보안 Must-Have 게이트(04_SPEC)**: SSRF·명령어주입·경로조작·시크릿노출·SQLi 방지 + `npm audit` 고위험 0 통과
- [ ] **법률 게이트(04_SPEC)**: LICENSE+저작권자·의존성 라이선스 스캔(copyleft 0)·THIRD_PARTY_NOTICES·타인 자료 0·크롤 콘텐츠 미동봉·DISCLAIMER 고지 + 법무 검토 필요 항목 표시
- [ ] **문서 게이트(04_SPEC)**: 왕초보용 README(전 목차)·빠른시작·명령어·**TROUBLESHOOTING 매트릭스**·FAQ·법률/면책 완비 — 문서 없이는 '완료' 아님

### Phase 1 시작 프롬프트
```
이 PRD를 읽고 Phase 1(분석+회귀)만 구현해주세요. 수정기는 Phase 1.5입니다.
@.PRD/01_PRD.md @.PRD/02_DATA_MODEL.md @.PRD/04_PROJECT_SPEC.md

Phase 1 범위:
- 기술 SEO 분석 엔진 (크롤 + Playwright 렌더 + raw/rendered 비교 + CWV 3회 중앙값)
- 회귀 감지 (안정 키 = page_url+rule_id+rule_version 베이스라인 diff, 원복/의도 구분)
- 리포트 (Markdown/JSON)
- 크롤 안전장치 (max-pages·depth·rate-limit·robots 준수·식별 UA)

반드시 지켜야 할 것:
- 04_PROJECT_SPEC.md "절대 하지 마" 준수
- 실제 크롤 (목업 X)
- 이 Phase에선 소스 파일을 수정하지 않는다(분석 전용)
- 권한 없는 사이트 무단 크롤 금지
```

---

## Phase 1.5: 수정기 (예상 2~3주)

### 전제 조건
- Phase 1 분석·회귀가 안정 동작

### 목표
**Next.js 소스 프로젝트**를 안전하게 실제 수정(승인형). 다른 스택은 제안만. 대상은 **로컬 폴더 또는 GitHub 저장소**(저장소는 clone→브랜치→PR로 제출).

### 기능
- [ ] **렌더 브릿지** — 폴더 → `next build && next start`(또는 `next dev`) 기동 → 헬스체크 → 로컬 URL → 그 URL로 진단. 포트·타임아웃·기동실패 처리
- [ ] **추가형 자동 수정(add_safe)** — "없는 것만 추가"(빠진 sitemap 항목·신규 OG). 기존 값 덮어쓰기 금지
- [ ] **승인 게이트(gated)** — canonical/noindex/robots/**sitemap/JSON-LD/title/meta/alt**는 검증(스키마·빌드) + diff 승인 후 적용
- [ ] **안전 실행** — 적용 후 `build` 통과 확인, git clean 아니면 백업/중단, 멱등 삽입(마커)
- [ ] **GitHub 저장소 모드** — repo를 임시 sandbox에 clone → 새 브랜치에 수정 → **PR 생성(제안)**. 내 repo=브랜치+PR, 남의 repo=**fork+PR**. **기본 브랜치(main) 직접 push·force-push·자동 머지 절대 금지**(머지는 사람이 결정), GitHub 토큰은 최소 권한·env-only

### 데이터
- Fix(risk_level, dry_run_diff, validation, idempotency_marker)

### 성공기준
- [ ] add_safe 수정이 실제 파일 반영 + `build` 통과
- [ ] gated 항목은 승인 없이 절대 미변경
- [ ] fix 2회 실행해도 중복 없음(멱등)
- [ ] GitHub 저장소 수정 시 **PR만 생성**(main 직접 push 0), 남의 repo는 fork 경유, 자동 머지 0

---

## Phase 2: 구조화·GEO 기초 + 성과 연동 (예상 3~4주)

### 전제 조건
- Phase 1 + 1.5 안정

### 목표
콘텐츠·구조화·AI "입력 위생" + 실제 검색 성과 데이터.

### 기능
- [ ] **구조화데이터·on-page** — JSON-LD 생성·검증, title/meta/h/alt/OG
- [ ] **GEO/AEO 기초** — AI 크롤러 정책(OAI-SearchBot/GPTBot, Claude-SearchBot/ClaudeBot 구분), Q&A 구조. **AI 노출 보장 X**
- [ ] **GSC/GA4/PSI 연동** — 서비스계정 JSON(env), **본인 소유 속성만**, field CWV 결합

### 성공기준 (⚠️ GEO는 결과가 아닌 프로세스 지표)
- [ ] AI 크롤러 정책이 robots/헤더에 **정확히 적용됨**(검색봇 허용·학습봇 차단)
- [ ] JSON-LD가 **Rich Results/스키마 검증 통과** + 페이지 내용과 일치(환각 0)
- [ ] Q&A 구조·검증가능 수치가 존재(노출 여부는 측정 대상 아님 — 비결정적)
- [ ] field(CrUX) 데이터가 리포트에 결합됨
- [ ] **토큰 보안(S2)**: 서비스계정 JSON은 env 경로만, 평문 토큰 저장 0, 최소 scope, 본인 소유 속성만

### 통합 테스트
- Phase 1/1.5 기능이 여전히 정상 동작

---

## Phase 3: 다중 엔진·파이프라인·고급 신호 (예상 4주+)

### 전제 조건
- Phase 1~2 운영 중

### 기능
- [ ] 네이버(Yeti·RSS·서치어드바이저)·Bing·IndexNow
- [ ] CI/CD 통합 — 회귀 시 빌드 실패(GitHub Actions)
- [ ] hreflang·다국어 중복 방지
- [ ] 백링크·엔티티(Common Crawl, 상용 API는 옵션·유료)

### 주의사항
- 상용 API 비용 → 옵션. 다중 엔진 규칙 모듈화 유지.

---

## Phase 로드맵 요약

| Phase | 핵심 기능 | 상태 |
|-------|----------|------|
| Phase 1 (MVP) | 분석 엔진 + 회귀 감지 + 리포트 | 시작 전 |
| Phase 1.5 | 수정기(add_safe/gated) + 승인 + 빌드검증·롤백 | Phase 1 완료 후 |
| Phase 2 | 구조화/GEO 기초 + GSC/GA4/PSI 연동 | Phase 1.5 완료 후 |
| Phase 3 | 네이버·Bing + CI/CD + hreflang + 백링크 | Phase 2 완료 후 |
