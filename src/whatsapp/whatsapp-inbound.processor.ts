import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { WHATSAPP_INBOUND_QUEUE } from '../queue/queue.module.js';
import { ConversationTurn, formatDhakaTime, SupportAgentService } from '../ai/support-agent.service.js';
import { WhatsappClientService } from './whatsapp-client.service.js';
import { WhatsappConversationService } from './whatsapp-conversation.service.js';
import { InboundWhatsappJob } from './dto/whatsapp-webhook.dto.js';
import { MessageSender } from '../generated/prisma/enums.js';
import { MongoMeetingService } from '../meeting/mongo-meeting.service.js';

const SENDER_TO_ROLE: Record<MessageSender, ConversationTurn['role']> = {
  [MessageSender.CLIENT]: 'client',
  [MessageSender.BOT]: 'bot',
  [MessageSender.AGENT]: 'agent',
};

@Processor(WHATSAPP_INBOUND_QUEUE)
export class WhatsappInboundProcessor extends WorkerHost {
  private readonly logger = new Logger(WhatsappInboundProcessor.name);
  private readonly supportNumber?: string;

  constructor(
    private readonly supportAgent: SupportAgentService,
    private readonly whatsappClient: WhatsappClientService,
    private readonly conversations: WhatsappConversationService,
    private readonly meetings: MongoMeetingService,
    config: ConfigService,
  ) {
    super();
    this.supportNumber = config.get<string>('WHATSAPP_SUPPORT_NUMBER') || undefined;
  }

  async process(job: Job<InboundWhatsappJob>): Promise<void> {
    const { phoneNumber, text, whatsappMessageId } = job.data;

    const conversation = await this.conversations.getOrCreateConversation(phoneNumber);
    const priorMessages = await this.conversations.getRecentMessages(conversation.id);
    const isFirstMessage = priorMessages.length === 0;
    const history: ConversationTurn[] = priorMessages.map((m) => ({
      role: SENDER_TO_ROLE[m.sender],
      content: m.content,
    }));

    await this.conversations.recordMessage(conversation.id, MessageSender.CLIENT, text, whatsappMessageId);

    const pendingMeeting = await this.meetings.findPendingMeeting(phoneNumber);
    const { reply, needsLiveAgent, handoffSummary, meetingAction, requestedStart } = await this.supportAgent.handleMessage(
      text,
      history,
      isFirstMessage,
      pendingMeeting ? { scheduledAt: pendingMeeting.scheduledAt, meetLink: pendingMeeting.googleMeetLink ?? '' } : undefined,
    );

    let finalReply = reply;
    if (meetingAction === 'propose') {
      try {
        const created = await this.meetings.proposeMeeting(
          phoneNumber,
          `Web Briks — Discovery call with ${phoneNumber}`,
          `Auto-scheduled by Webi from a WhatsApp conversation with ${phoneNumber}.\n\nLast message: "${text}"`,
          requestedStart,
        );
        finalReply = `${reply}\n\n📅 *Proposed time:* ${formatDhakaTime(created.scheduledAt)} (Dhaka time)\n🔗 *Meet link:* ${created.meetLink}\n\nDoes this work for you? Let us know if you'd like a different time.`;
      } catch (err: any) {
        this.logger.error(`Failed to propose a meeting for ${phoneNumber}: ${err.message}`);
      }
    } else if (meetingAction === 'reschedule') {
      try {
        const moved = await this.meetings.rescheduleMeeting(phoneNumber, requestedStart);
        finalReply = moved
          ? `${reply}\n\n📅 *Updated time:* ${formatDhakaTime(moved.scheduledAt)} (Dhaka time)\n🔗 *Meet link:* ${moved.meetLink || pendingMeeting?.googleMeetLink}\n\nDoes this work for you?`
          : `${reply}\n\n(Sorry, I couldn't find the original meeting to update — a teammate will help sort out the time.)`;
      } catch (err: any) {
        this.logger.error(`Failed to reschedule the meeting for ${phoneNumber}: ${err.message}`);
      }
    }

    await this.whatsappClient.sendText(phoneNumber, finalReply);
    await this.conversations.recordMessage(conversation.id, MessageSender.BOT, finalReply);

    if (needsLiveAgent) {
      await this.conversations.escalate(conversation.id);
      await this.notifySupport(phoneNumber, handoffSummary);
    }
  }

  private async notifySupport(clientNumber: string, summary?: string): Promise<void> {
    if (!this.supportNumber) {
      this.logger.warn('WHATSAPP_SUPPORT_NUMBER not set — cannot notify a live agent');
      return;
    }
    const body = summary || 'A client needs a live reply, but the summary could not be generated.';
    await this.whatsappClient.sendText(this.supportNumber, `*Client number:* ${clientNumber}\n\n${body}`);
  }
}
