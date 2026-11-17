import crypto from 'crypto';
import { config } from '../config';
import { logger } from './logger';

/**
 * AES-256-GCM encryption for TOTP secrets at rest.
 * Stored format: `enc:v1:<iv_b64>:<tag_b64>:<ct_b64>`
 * Legacy plaintext base32 secrets are read as-is (dual-read window);
 * all new writes are encrypted.
 */

const PREFIX = 'enc:v1:';

function getKey(): Buffer {
  const raw = config.mfaEncryptionKey;
  // Accept 64-char hex or any string (hashed to 32 bytes)
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptMfaSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

export function decryptMfaSecret(stored: string): string {
  if (!stored.startsWith(PREFIX)) {
    // Legacy plaintext — returned as-is; caller should re-encrypt on next write
    return stored;
  }
  try {
    const [ivB64, tagB64, ctB64] = stored.slice(PREFIX.length).split(':');
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      getKey(),
      Buffer.from(ivB64, 'base64')
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch (error) {
    logger.error('[MFA] Failed to decrypt mfa_secret — possible key rotation or corruption', { error });
    throw new Error('MFA secret decryption failed');
  }
}
