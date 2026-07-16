import type { Rule, RuleViolation } from "../types.js";

const RULE_ID_TITLE_MISSING = "R-TITLE-MISSING";
const RULE_ID_H1_MISSING = "R-H1-MISSING";
const RULE_ID_H1_MULTIPLE = "R-H1-MULTIPLE";
const VERSION = 1;

/**
 * title은 canonical과 마찬가지로 검색 스니펫·랭킹에 직접 반영되는 핵심 인덱싱 신호라
 * canonicalMissingRule과 동일한 패턴(raw·rendered 어느 한쪽에라도 있으면 미발화)과 동일한
 * severity(high)를 쓴다. raw엔 없고 rendered(JS)에만 있는 경우는 이미 R-RAW-RENDERED-GAP-TITLE이
 * 다루므로(og.ts에 명시된 "한 근본원인당 한 신호" 원칙과 동일), 여기서는 "완전히 없음"만 본다.
 */
export const titleMissingRule: Rule = {
  id: RULE_ID_TITLE_MISSING,
  version: VERSION,
  category: "meta",
  evaluate(ctx): RuleViolation | null {
    if (ctx.statusCode !== 200) return null;
    if (ctx.rawSignals.title || ctx.renderedSignals.title) return null;
    return {
      ruleId: RULE_ID_TITLE_MISSING,
      ruleVersion: VERSION,
      category: "meta",
      severity: "high",
      pageUrl: ctx.pageUrl,
      currentValue: null,
      recommendedValue: "<title> 태그 추가 권장 — 검색 결과 제목·랭킹에 직접 반영되는 핵심 신호",
    };
  },
};

/**
 * h1은 rendered 기준으로만 판단한다(Google은 렌더링해서 봄 — jsonLdMissingRule과 동일 원칙).
 * 부재가 title·canonical만큼 항상 결정적이진 않아(레이아웃에 따라 시각적 헤딩과 분리되는 경우도 있음)
 * 한 단계 낮은 medium으로 보정한다.
 */
export const h1MissingRule: Rule = {
  id: RULE_ID_H1_MISSING,
  version: VERSION,
  category: "meta",
  evaluate(ctx): RuleViolation | null {
    if (ctx.statusCode !== 200) return null;
    if (ctx.renderedSignals.h1Count > 0) return null;
    return {
      ruleId: RULE_ID_H1_MISSING,
      ruleVersion: VERSION,
      category: "meta",
      severity: "medium",
      pageUrl: ctx.pageUrl,
      currentValue: null,
      recommendedValue: "페이지 핵심 주제를 담은 <h1> 하나 추가 권장",
    };
  },
};

/**
 * h1이 여러 개인 것은 HTML5 섹셔닝 규격상 항상 잘못된 게 아니다(카드형 리스트 등 정당한 패턴 존재).
 * "결함"이 아니라 "확인 권장"에 가까운 낮은 신호로만 다뤄 오탐 리스크를 낮춘다
 * (jsonLdMissingRule과 동일한 보정 원칙 — Phase 1 성공기준의 "오탐 0" 원칙을 존중).
 */
export const h1MultipleRule: Rule = {
  id: RULE_ID_H1_MULTIPLE,
  version: VERSION,
  category: "meta",
  evaluate(ctx): RuleViolation | null {
    if (ctx.statusCode !== 200) return null;
    if (ctx.renderedSignals.h1Count <= 1) return null;
    return {
      ruleId: RULE_ID_H1_MULTIPLE,
      ruleVersion: VERSION,
      category: "meta",
      severity: "low",
      pageUrl: ctx.pageUrl,
      currentValue: `h1 태그 ${ctx.renderedSignals.h1Count}개 발견`,
      recommendedValue: "페이지당 h1 하나만 권장(레이아웃상 의도된 경우 무시 가능)",
    };
  },
};
