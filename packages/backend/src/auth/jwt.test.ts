import { describe, it, expect, beforeAll } from 'vitest';
import {
  generateAccessToken,
  generateRefreshToken,
  generateTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
  decodeToken,
  TokenPayload,
} from './jwt';

describe('JWT Token Generation and Verification', () => {
  const testPayload: Omit<TokenPayload, 'type'> = {
    userId: 'test-user-123',
    email: 'admin@example.com',
    role: 'Administrator',
  };

  describe('generateAccessToken', () => {
    it('should generate a valid access token', () => {
      const token = generateAccessToken(testPayload);
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should include correct payload in token', () => {
      const token = generateAccessToken(testPayload);
      const decoded = decodeToken(token);
      
      expect(decoded).toBeTruthy();
      expect(decoded?.userId).toBe(testPayload.userId);
      expect(decoded?.email).toBe(testPayload.email);
      expect(decoded?.role).toBe(testPayload.role);
      expect(decoded?.type).toBe('access');
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate a valid refresh token', () => {
      const token = generateRefreshToken(testPayload);
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should include correct payload in token', () => {
      const token = generateRefreshToken(testPayload);
      const decoded = decodeToken(token);
      
      expect(decoded).toBeTruthy();
      expect(decoded?.userId).toBe(testPayload.userId);
      expect(decoded?.email).toBe(testPayload.email);
      expect(decoded?.role).toBe(testPayload.role);
      expect(decoded?.type).toBe('refresh');
    });
  });

  describe('generateTokenPair', () => {
    it('should generate both access and refresh tokens', () => {
      const pair = generateTokenPair(testPayload);
      
      expect(pair.accessToken).toBeTruthy();
      expect(pair.refreshToken).toBeTruthy();
      expect(pair.expiresIn).toBe(8 * 60 * 60); // 8 hours in seconds
    });

    it('should generate different tokens for access and refresh', () => {
      const pair = generateTokenPair(testPayload);
      expect(pair.accessToken).not.toBe(pair.refreshToken);
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify a valid access token', () => {
      const token = generateAccessToken(testPayload);
      const verified = verifyAccessToken(token);
      
      expect(verified.userId).toBe(testPayload.userId);
      expect(verified.email).toBe(testPayload.email);
      expect(verified.role).toBe(testPayload.role);
      expect(verified.type).toBe('access');
    });

    it('should reject an invalid token', () => {
      expect(() => verifyAccessToken('invalid.token.here')).toThrow('Invalid token');
    });

    it('should reject a refresh token as access token', () => {
      const refreshToken = generateRefreshToken(testPayload);
      // Refresh tokens are signed with different secret, so they fail verification
      expect(() => verifyAccessToken(refreshToken)).toThrow('Invalid token');
    });

    it('should reject an empty token', () => {
      expect(() => verifyAccessToken('')).toThrow('Invalid token');
    });
  });

  describe('verifyRefreshToken', () => {
    it('should verify a valid refresh token', () => {
      const token = generateRefreshToken(testPayload);
      const verified = verifyRefreshToken(token);
      
      expect(verified.userId).toBe(testPayload.userId);
      expect(verified.email).toBe(testPayload.email);
      expect(verified.role).toBe(testPayload.role);
      expect(verified.type).toBe('refresh');
    });

    it('should reject an invalid token', () => {
      expect(() => verifyRefreshToken('invalid.token.here')).toThrow('Invalid refresh token');
    });

    it('should reject an access token as refresh token', () => {
      const accessToken = generateAccessToken(testPayload);
      // Access tokens are signed with different secret, so they fail verification
      expect(() => verifyRefreshToken(accessToken)).toThrow('Invalid refresh token');
    });
  });

  describe('decodeToken', () => {
    it('should decode a token without verification', () => {
      const token = generateAccessToken(testPayload);
      const decoded = decodeToken(token);
      
      expect(decoded).toBeTruthy();
      expect(decoded?.userId).toBe(testPayload.userId);
    });

    it('should return null for invalid token', () => {
      const decoded = decodeToken('invalid.token');
      expect(decoded).toBeNull();
    });
  });

  describe('Token expiration', () => {
    it('should include expiration claim in access token', () => {
      const token = generateAccessToken(testPayload);
      const decoded = decodeToken(token) as any;
      
      expect(decoded.exp).toBeTruthy();
      expect(typeof decoded.exp).toBe('number');
    });

    it('should include expiration claim in refresh token', () => {
      const token = generateRefreshToken(testPayload);
      const decoded = decodeToken(token) as any;
      
      expect(decoded.exp).toBeTruthy();
      expect(typeof decoded.exp).toBe('number');
    });
  });

  describe('Different user roles', () => {
    const roles: Array<'Patient' | 'Nurse' | 'Doctor' | 'Administrator' | 'DPO'> = [
      'Patient',
      'Nurse',
      'Doctor',
      'Administrator',
      'DPO',
    ];

    roles.forEach(role => {
      it(`should generate and verify token for ${role} role`, () => {
        const payload = { ...testPayload, role };
        const token = generateAccessToken(payload);
        const verified = verifyAccessToken(token);
        
        expect(verified.role).toBe(role);
      });
    });
  });
});
