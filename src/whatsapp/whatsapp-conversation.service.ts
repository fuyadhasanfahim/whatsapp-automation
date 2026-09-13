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

  async escalate(conversationId: string) {
    return this.prisma.whatsappConversation.update({
      where: { id: conversationId },
      data: { status: ConversationStatus.ESCALATED },
    });
  }
}
