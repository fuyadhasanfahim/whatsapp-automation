import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module.js';
import { AiModule } from '../ai/ai.module.js';
import { WhatsappController } from './whatsapp.controller.js';
import { WhatsappService } from './whatsapp.service.js';
import { WhatsappClientService } from './whatsapp-client.service.js';
import { WhatsappConversationService } from './whatsapp-conversation.service.js';
import { WhatsappInboundProcessor } from './whatsapp-inbound.processor.js';
import { WhatsappSignatureGuard } from './whatsapp-signature.guard.js';

@Module({
  imports: [QueueModule, AiModule],
  controllers: [WhatsappController],
  providers: [
    WhatsappService,
    WhatsappClientService,
    WhatsappConversationService,
    WhatsappInboundProcessor,
    WhatsappSignatureGuard,
  ],
})
export class WhatsappModule {}
