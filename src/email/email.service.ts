import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const PLUNK_API_URL = 'https://next-api.useplunk.com/v1/send';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly secretKey: string;
  private readonly fromEmail: string;

  constructor(private readonly configService: ConfigService) {
    this.secretKey = this.configService.get<string>('plunk.secretKey')!;
    this.fromEmail = this.configService.get<string>('plunk.fromEmail')!;
  }

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    const subject = 'Reset your password';
    const body = `
      <p>You requested a password reset.</p>
      <p><a href="${resetUrl}">Click here to reset your password</a></p>
      <p>This link expires in 1 hour.</p>
      <p>If you didn't request this, ignore this email.</p>
    `;

    await this.send(to, subject, body);
  }

  private async send(to: string, subject: string, body: string): Promise<void> {
    const response = await fetch(PLUNK_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to, subject, body, from: this.fromEmail }),
    });

    const data = await response.json();

    if (!data.success) {
      this.logger.error(`Failed to send email: ${data.error?.message}`);
      throw new Error('Failed to send email');
    }
  }
}
