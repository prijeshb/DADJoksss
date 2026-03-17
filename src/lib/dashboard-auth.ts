import { createHmac, timingSafeEqual } from "crypto";

export function computeSessionToken(pin: string): string {
  return createHmac("sha256", pin).update("dadjoksss-dashboard-auth").digest("hex");
}

export function isValidSession(session: string | undefined, pin: string | undefined): boolean {
  if (!session || !pin) return false;
  const expected = computeSessionToken(pin);
  if (session.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(session, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}
