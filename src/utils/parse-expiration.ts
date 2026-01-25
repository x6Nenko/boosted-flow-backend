/**
 * Parse JWT expiration time string to milliseconds
 * @param expiration Time string (e.g., '15m', '1h', '7d', '30d')
 * @returns Duration in milliseconds
 */
export function parseExpiration(expiration: string): number {
  const unit = expiration.slice(-1);
  const value = parseInt(expiration.slice(0, -1), 10);

  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return value * (multipliers[unit] || 0);
}
