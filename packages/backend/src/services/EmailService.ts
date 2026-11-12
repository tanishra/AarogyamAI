import { logger } from '../lib/logger';
import { config } from '../config';
interface MailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

class EmailService {
  private async sendMail(payload: MailPayload): Promise<void> {
    // Fallback transport for environments where SMTP/nodemailer is unavailable.
    logger.debug('[MOCK EMAIL SEND]', {
      to: payload.to,
      subject: payload.subject,
      preview: payload.text?.slice(0, 120) || '',
    });
  }

  async sendNotificationEmail(email: string, subject: string, text: string): Promise<void> {
    await this.sendMail({
      to: email,
      subject,
      html: `<p>${text}</p>`,
      text,
    });
  }

  async sendPasswordResetEmail(email: string, resetToken: string): Promise<void> {
    const resetUrl = `${config.frontendUrl}/reset-password?token=${resetToken}`;

    await this.sendMail({
      to: email,
      subject: 'Password Reset Request',
      html: `
        <h2>Password Reset Request</h2>
        <p>You requested a password reset. Click the link below to reset your password:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>This link will expire in 24 hours.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `,
      text: `Password Reset Request\n\nYou requested a password reset. Visit this link to reset your password:\n${resetUrl}\n\nThis link will expire in 24 hours.\n\nIf you didn't request this, please ignore this email.`,
    });
  }

  async sendRegistrationApprovalEmail(email: string, name: string, temporaryPassword?: string): Promise<void> {
    const loginUrl = `${config.frontendUrl}/login`;
    const credentialsHtml = temporaryPassword
      ? `<p><strong>Temporary password:</strong> ${temporaryPassword}</p><p>Please change your password after your first login.</p>`
      : '';
    const credentialsText = temporaryPassword
      ? `\n\nTemporary password: ${temporaryPassword}\n\nPlease change your password after your first login.`
      : '';

    await this.sendMail({
      to: email,
      subject: 'Registration Approved - AarogyamAI',
      html: `
        <h2>Registration Approved</h2>
        <p>Hello ${name},</p>
        <p>Your registration has been approved! You can now log in to AarogyamAI.</p>
        ${credentialsHtml}
        <p><a href="${loginUrl}">Login Here</a></p>
      `,
      text: `Registration Approved\n\nHello ${name},\n\nYour registration has been approved! You can now log in to AarogyamAI.${credentialsText}\n\nLogin at: ${loginUrl}`,
    });
  }

  async sendRegistrationRejectionEmail(email: string, name: string, reason: string): Promise<void> {
    await this.sendMail({
      to: email,
      subject: 'Registration Status - AarogyamAI',
      html: `
        <h2>Registration Update</h2>
        <p>Hello ${name},</p>
        <p>Unfortunately, your registration could not be approved at this time.</p>
        <p><strong>Reason:</strong> ${reason}</p>
        <p>If you have questions, please contact support.</p>
      `,
      text: `Registration Update\n\nHello ${name},\n\nUnfortunately, your registration could not be approved at this time.\n\nReason: ${reason}\n\nIf you have questions, please contact support.`,
    });
  }

  async sendMFAChangeNotification(email: string, name: string, action: 'enabled' | 'disabled'): Promise<void> {
    await this.sendMail({
      to: email,
      subject: 'MFA Settings Changed - AarogyamAI',
      html: `
        <h2>MFA Settings Changed</h2>
        <p>Hello ${name},</p>
        <p>Your multi-factor authentication has been ${action}.</p>
        <p>If you didn't make this change, please contact support immediately.</p>
      `,
      text: `MFA Settings Changed\n\nHello ${name},\n\nYour multi-factor authentication has been ${action}.\n\nIf you didn't make this change, please contact support immediately.`,
    });
  }

  async sendMFAEnabledEmail(email: string, name: string): Promise<void> {
    await this.sendMFAChangeNotification(email, name, 'enabled');
  }

  async sendMFADisabledEmail(email: string, name: string): Promise<void> {
    await this.sendMFAChangeNotification(email, name, 'disabled');
  }

  async sendMFAReenrollmentEmail(email: string, name: string): Promise<void> {
    await this.sendMail({
      to: email,
      subject: 'MFA Re-enrollment Required - AarogyamAI',
      html: `
        <h2>MFA Re-enrollment Required</h2>
        <p>Hello ${name},</p>
        <p>Your multi-factor authentication has been reset and requires re-enrollment.</p>
        <p>Please log in and set up MFA again.</p>
        <p>If you didn't request this, please contact support immediately.</p>
      `,
      text: `MFA Re-enrollment Required\n\nHello ${name},\n\nYour multi-factor authentication has been reset and requires re-enrollment.\n\nPlease log in and set up MFA again.\n\nIf you didn't request this, please contact support immediately.`,
    });
  }
}

export const emailService = new EmailService();
export { EmailService };
