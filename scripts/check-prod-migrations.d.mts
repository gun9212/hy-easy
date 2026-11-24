export type MigrationFile = {
  file: string;
  version: string;
};

export function listMigrations(migrationsDir: string): MigrationFile[];
export function extractRpcCalls(sourceDir: string): string[];
export function extractMigrationFunctions(migrationsDir: string): string[];
export function findMissingProdSchema(input: {
  expectedVersions: string[];
  appliedVersions: string[];
  expectedRpcs: string[];
  existingRpcs: string[];
}): {
  missingVersions: string[];
  missingRpcs: string[];
};
