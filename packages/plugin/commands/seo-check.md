---
name: seo-check
description: 이전 진단(베이스라인) 대비 회귀(원복)를 감지합니다
---

`$1`(URL, 생략 시 마지막으로 진단한 대상)을 `seomedic_check` 도구로 재진단하고, 저장된 Baseline과 비교해 `finding_key`(page_url+rule_id+rule_version) 기준 회귀(regression)와 의도된 변경(intended)을 구분해 보여줘라.

- Baseline이 없으면 "베이스라인이 없습니다. 먼저 `/seo-audit`을 실행하고 저장 여부를 확인해주세요"라고 안내하라(자동 생성하지 않음).
- 회귀로 분류된 항목은 우선순위(critical→low) 순으로 보여주고, 의도된 변경은 별도로 표시하라.
