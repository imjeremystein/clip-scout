import Redis from "ioredis";

const globalForRedis = global as unknown as { redis: Redis | undefined };

let redisInstance: Redis | undefined;

/**
 * Parse Redis URL and return connection options.
 * Works around ioredis compatibility issues with newer Redis versions.
 */
function getRedisOptions() {
  const url = process.env.REDIS_URL || "redis://localhost:6379";
  const parsed = new URL(url);

  return {
    host: parsed.hostname || "localhost",
    port: parseInt(parsed.port || "6379", 10),
    password: parsed.password || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
    retryStrategy: (times: number) => {
      if (times > 3) return null;
      return Math.min(times * 200, 1000);
    },
  };
}

/**
 * Get Redis client instance (lazy initialization).
 * Only connects when actually called, not at module load time.
 * This is important for serverless environments like Vercel.
 */
export function getRedis(): Redis {
  if (globalForRedis.redis) {
    return globalForRedis.redis;
  }

  if (!redisInstance) {
    redisInstance = new Redis(getRedisOptions());

    if (process.env.NODE_ENV !== "production") {
      globalForRedis.redis = redisInstance;
    }
  }

  return redisInstance;
}

/**
 * Check if Redis URL is configured.
 * Use this to conditionally skip Redis operations in serverless.
 */
export function isRedisConfigured(): boolean {
  return !!process.env.REDIS_URL;
}

// For backwards compatibility - but this will still try to connect
// Prefer using getRedis() for lazy initialization
const redis = new Proxy({} as Redis, {
  get(_, prop) {
    return Reflect.get(getRedis(), prop);
  },
});

export default redis;
