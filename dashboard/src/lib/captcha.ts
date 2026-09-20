import crypto from "crypto";
import { config } from "./config";

type Store = Map<string, number>;
const g = globalThis as unknown as {
  __cheyaCaptchaNonces?: Store;
  __cheyaCaptchaVerified?: Store;
};

const nonces: Store = g.__cheyaCaptchaNonces ?? (g.__cheyaCaptchaNonces = new Map());
const verified: Store = g.__cheyaCaptchaVerified ?? (g.__cheyaCaptchaVerified = new Map());

const now = () => Date.now() / 1000;

function prune(store: Store) {
  const t = now();
  for (const [k, exp] of store) if (exp < t) store.delete(k);
}

export function issueNonce(): string {
  prune(nonces);
  prune(verified);
  const nonce = crypto.randomBytes(24).toString("base64url");
  nonces.set(nonce, now() + config.captchaTtlSec);
  return nonce;
}

export function claimNonce(
  nonce: string,
  signals: { moves: number; keys: number; touches: number; elapsed: number },
): { ok: boolean; error?: string } {
  const t = now();
  const exp = nonces.get(nonce);
  if (!exp) return { ok: false, error: "invalid_nonce" };
  if (exp < t) {
    nonces.delete(nonce);
    return { ok: false, error: "expired" };
  }
  const total = signals.moves + signals.keys + signals.touches;
  if (signals.elapsed < 0.6 || total < 3) {
    return { ok: false, error: "bot_suspected" };
  }
  nonces.delete(nonce);
  verified.set(nonce, t + config.captchaTtlSec);
  return { ok: true };
}

export function consumeVerified(nonce: string): boolean {
  const t = now();
  const exp = verified.get(nonce);
  if (!exp || exp < t) {
    verified.delete(nonce);
    return false;
  }
  verified.delete(nonce);
  return true;
}