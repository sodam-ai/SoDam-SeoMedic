import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { RepoRef } from "./types.js";

const CACHE_DIR_NAME = ".seomedic-github-cache";

/**
 * GitHub 모드의 DB는 sandbox(clone) 경로가 아니라 owner/repo로 식별되는 영속 경로에 열어야 한다.
 *
 * 이유(설계 검토 중 발견한 실제 버그 위험): openSeomedicDb(root)는 `.seomedic/seomedic.db`를 root
 * 하위에 만드는데, root를 sandbox 경로로 주면 작업 후 sandbox를 지울 때 DB도 함께 사라진다 —
 * 그러면 회귀 감지(finding_key 이력)와 중복 PR 방지 기록이 저장소를 다시 스캔할 때마다 매번 초기화되어,
 * 이 제품의 핵심 가치(회귀 감지)가 GitHub 모드에서만 무력화된다.
 *
 * planLocalFix(db, projectRoot)/applyLocalFixes(db, projectRoot, ...)는 db 핸들과 파일 경로를 이미
 * 분리된 인자로 받으므로, db는 이 함수가 반환하는 영속 경로로 열고 projectRoot에는 sandbox 경로를
 * 넘기면 된다(기존 함수 시그니처 변경 없이 재사용 가능).
 */
export function getGithubRepoCacheRoot(ref: RepoRef): string {
  const safeOwner = ref.owner.replace(/[^\w.-]/g, "_");
  const safeRepo = ref.repo.replace(/[^\w.-]/g, "_");
  const cacheRoot = path.join(os.homedir(), CACHE_DIR_NAME, `${safeOwner}__${safeRepo}`);
  fs.mkdirSync(cacheRoot, { recursive: true });
  return cacheRoot;
}
