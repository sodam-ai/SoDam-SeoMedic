import type { SeomedicDb } from "../connection.js";
import type { IntegrationRecord, InsertIntegrationInput } from "../../integrations/types.js";
export declare function insertIntegration(db: SeomedicDb, input: InsertIntegrationInput): IntegrationRecord;
export declare function findIntegrationById(db: SeomedicDb, id: number): IntegrationRecord | undefined;
export declare function findIntegrationsByProject(db: SeomedicDb, projectId: number): IntegrationRecord[];
