import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ConversationStatus, MessageSender } from '../generated/prisma/enums.js';

@Injectable()
export class WhatsappConversationService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateConversation(phoneNumber: string) {
    return this.prisma.whatsappConversation.upsert({
      where: { phoneNumber },
      update: {},
      create: { phoneNumber },
    });
  }

  async recordMessage(conversationId: string, sender: MessageSender, content: string, whatsappMessageId?: string) {
    return this.prisma.whatsappMessage.create({
      data: { conversationId, sender, content, whatsappMessageId },
    });
  }

  // Most recent turns first (for a cheap LIMIT), returned oldest-first so callers
  // can drop them straight into a chat completion's message list.
  async getRecentMessages(conversationId: string, limit = 12) {
    const rows = await this.prisma.whatsappMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.reverse();
  }

  async escalate(conversationId: string) {
    return this.prisma.whatsappConversation.update({
      where: { id: conversationId },
      data: { status: ConversationStatus.ESCALATED },
    });
  }
}
