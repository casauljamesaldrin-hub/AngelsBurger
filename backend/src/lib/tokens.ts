import crypto from 'crypto';
export const hashToken = (t: string) => crypto.createHash('sha256').update(t).digest('hex');
export function newToken() {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, hash: hashToken(token) };
}
export const safeEqual = (a: string, b: string) => {
  const A = Buffer.from(a), B = Buffer.from(b);
  return A.length === B.length && crypto.timingSafeEqual(A, B);
};
