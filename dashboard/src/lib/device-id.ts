import crypto from "crypto";

const MIN = BigInt(1000000000);
const RANGE = BigInt(9000000000);

export function generateDeviceId(): string {
  const bytes = crypto.randomBytes(8);
  const n = bytes.readBigUInt64BE(0) % RANGE + MIN;
  return n.toString();
}