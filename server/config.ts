// dashboard/server/config.ts
// Environment configuration with sensible defaults

export interface ServerConfig {
  port: number;
  host: string;
  env: "development" | "production" | "test";
  logLevel: "debug" | "info" | "warn" | "error";
}

export interface DatabaseConfig {
  type: "postgres" | "sqlite" | "memory";
  postgres?: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl: boolean;
    maxConnections: number;
  };
  sqlite?: {
    path: string;
  };
}

export interface AuthConfig {
  enabled: boolean;
  sharedSecret?: string;
  headerName: string;
}

export interface Config {
  server: ServerConfig;
  database: DatabaseConfig;
  auth: AuthConfig;
}

function getEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

function getEnvBool(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === "true" || value === "1";
}

function getEnvInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

export function loadConfig(): Config {
  const env = getEnv("NODE_ENV", "development") as Config["server"]["env"];

  // Determine database type from environment
  let dbType: DatabaseConfig["type"] = "memory";
  if (process.env.DATABASE_URL || process.env.POSTGRES_HOST) {
    dbType = "postgres";
  } else if (process.env.SQLITE_PATH) {
    dbType = "sqlite";
  }

  return {
    server: {
      port: getEnvInt("PORT", 3000),
      host: getEnv("HOST", "0.0.0.0"),
      env,
      logLevel: getEnv("LOG_LEVEL", env === "development" ? "debug" : "info") as ServerConfig["logLevel"],
    },
    database: {
      type: dbType,
      postgres: dbType === "postgres" ? {
        host: getEnv("POSTGRES_HOST", "localhost"),
        port: getEnvInt("POSTGRES_PORT", 5432),
        database: getEnv("POSTGRES_DB", "claims"),
        user: getEnv("POSTGRES_USER", "postgres"),
        password: getEnv("POSTGRES_PASSWORD", ""),
        ssl: getEnvBool("POSTGRES_SSL", false),
        maxConnections: getEnvInt("POSTGRES_MAX_CONNECTIONS", 10),
      } : undefined,
      sqlite: dbType === "sqlite" ? {
        path: getEnv("SQLITE_PATH", "./data/claims.db"),
      } : undefined,
    },
    auth: {
      enabled: process.env.AUTH_DISABLED !== undefined
        ? !getEnvBool("AUTH_DISABLED", false)
        : env === "production",
      sharedSecret: process.env.TEAM_SECRET,
      headerName: getEnv("AUTH_HEADER", "X-Auth-Token"),
    },
  };
}

// Singleton config instance
let configInstance: Config | null = null;

export function getConfig(): Config {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

// Reset config (useful for testing)
export function resetConfig(): void {
  configInstance = null;
}
