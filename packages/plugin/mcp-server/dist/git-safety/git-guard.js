import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
/**
 * git argv를 배열로만 spawn한다(셸 문자열 보간 없음 — M2 명령어주입 방지 원칙과 동일).
 * `-- .`로 projectRoot 하위만 스코프해, 모노레포에서 Next 앱 밖의 변경까지 "dirty"로 오탐하지 않는다.
 */
function runGit(projectRoot, args) {
    return new Promise((resolve, reject) => {
        const child = spawn("git", ["-C", projectRoot, ...args], { shell: false });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (d) => (stdout += d.toString()));
        child.stderr.on("data", (d) => (stderr += d.toString()));
        child.on("error", reject); // git 바이너리 자체가 없으면(ENOENT) 여기로
        child.on("close", (code) => resolve({ code, stdout, stderr }));
    });
}
export async function checkGitClean(projectRoot) {
    let result;
    try {
        result = await runGit(projectRoot, ["status", "--porcelain", "--", "."]);
    }
    catch (err) {
        return { clean: false, reason: "git_not_found", details: err.message };
    }
    if (result.code !== 0) {
        return { clean: false, reason: "not_a_repo", details: result.stderr.trim() || "git status 실패" };
    }
    if (result.stdout.trim().length > 0) {
        return { clean: false, reason: "dirty", details: result.stdout.trim() };
    }
    return { clean: true };
}
/**
 * git이 dirty인데도 사용자가 명시적으로 계속 진행하고 싶을 때(opt-in)만 호출한다.
 * 전체 트리가 아니라 **fix가 실제로 건드릴 파일만** 백업한다(fix plan 단계에서 대상이 이미 확정돼 있음).
 */
export function backupFiles(projectRoot, targetPaths, runId) {
    const backupDir = path.join(projectRoot, ".seomedic", "backups", runId);
    fs.mkdirSync(backupDir, { recursive: true });
    const manifest = [];
    for (const relPath of targetPaths) {
        const absPath = path.join(projectRoot, relPath);
        if (!fs.existsSync(absPath))
            continue; // 아직 없는 파일(신규 생성 예정)은 백업 대상 아님
        const content = fs.readFileSync(absPath);
        const sha256 = crypto.createHash("sha256").update(content).digest("hex");
        const backupPath = path.join(backupDir, relPath.replace(/[\\/]/g, "__"));
        fs.mkdirSync(path.dirname(backupPath), { recursive: true });
        fs.writeFileSync(backupPath, content);
        manifest.push({ originalPath: relPath, backupPath, sha256 });
    }
    fs.writeFileSync(path.join(backupDir, "manifest.json"), JSON.stringify(manifest, null, 2));
    return manifest;
}
/** build 실패 등으로 git-clean 경로에서 되돌릴 때 — clean이 사전 보장됐으므로 HEAD로 checkout하면 fix 이전 상태와 동일하다. */
export async function revertViaGitCheckout(projectRoot, targetPaths) {
    if (targetPaths.length === 0)
        return;
    const result = await runGit(projectRoot, ["checkout", "--", ...targetPaths]);
    if (result.code !== 0) {
        throw new Error(`git checkout 롤백 실패: ${result.stderr.trim()}`);
    }
}
//# sourceMappingURL=git-guard.js.map