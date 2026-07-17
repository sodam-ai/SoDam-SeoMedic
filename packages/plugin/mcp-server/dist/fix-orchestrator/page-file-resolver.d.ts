/**
 * URL pathname("/", "/about" 등)을 Next.js App Router의 실제 page 파일 상대경로로 변환한다.
 * 못 찾으면 null(자동수정 대상 아님 — report_only로 폴백해야 한다는 신호).
 *
 * 동적 세그먼트([slug] 등)는 별도 특수처리가 필요 없다: 크롤된 pathname의 실제 값(예: "hello-world")이
 * 리터럴 폴더명("[slug]")과 일치하지 않아 fs.existsSync가 자연히 실패하고 null이 반환된다(설계 결정).
 */
export declare function findPageFilePath(projectRoot: string, pathname: string): string | null;
