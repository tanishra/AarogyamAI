import { describe, it, expect } from 'vitest';
import { encryptMfaSecret, decryptMfaSecret } from './mfaCrypto';

describe('mfaCrypto', () => {
  it('round-trips a base32 secret', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const stored = encryptMfaSecret(secret);
    expect(stored).toMatch(/^enc:v1:/);
    expect(stored).not.toContain(secret);
    expect(decryptMfaSecret(stored)).toBe(secret);
  });

  it('produces different ciphertext each call (random IV)', () => {
    const a = encryptMfaSecret('JBSWY3DPEHPK3PXP');
    const b = encryptMfaSecret('JBSWY3DPEHPK3PXP');
    expect(a).not.toBe(b);
    expect(decryptMfaSecret(a)).toBe(decryptMfaSecret(b));
  });

  it('passes through legacy plaintext (dual-read window)', () => {
    const legacy = 'JBSWY3DPEHPK3PXP';
    expect(decryptMfaSecret(legacy)).toBe(legacy);
  });

  it('rejects tampered ciphertext', () => {
    const stored = encryptMfaSecret('JBSWY3DPEHPK3PXP');
    const tampered = stored.slice(0, -4) + 'AAAA';
    expect(() => decryptMfaSecret(tampered)).toThrow('MFA secret decryption failed');
  });
});
