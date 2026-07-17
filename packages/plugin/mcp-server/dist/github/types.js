export class InvalidRepoUrlError extends Error {
}
const GITHUB_HOST = "github.com";
/**
 * `https://github.com/owner/repo`, `https://github.com/owner/repo.git`, `github.com/owner/repo`,
 * `owner/repo` 형태를 전부 받는다. github.com이 아닌 호스트(사설 GHE 등)는 지금 범위 밖이라 명시 거부한다
 * (조용히 잘못 파싱하는 것보다 fail-closed가 안전 — M5 입력 불신 검증 원칙과 동일).
 */
export function parseRepoUrl(input) {
    const trimmed = input.trim();
    const shorthand = trimmed.match(/^([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
    if (shorthand && !trimmed.includes("://") && !trimmed.includes(GITHUB_HOST)) {
        return { owner: shorthand[1], repo: shorthand[2] };
    }
    let url;
    try {
        url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    }
    catch {
        throw new InvalidRepoUrlError(`GitHub 저장소 주소를 해석할 수 없습니다: ${input}`);
    }
    if (url.hostname.toLowerCase() !== GITHUB_HOST) {
        throw new InvalidRepoUrlError(`github.com 저장소만 지원합니다(입력된 호스트: ${url.hostname})`);
    }
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) {
        throw new InvalidRepoUrlError(`저장소 경로를 찾을 수 없습니다(owner/repo 형태여야 함): ${input}`);
    }
    return { owner: parts[0], repo: parts[1].replace(/\.git$/, "") };
}
//# sourceMappingURL=types.js.map