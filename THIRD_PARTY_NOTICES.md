# 서드파티 고지 (THIRD_PARTY_NOTICES)

> 근거: `.PRD/04_PROJECT_SPEC.md` L2 — "라이선스별 NOTICE 요건 확인(예: Apache-2.0는 NOTICE 필수)", copyleft(GPL/AGPL) 차단.
> 실행: `npx license-checker --summary` (전체 353개 서드파티 패키지, `packages/mcp-engine`의 실제 잠긴 의존성 기준)
> 스캔일: 2026-07-03

## 1. 결론 — copyleft 없음 (Must L2 충족)

`GPL`·`AGPL`·`LGPL` 계열 라이선스는 **0건** 발견됨(전체 353개 서드파티 패키지 스캔 완료). MIT 라이선스(권장)로 배포하는 데 구조적 장애가 되는 의존성은 없다.

## 2. 라이선스 분포 (전체 353개)

| 라이선스 | 개수 | 비고 |
|---|---|---|
| MIT | 249 | |
| Apache-2.0 | 53 | 아래 §3 NOTICE 첨부 |
| ISC | 24 | MIT와 사실상 동등(퍼미시브) |
| BSD-2-Clause | 11 | 퍼미시브 |
| BSD-3-Clause | 9 | 퍼미시브 |
| MPL-2.0 | 3 | 아래 §4 참고(약한 카피레프트, 파일 단위) |
| 0BSD | 1 | 퍼미시브(사실상 퍼블릭 도메인) |
| 듀얼 라이선스(MIT/WTFPL 등) | 2 | 퍼미시브 옵션 포함 |

**주요 직접 의존성 라이선스**: playwright/playwright-core(Apache-2.0), lighthouse(Apache-2.0), better-sqlite3(MIT), commander(MIT), fast-xml-parser(MIT), linkedom(ISC), robots-parser(MIT), undici(MIT), zod(MIT), typescript(Apache-2.0), vitest(MIT), @modelcontextprotocol/sdk(MIT).

## 3. Apache License 2.0 — NOTICE 원문 재게시 (필수 조항 이행)

Apache-2.0 §4(d)는 "라이선스 대상물에 NOTICE 파일이 포함되어 있으면 그 고지 내용을 재게시해야 한다"고 규정한다. 의존성 트리 전체에서 실제로 `NOTICE` 파일을 포함한 패키지는 3개이며, 원문 그대로 아래에 재게시한다.

### playwright / playwright-core

```
Playwright
Copyright (c) Microsoft Corporation

This software contains code derived from the Puppeteer project (https://github.com/puppeteer/puppeteer),
available under the Apache 2.0 license (https://github.com/puppeteer/puppeteer/blob/master/LICENSE).
```

### import-in-the-middle

```
import-in-the-middle is licensed for use as follows:

Copyright 2024 Node.js contributors. All rights reserved.

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

        http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.

This license applies to parts of import-in-the-middle originating from the
https://github.com/DataDog/import-in-the-middle repository:

    This product includes software developed at Datadog (https://www.datadoghq.com/).

    Copyright 2021 Datadog, Inc.

    Licensed under the Apache License, Version 2.0 (the "License");
    ...(위와 동일 조건)
```

나머지 Apache-2.0 패키지 50개(@opentelemetry/*, @google-cloud/*, typescript 등)는 자체 `NOTICE` 파일을 포함하지 않으므로 재게시 의무가 없다(라이선스 원문 링크만으로 충분 — 각 패키지의 LICENSE 파일 참고).

## 4. Mozilla Public License 2.0 — 약한 카피레프트 (수정 안 함 확인)

`axe-core`(lighthouse의 접근성 검사 하위 의존성), `lightningcss`/`lightningcss-win32-x64-msvc`(빌드 도구 체인 하위 의존성) 3개가 MPL-2.0이다. MPL-2.0의 카피레프트 의무는 **"MPL 대상 파일을 수정해서 배포할 경우"에만** 발생하며, 우리는 이 패키지들을 **수정 없이 그대로(as-is)** 의존성으로만 사용한다 — 그러므로 우리 코드(MIT)에 대한 카피레프트 전이는 없다. (법무 검토 시 재확인 권장 — 이 판단은 법률 자문이 아님.)

## 5. 재현 방법

```bash
npx license-checker --summary   # 요약
npx license-checker --json      # 패키지별 상세(라이선스·저장소 링크)
```

## 6. 결정 완료 / 법무 검토 필요 (구분 명확화)

- [x] copyleft(GPL/AGPL) 스캔 — **0건, 충돌 없음** (Must L2, 코드로 확인 가능한 부분)
- [x] Apache-2.0 NOTICE 재게시 — 완료(§3)
- [ ] **법무 검토 필요**: 위 판단(MPL-2.0 무관, Apache-2.0 재게시 충분성)은 법률 자문이 아니며, 실제 상업 배포 전 전문가 확인 권장(PRD L1·L2 "법무 검토 필요" 항목과 동일 성격)
