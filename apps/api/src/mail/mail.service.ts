import { Inject, Injectable, Logger } from '@nestjs/common';
import { CONFIG, type AppConfig } from '../config';

@Injectable()
export class MailService {
  private readonly log = new Logger('Mail');
  constructor(@Inject(CONFIG) private readonly cfg: AppConfig) {}

  async send(to: string, subject: string, text: string, html?: string): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.cfg.resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.cfg.mailFrom, to, subject, text, html }),
    });
    if (!res.ok) {
      this.log.error(`Resend ${res.status}: ${await res.text()}`);
      throw new Error('Failed to send email');
    }
  }
}
