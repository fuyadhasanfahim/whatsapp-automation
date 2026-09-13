import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Request } from 'express';

// Public endpoint (any WhatsApp client can trigger it) but every request must carry
// Meta's HMAC signature over the raw body, proving it actually came from Meta.
@Injectable()
export class WhatsappSignatureGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const appSecret = this.config.get<string>('WHATSAPP_APP_SECRET');
    if (!appSecret) {
      // Not configured yet (local dev) — allow through so the webhook can be exercised.
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { rawBody?: Buffer }>();
    const signatureHeader = request.headers['x-hub-signature-256'];
    if (typeof signatureHeader !== 'string' || !request.rawBody) {
      throw new ForbiddenException('Missing signature');
    }

    const expected = `sha256=${createHmac('sha256', appSecret).update(request.rawBody).digest('hex')}`;
    const provided = Buffer.from(signatureHeader);
    const expectedBuf = Buffer.from(expected);

    if (provided.length !== expectedBuf.length || !timingSafeEqual(provided, expectedBuf)) {
      throw new ForbiddenException('Invalid signature');
    }

    return true;
  }
}
