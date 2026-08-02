const buckets = new Map<string, { count: number; resetAt: number }>();
let lastCleanup = 0;

export function rateLimit(request: Request, scope: string, limit = 30, windowMs = 60_000) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const client = forwarded || request.headers.get('x-real-ip') || 'unknown';
  const key = `${scope}:${client}`;
  const now = Date.now();
  if (now - lastCleanup > windowMs || buckets.size > 5_000) {
    for (const [storedKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(storedKey);
    }
    lastCleanup = now;
  }
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  current.count += 1;
  if (current.count <= limit) return null;
  return Math.max(1, Math.ceil((current.resetAt - now) / 1000));
}
