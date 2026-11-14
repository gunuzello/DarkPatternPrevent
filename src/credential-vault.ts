import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type TestCredentials = { username: string; password: string };

function key() {
  const value = process.env.BAROMI_CREDENTIAL_KEY;
  if (!value) throw new Error("테스트 계정 암호화 키가 서버에 설정되지 않았습니다.");
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== 32) throw new Error("BAROMI_CREDENTIAL_KEY는 32바이트 base64 값이어야 합니다.");
  return decoded;
}

export function encryptCredentials(credentials: TestCredentials) {
  if (!credentials.username || !credentials.password || credentials.username.length > 320 || credentials.password.length > 512) {
    throw new Error("테스트 계정 정보를 확인해 주세요.");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(credentials), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

export function decryptCredentials(value: string): TestCredentials {
  const packed = Buffer.from(value, "base64url");
  if (packed.length < 29) throw new Error("인증정보 암호문이 올바르지 않습니다.");
  const decipher = createDecipheriv("aes-256-gcm", key(), packed.subarray(0, 12));
  decipher.setAuthTag(packed.subarray(12, 28));
  const parsed = JSON.parse(Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString("utf8")) as TestCredentials;
  if (!parsed.username || !parsed.password) throw new Error("인증정보 형식이 올바르지 않습니다.");
  return parsed;
}
