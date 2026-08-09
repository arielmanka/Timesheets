import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------
interface EmailService {
  sendVerificationEmail(to: string, token: string): Promise<void>;
  sendPasswordResetEmail(to: string, token: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Console provider — logs tokens to stdout (default for v1)
// ---------------------------------------------------------------------------
class ConsoleEmailService implements EmailService {
  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const url = `https://localhost/verify-email/${token}`;
    logger.info(
      {
        emailProvider: 'console',
        type: 'verification',
        to,
        token,
        url,
      },
      `📧 [EMAIL MOCK] Verification email for ${to} — Token: ${token} — URL: ${url}`
    );
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const url = `https://localhost/reset-password/${token}`;
    logger.info(
      {
        emailProvider: 'console',
        type: 'password_reset',
        to,
        token,
        url,
      },
      `📧 [EMAIL MOCK] Password reset email for ${to} — Token: ${token} — URL: ${url}`
    );
  }
}

// ---------------------------------------------------------------------------
// SMTP provider — uses Nodemailer (switch via EMAIL_PROVIDER=smtp)
// ---------------------------------------------------------------------------
class SmtpEmailService implements EmailService {
  private transporter: unknown = null;

  private async getTransporter() {
    if (!this.transporter) {
      // Dynamic import to avoid loading nodemailer when not needed
      const nodemailer = await import('nodemailer');
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT ?? 587,
        secure: (env.SMTP_PORT ?? 587) === 465,
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        },
      });
    }
    return this.transporter as { sendMail: (options: Record<string, unknown>) => Promise<void> };
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const url = `https://localhost/verify-email/${token}`;
    const transporter = await this.getTransporter();

    await transporter.sendMail({
      from: env.SMTP_FROM,
      to,
      subject: 'Verify your email — Timesheets',
      text: `Click this link to verify your email address:\n\n${url}\n\nThis link expires in 24 hours.`,
      html: `
        <h2>Verify your email</h2>
        <p>Click the link below to verify your email address:</p>
        <p><a href="${url}">${url}</a></p>
        <p><em>This link expires in 24 hours.</em></p>
      `,
    });

    logger.info({ type: 'verification', to }, `Verification email sent to ${to}`);
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const url = `https://localhost/reset-password/${token}`;
    const transporter = await this.getTransporter();

    await transporter.sendMail({
      from: env.SMTP_FROM,
      to,
      subject: 'Password reset — Timesheets',
      text: `Click this link to reset your password:\n\n${url}\n\nThis link expires in 1 hour. If you did not request this, ignore this email.`,
      html: `
        <h2>Reset your password</h2>
        <p>Click the link below to reset your password:</p>
        <p><a href="${url}">${url}</a></p>
        <p><em>This link expires in 1 hour. If you did not request this, ignore this email.</em></p>
      `,
    });

    logger.info({ type: 'password_reset', to }, `Password reset email sent to ${to}`);
  }
}

// ---------------------------------------------------------------------------
// Factory — select provider based on EMAIL_PROVIDER env var
// ---------------------------------------------------------------------------
function createEmailService(): EmailService {
  switch (env.EMAIL_PROVIDER) {
    case 'smtp':
      logger.info('Email provider: SMTP');
      return new SmtpEmailService();
    case 'console':
    default:
      logger.info('Email provider: console (mock — tokens logged to stdout)');
      return new ConsoleEmailService();
  }
}

export const emailService = createEmailService();
