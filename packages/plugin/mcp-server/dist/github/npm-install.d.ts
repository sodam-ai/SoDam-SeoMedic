export declare class NpmInstallError extends Error {
}
/**
 * 1.5a(로컬 폴더)는 node_modules가 이미 설치돼 있다고 가정한다(사용자 본인 프로젝트라 이미 세팅됨).
 * GitHub 모드는 다르다 — sandbox에 clone한 건 **사용자가 신뢰하지 않는 제3자 코드**일 수 있어서
 * (특히 "남의 repo=fork+PR" 흐름), package.json의 postinstall 스크립트를 그대로 실행하면 임의 코드
 * 실행 위험이 생긴다(M2 명령어 주입 방지와 같은 종류의 위험 — 설계 검토 중 확인).
 *
 * 그래서 --ignore-scripts를 기본값으로 강제한다. 일부 라이브러리는 postinstall이 실제로 필요해서
 * (예: 네이티브 바이너리 다운로드) 이후 build가 실패할 수 있는데, 그건 "이 저장소는 안전하게 자동
 * 수정할 수 없다"는 정직한 신호로 취급한다(스크립트를 몰래 허용하는 것보다 안전 우선 — fail-closed).
 *
 * yarn/pnpm은 지금 지원하지 않는다(npm처럼 Node.js에 번들되지 않아 설치 위치를 안정적으로 추측할
 * 수 없음 — 억지로 shell 경유 spawn을 쓰느니 범위를 npm으로 한정하는 쪽을 택함, 정직한 제약).
 */
export declare function installDependenciesSafely(projectRoot: string, timeoutMs?: number): Promise<void>;
