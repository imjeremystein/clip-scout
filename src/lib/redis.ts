import Redis from "ioredis";

const globalForRedis = global as unknown as { redis: Redis | undefined };

let redisInstance: Redis | undefined;

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
    redisInstance = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true, // Don't connect until first command
    });

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
