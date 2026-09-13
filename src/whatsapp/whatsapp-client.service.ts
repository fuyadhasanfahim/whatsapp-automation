import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WhatsappClientService {
  private readonly logger = new Logger(WhatsappClientService.name);
  private readonly accessToken: string;
  private readonly phoneNumberId: string;

  constructor(private readonly config: ConfigService) {
    this.accessToken = config.get<string>('WHATSAPP_ACCESS_TOKEN', '');
    this.phoneNumberId = config.get<string>('WHATSAPP_PHONE_NUMBER_ID', '');
  }

  async sendText(to: string, body: string): Promise<void> {
    if (!this.accessToken || !this.phoneNumberId) {
      this.logger.warn(`WhatsApp credentials not set — skipped sending to ${to}: ${body}`);
      return;
    }

    const url = `https://graph.facebook.com/v21.0/${this.phoneNumberId}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(`WhatsApp send failed (${response.status}): ${errorBody}`);
    }
  }
}
