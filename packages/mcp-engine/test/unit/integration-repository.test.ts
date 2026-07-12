import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { openSeomedicDb } from "../../src/db/connection.js";
import { createProject } from "../../src/db/repositories/project.js";
import { insertIntegration, findIntegrationById, findIntegrationsByProject } from "../../src/db/repositories/integration.js";
import type { SeomedicDb } from "../../src/db/connection.js";

const cleanupDirs: string[] = [];
afterEach(() => {
  for (const dir of cleanupDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function makeTempProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seomedic-integration-repo-test-"));
  cleanupDirs.push(dir);
  return dir;
}

/** Integration은 Project에 1:N이라 테스트마다 실제 Project 하나를 먼저 만들어야 한다(FK 제약). */
function makeTestProject(db: SeomedicDb): { projectId: number } {
  const project = createProject(db, { target: "https://my-site.com", mode: "analyze", sourceAvailable: false });
  return { projectId: project.id };
}

describe("integration 리포지토리 — 실제 SQLite 파일", () => {
  it("insertIntegration으로 gsc 연동을 생성하고 조회한다", () => {
    const db = openSeomedicDb(makeTempProject());
    const { projectId } = makeTestProject(db);

    const integration = insertIntegration(db, {
      projectId,
      type: "gsc",
      authMethod: "service_account",
      credentialEnvRef: "GSC_SERVICE_ACCOUNT_PATH",
      propertyScope: "https://my-site.com",
    });

    expect(integration.id).toBeGreaterThan(0);
    expect(integration.type).toBe("gsc");
    expect(integration.auth_method).toBe("service_account");
    expect(integration.credential_env_ref).toBe("GSC_SERVICE_ACCOUNT_PATH");
    expect(integration.property_scope).toBe("https://my-site.com");
    expect(findIntegrationById(db, integration.id)?.id).toBe(integration.id);
    expect(findIntegrationsByProject(db, projectId)).toHaveLength(1);

    db.close();
  });

  it("psi 연동은 property_scope에 URL을 그대로 저장한다(PSI는 공개 API — 속성 소유권 검증 불필요)", () => {
    const db = openSeomedicDb(makeTempProject());
    const { projectId } = makeTestProject(db);

    const integration = insertIntegration(db, {
      projectId,
      type: "psi",
      authMethod: "service_account",
      credentialEnvRef: "PAGESPEED_API_KEY",
      propertyScope: "https://my-site.com/blog",
    });

    expect(integration.type).toBe("psi");
    expect(integration.property_scope).toBe("https://my-site.com/blog");

    db.close();
  });

  it("ga4 연동도 동일하게 생성·조회된다", () => {
    const db = openSeomedicDb(makeTempProject());
    const { projectId } = makeTestProject(db);

    const integration = insertIntegration(db, {
      projectId,
      type: "ga4",
      authMethod: "service_account",
      credentialEnvRef: "GA4_PROPERTY_ID",
      propertyScope: "properties/123456",
    });

    expect(integration.type).toBe("ga4");

    db.close();
  });

  it("여러 project의 integration이 섞이지 않고 project_id로 필터링된다", () => {
    const db = openSeomedicDb(makeTempProject());
    const { projectId: p1 } = makeTestProject(db);
    const project2 = createProject(db, { target: "https://other.com", mode: "analyze", sourceAvailable: false });

    insertIntegration(db, {
      projectId: p1,
      type: "gsc",
      authMethod: "service_account",
      credentialEnvRef: "GSC_SERVICE_ACCOUNT_PATH",
      propertyScope: "https://my-site.com",
    });
    insertIntegration(db, {
      projectId: project2.id,
      type: "ga4",
      authMethod: "service_account",
      credentialEnvRef: "GA4_PROPERTY_ID",
      propertyScope: "https://other.com",
    });

    expect(findIntegrationsByProject(db, p1)).toHaveLength(1);
    expect(findIntegrationsByProject(db, project2.id)).toHaveLength(1);
    expect(findIntegrationsByProject(db, p1)[0].type).toBe("gsc");
    expect(findIntegrationsByProject(db, project2.id)[0].type).toBe("ga4");

    db.close();
  });

  it("type에 없는 값을 넣으면 CHECK 제약으로 거부된다", () => {
    const db = openSeomedicDb(makeTempProject());
    const { projectId } = makeTestProject(db);

    expect(() =>
      insertIntegration(db, {
        projectId,
        // @ts-expect-error 의도적으로 잘못된 값 주입 — CHECK 제약이 실제로 걸려있는지 실행 검증
        type: "not-a-real-type",
        authMethod: "service_account",
        credentialEnvRef: "X",
        propertyScope: "https://my-site.com",
      }),
    ).toThrow();

    db.close();
  });

  it("auth_method에 'oauth' 등 service_account 외 값을 넣으면 CHECK 제약으로 거부된다(단일화 결정 강제)", () => {
    const db = openSeomedicDb(makeTempProject());
    const { projectId } = makeTestProject(db);

    expect(() =>
      insertIntegration(db, {
        projectId,
        type: "gsc",
        // @ts-expect-error 의도적으로 잘못된 값 주입 — CHECK 제약이 실제로 걸려있는지 실행 검증
        authMethod: "oauth",
        credentialEnvRef: "X",
        propertyScope: "https://my-site.com",
      }),
    ).toThrow();

    db.close();
  });

  it("SQL 파라미터 바인딩 — 악의적 문자열이 그대로 값으로 저장되고 실행되지 않는다", () => {
    const db = openSeomedicDb(makeTempProject());
    const { projectId } = makeTestProject(db);

    const malicious = "https://x.com'; DROP TABLE integration; --";
    const integration = insertIntegration(db, {
      projectId,
      type: "gsc",
      authMethod: "service_account",
      credentialEnvRef: "GSC_SERVICE_ACCOUNT_PATH",
      propertyScope: malicious,
    });

    expect(integration.property_scope).toBe(malicious);
    const stillExists = db.prepare(`SELECT COUNT(*) as cnt FROM integration`).get() as { cnt: number };
    expect(stillExists.cnt).toBe(1); // DROP TABLE이 실행됐다면 이 쿼리 자체가 에러났을 것

    db.close();
  });
});
