import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { WHATSAPP_INBOUND_QUEUE } from '../queue/queue.module.js';
import { SupportAgentService } from '../ai/support-agent.service.js';
import { WhatsappClientService } from './whatsapp-client.service.js';
import { WhatsappConversationService } from './whatsapp-conversation.service.js';
import { InboundWhatsappJob } from './dto/whatsapp-webhook.dto.js';
import { MessageSender } from '../generated/prisma/enums.js';

@Processor(WHATSAPP_INBOUND_QUEUE)
export class WhatsappInboundProcessor extends WorkerHost {
  private readonly logger = new Logger(WhatsappInboundProcessor.name);
  private readonly supportNumber?: string;

  constructor(
    private readonly supportAgent: SupportAgentService,
    private readonly whatsappClient: WhatsappClientService,
    private readonly conversations: WhatsappConversationService,
    config: ConfigService,
  ) {
    super();
    this.supportNumber = config.get<string>('WHATSAPP_SUPPORT_NUMBER') || undefined;
  }

  async process(job: Job<InboundWhatsappJob>): Promise<void> {
    const { phoneNumber, text, whatsappMessageId } = job.data;

    const conversation = await this.conversations.getOrCreateConversation(phoneNumber);
    const isFirstMessage = !(await this.conversations.hasPriorMessages(conversation.id));
    await this.conversations.recordMessage(conversation.id, MessageSender.CLIENT, text, whatsappMessageId);

    const { reply, needsLiveAgent } = await this.supportAgent.handleMessage(text, isFirstMessage);

    await this.whatsappClient.sendText(phoneNumber, reply);
    await this.conversations.recordMessage(conversation.id, MessageSender.BOT, reply);

    if (needsLiveAgent) {
      await this.conversations.escalate(conversation.id);
      await this.notifySupport(phoneNumber, text);
    }
  }

  private async notifySupport(clientNumber: string, lastMessage: string): Promise<void> {
    if (!this.supportNumber) {
      this.logger.warn('WHATSAPP_SUPPORT_NUMBER not set — cannot notify a live agent');
      return;
    }
    const ping = `A client (${clientNumber}) needs a live reply.\nLast message: "${lastMessage}"`;
    await this.whatsappClient.sendText(this.supportNumber, ping);
  }
}
