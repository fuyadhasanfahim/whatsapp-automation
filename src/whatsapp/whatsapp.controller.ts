import { Body, Controller, ForbiddenException, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WhatsappSignatureGuard } from './whatsapp-signature.guard.js';
import { WhatsappService } from './whatsapp.service.js';
import type { WhatsappWebhookPayload } from './dto/whatsapp-webhook.dto.js';

// Fully public by design (MVP): any client must be able to reach this without auth.
// The signature guard is what proves a POST really came from Meta.
@Controller('whatsapp/webhook')
export class WhatsappController {
  constructor(
    private readonly config: ConfigService,
    private readonly whatsappService: WhatsappService,
  ) {}

  @Get()
  verify(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
  ): string {
    const expectedToken = this.config.getOrThrow<string>('WHATSAPP_VERIFY_TOKEN');
    if (mode === 'subscribe' && token === expectedToken) {
      return challenge ?? '';
    }
    throw new ForbiddenException('Invalid verify token');
  }

  @Post()
  @HttpCode(200)
  @UseGuards(WhatsappSignatureGuard)
  async receive(@Body() payload: WhatsappWebhookPayload): Promise<{ status: string }> {
    await this.whatsappService.handleIncoming(payload);
    return { status: 'ok' };
  }
}
