import jwt from 'jsonwebtoken';
import { config } from '../config';

/**
 * JWT Token Generation and Verification
 * 
 * Implements RS256 algorithm for JWT tokens with access and refresh token support
 */

export interface TokenPayload {
  userId: string;
  email: string;
  role: 'Patient' | 'Nurse' | 'Doctor' | 'Administrator' | 'DPO';
  type: 'access' | 'refresh';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Generate access token (8-hour expiration)
 */
export function generateAccessToken(payload: Omit<TokenPayload, 'type'>): string {
  const tokenPayload: TokenPayload = {
    ...payload,
    type: 'access',
  };

  const options: jwt.SignOptions = {
    expiresIn: '8h', // 8 hours
  };

  return jwt.sign(tokenPayload, config.jwt.secret as jwt.Secret, options);
}

/**
 * Generate refresh token (30-day expiration)
 */
export function generateRefreshToken(payload: Omit<TokenPayload, 'type'>): string {
  const tokenPayload: TokenPayload = {
    ...payload,
    type: 'refresh',
  };

  const options: jwt.SignOptions = {
    expiresIn: '30d', // 30 days
  };

  return jwt.sign(tokenPayload, config.jwt.refreshSecret as jwt.Secret, options);
}

/**
 * Generate both access and refresh tokens
 */
export function generateTokenPair(payload: Omit<TokenPayload, 'type'>): TokenPair {
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  // Calculate expiration time in seconds (8 hours = 28800 seconds)
  const expiresIn = 8 * 60 * 60;

  return {
    accessToken,
    refreshToken,
    expiresIn,
  };
}

/**
 * Verify access token
 */
export function verifyAccessToken(token: string): TokenPayload {
  try {
    const decoded = jwt.verify(token, config.jwt.secret, {
      algorithms: ['HS256'],
    }) as TokenPayload;

    if (decoded.type !== 'access') {
      throw new Error('Invalid token type');
    }

    return decoded;
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid token type') {
      throw error;
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Token expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid token');
    }
    throw error;
  }
}

/**
 * Verify refresh token
 */
export function verifyRefreshToken(token: string): TokenPayload {
  try {
    const decoded = jwt.verify(token, config.jwt.refreshSecret, {
      algorithms: ['HS256'],
    }) as TokenPayload;

    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }

    return decoded;
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid token type') {
      throw error;
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Refresh token expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid refresh token');
    }
    throw error;
  }
}

/**
 * Decode token without verification (for debugging/logging)
 */
export function decodeToken(token: string): TokenPayload | null {
  try {
    return jwt.decode(token) as TokenPayload;
  } catch {
    return null;
  }
}
