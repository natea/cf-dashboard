// dashboard/server/storage/index.ts
// Storage factory - creates appropriate storage backend based on config

import type { ClaimsStorage } from "./interface";
import type { Config } from "../config";
import { MemoryStorage } from "./memory";
import { PostgresStorage } from "./postgres";
import { SqliteStorage } from "./sqlite";

export type { ClaimsStorage, ClaimFilter, ClaimEvent, Unsubscribe } from "./interface";
export { MemoryStorage } from "./memory";
export { PostgresStorage } from "./postgres";
export { SqliteStorage } from "./sqlite";

/**
 * Create storage backend based on configuration
 */
export async function createStorage(config: Config): Promise<ClaimsStorage> {
  const dbConfig = config.database;

  switch (dbConfig.type) {
    case "postgres": {
      if (!dbConfig.postgres) {
        throw new Error("PostgreSQL config required when type is 'postgres'");
      }
      const storage = new PostgresStorage(dbConfig.postgres);
      await storage.initialize();
      console.log(`[storage] Connected to PostgreSQL at ${dbConfig.postgres.host}:${dbConfig.postgres.port}`);
      return storage;
    }

    case "sqlite": {
      if (!dbConfig.sqlite) {
        throw new Error("SQLite config required when type is 'sqlite'");
      }
      const storage = new SqliteStorage(dbConfig.sqlite);
      await storage.initialize();
      console.log(`[storage] Using SQLite at ${dbConfig.sqlite.path}`);
      return storage;
    }

    case "memory":
    default: {
      const storage = new MemoryStorage();
      console.log("[storage] Using in-memory storage (data will not persist)");
      return storage;
    }
  }
}

/**
 * Close storage connection if applicable
 */
export async function closeStorage(storage: ClaimsStorage): Promise<void> {
  if (storage instanceof PostgresStorage) {
    await storage.close();
  } else if (storage instanceof SqliteStorage) {
    storage.close();
  }
  // MemoryStorage doesn't need cleanup
}
