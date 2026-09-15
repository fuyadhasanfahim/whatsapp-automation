import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { WHATSAPP_INBOUND_QUEUE } from '../queue/queue.module.js';
import { AutomationMongoService } from '../automation/automation-mongo.service.js';
import { normalizePhone, toInternationalBD } from '../common/phone.util.js';
import { InboundWhatsappJob, WhatsappWebhookPayload } from './dto/whatsapp-webhook.dto.js';
import { WhatsappClientService } from './whatsapp-client.service.js';

const SAVE_TO_MEMORY_TAG = /#savetomemory/i;

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly adminNumbers: Set<string>;

  constructor(
    @InjectQueue(WHATSAPP_INBOUND_QUEUE) private readonly queue: Queue<InboundWhatsappJob>,
    private readonly automation: AutomationMongoService,
    private readonly whatsappClient: WhatsappClientService,
    config: ConfigService,
  ) {
    const raw = config.get<string>('ADMIN_WHATSAPP_NUMBER') ?? '';
    this.adminNumbers = new Set(
      raw
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean)
        .map(toInternationalBD),
    );
  }

  // Returns fast so Meta's webhook doesn't retry/timeout; the actual AI reply
  // (embedding lookup + OpenAI call + WhatsApp send) happens in the queue worker.
  async handleIncoming(payload: WhatsappWebhookPayload): Promise<void> {
    const values = payload.entry?.flatMap((entry) => entry.changes ?? []).map((change) => change.value) ?? [];

    for (const value of values) {
      const messages = value?.messages ?? [];
      const contactNames = new Map((value?.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]));

      for (const message of messages) {
        if (message.type !== 'text' || !message.text) {
          this.logger.log(`Skipping unsupported message type: ${message.type}`);
          continue;
        }

        const phoneNumber = message.from;
        const text = message.text.body;

        // #savetomemory from the admin number is an internal note command, not a customer
        // message — it never reaches the AI queue, it's just stored and acknowledged.
        if (this.adminNumbers.has(normalizePhone(phoneNumber)) && SAVE_TO_MEMORY_TAG.test(text)) {
          await this.saveAdminMemory(phoneNumber, text);
          continue;
        }

        try {
          await this.automation.saveContactIfNew(phoneNumber, contactNames.get(phoneNumber));
        } catch (err: any) {
          this.logger.error(`Failed to record automation contact for ${phoneNumber}: ${err.message}`);
        }

        await this.queue.add('inbound-message', {
          phoneNumber,
          text,
          whatsappMessageId: message.id,
        });
      }
    }
  }

  private async saveAdminMemory(phoneNumber: string, text: string): Promise<void> {
    const note = text.replace(SAVE_TO_MEMORY_TAG, '').trim();
    try {
      await this.automation.saveMemory(phoneNumber, note);
      await this.whatsappClient.sendText(phoneNumber, '✅ Saved to memory.');
    } catch (err: any) {
      this.logger.error(`Failed to save admin memory for ${phoneNumber}: ${err.message}`);
    }
  }
}
