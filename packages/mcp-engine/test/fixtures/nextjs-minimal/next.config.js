/** @type {import('next').NextConfig} */
const nextConfig = {
  // 이 fixture는 fixer 통합 테스트마다 임시 폴더(OS temp, 대개 사용자 홈 디렉터리의 하위 경로)로
  // 복사돼 그 안에서 빌드된다. Next.js 16(Turbopack)은 워크스페이스 루트를 상위 디렉터리를 훑어
  // 자동 추론하는데, 그 상위 경로 어딘가에 이 프로젝트와 무관한 다른 lockfile이 있으면(실측 확인—
  // 2026-08-20, 로컬 개발 PC 홈 디렉터리에 있던 무관한 package-lock.json 때문에 next build가
  // "잘못된 워크스페이스 루트"로 실패하는 게 실제로 재현됨) 엉뚱한 루트를 골라 빌드가 깨질 수 있다.
  // 공식 문서가 권고하는 대로 루트를 명시해 이 추론 자체를 없앤다(경고 메시지에 안내된 해결책 그대로).
  turbopack: { root: __dirname },
};

module.exports = nextConfig;
