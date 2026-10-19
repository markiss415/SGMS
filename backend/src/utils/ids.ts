import crypto from 'node:crypto';

/** Prefixed random IDs, e.g. "usr-3f1c…". Matches the existing string-ID style of the app. */
export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** Cryptographically random 6-digit code. */
export function randomCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid misreading

/** Unique, human-friendly payment code shown to the resident, e.g. "BB-PAY-7KQ2-M9XD". */
export function newPaymentCode(): string {
  const pick = (n: number) => Array.from({ length: n }, () => CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)]).join('');
  return `BB-PAY-${pick(4)}-${pick(4)}`;
}

/** Text encoded in a household's QR card. The token is random, so the QR cannot be guessed or forged. */
export const HOUSEHOLD_QR_PREFIX = 'BBSGMS:HH:';
export function householdQrPayload(token: string): string {
  return `${HOUSEHOLD_QR_PREFIX}${token}`;
}
