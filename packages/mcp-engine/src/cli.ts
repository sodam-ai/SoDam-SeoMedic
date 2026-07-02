#!/usr/bin/env node
import { Command } from "commander";

const program = new Command();

program
  .name("seomedic")
  .description("SeoMedic — SEO/GEO 진단 엔진 (Phase 1: 분석 전용)")
  .version("0.1.0");

program
  .command("audit <url>")
  .description("URL의 SEO/GEO를 진단합니다")
  .option("--site", "사이트 전체 크롤(단일 URL 대신)")
  .option("--max-pages <n>", "사이트 모드 최대 페이지 수", "200")
  .option("--depth <n>", "사이트 모드 최대 깊이", "3")
  .option("--rate-limit <n>", "초당 요청 수", "1")
  .option("--lang <lang>", "출력 언어(ko|en)", "ko")
  .option("--format <format>", "리포트 형식(markdown|json)", "markdown")
  .action(async () => {
    console.error("[seomedic] audit 명령은 아직 구현 중입니다 (M1~M7 진행 예정).");
    process.exitCode = 1;
  });

program
  .command("check [url]")
  .description("이전 진단(베이스라인) 대비 회귀를 확인합니다")
  .action(async () => {
    console.error("[seomedic] check 명령은 아직 구현 중입니다 (M6 진행 예정).");
    process.exitCode = 1;
  });

program.parse(process.argv);
