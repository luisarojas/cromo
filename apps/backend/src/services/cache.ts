import type { Redis } from 'ioredis';

async function scanAndDelete(redis: Redis, pattern: string): Promise<void> {
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = next;
    if (keys.length > 0) await redis.del(...keys);
  } while (cursor !== '0');
}

export async function invalidateUserCaches(redis: Redis, userId: string): Promise<void> {
  const patterns = [
    `user:${userId}:collection:*`,
    `user:${userId}:missing:*`,
    `user:${userId}:summary:*`,
    `user:${userId}:duplicates:*`,
    `user:${userId}:album_summaries*`,
  ];
  await Promise.all(patterns.map((p) => scanAndDelete(redis, p)));
}
