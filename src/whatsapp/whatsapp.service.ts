import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { WHATSAPP_INBOUND_QUEUE } from '../queue/queue.module.js';
import { InboundWhatsappJob, WhatsappWebhookPayload } from './dto/whatsapp-webhook.dto.js';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(@InjectQueue(WHATSAPP_INBOUND_QUEUE) private readonly queue: Queue<InboundWhatsappJob>) {}

  // Returns fast so Meta's webhook doesn't retry/timeout; the actual AI reply
  // (embedding lookup + OpenAI call + WhatsApp send) happens in the queue worker.
  async handleIncoming(payload: WhatsappWebhookPayload): Promise<void> {
    const messages = payload.entry?.flatMap((entry) => entry.changes ?? []).flatMap((change) => change.value?.messages ?? []) ?? [];

    for (const message of messages) {
      if (message.type !== 'text' || !message.text) {
        this.logger.log(`Skipping unsupported message type: ${message.type}`);
        continue;
      }

      await this.queue.add('inbound-message', {
        phoneNumber: message.from,
        text: message.text.body,
        whatsappMessageId: message.id,
      });
    }
  }
}
