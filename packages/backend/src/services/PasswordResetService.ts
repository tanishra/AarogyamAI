import crypto from 'crypto';
import { emailService } from './EmailService';

interface PasswordResetToken {
  token: string;
  userId: string;
  expiresAt: Date;
}

class PasswordResetService {
  private tokens: Map<string, PasswordResetToken> = new Map();

  generateResetToken(userId: string): string {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    this.tokens.set(token, { token, userId, expiresAt });

    // Clean up expired tokens
    this.cleanupExpiredTokens();

    return token;
  }

  validateToken(token: string): { valid: boolean; userId?: string } {
    const resetToken = this.tokens.get(token);

    if (!resetToken) {
      return { valid: false };
    }

    if (new Date() > resetToken.expiresAt) {
      this.tokens.delete(token);
      return { valid: false };
    }

    return { valid: true, userId: resetToken.userId };
  }

  consumeToken(token: string): boolean {
    const validation = this.validateToken(token);
    if (validation.valid) {
      this.tokens.delete(token);
      return true;
    }
    return false;
  }

  private cleanupExpiredTokens(): void {
    const now = new Date();
    for (const [token, data] of this.tokens.entries()) {
      if (now > data.expiresAt) {
        this.tokens.delete(token);
      }
    }
  }

  async initiatePasswordReset(email: string, userId: string): Promise<string> {
    const token = this.generateResetToken(userId);
    await emailService.sendPasswordResetEmail(email, token);
    return token;
  }
}

export const passwordResetService = new PasswordResetService();
