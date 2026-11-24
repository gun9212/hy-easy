export type MigrationFile = {
  file: string;
  version: string;
  name: string;
};

export function listMigrations(migrationsDir: string): MigrationFile[];
export function extractRpcCalls(sourceDir: string): string[];
export function extractMigrationFunctions(migrationsDir: string): string[];
export function findMissingProdSchema(input: {
  expectedNames: string[];
  appliedNames: string[];
  expectedRpcs: string[];
  existingRpcs: string[];
}): {
  missingMigrations: string[];
  missingRpcs: string[];
};
