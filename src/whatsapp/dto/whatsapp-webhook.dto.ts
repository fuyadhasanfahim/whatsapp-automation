export interface WhatsappWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: Array<{
          wa_id: string;
          profile?: { name?: string };
        }>;
        messages?: Array<{
          id: string;
          from: string;
          type: string;
          text?: { body: string };
        }>;
      };
    }>;
  }>;
}

export interface InboundWhatsappJob {
  phoneNumber: string;
  text: string;
  whatsappMessageId: string;
}
