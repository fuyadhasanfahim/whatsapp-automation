import { Injectable } from '@nestjs/common';
import { OpenAiService } from './openai.service.js';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service.js';

export interface SupportAgentResult {
  reply: string;
  needsLiveAgent: boolean;
}

const SYSTEM_PROMPT = `You are Webbricks' support assistant, replying to clients over WhatsApp.
Answer only using the FAQ context provided. Keep replies short and friendly, in the client's language.
If the FAQ context does not clearly answer the question, or the client explicitly asks for a human,
end your reply with the exact tag [ESCALATE] on its own line — a live team member will take over.
Never make up policy, pricing, or delivery details that aren't in the FAQ context.`;

@Injectable()
export class SupportAgentService {
  constructor(
    private readonly openAi: OpenAiService,
    private readonly knowledgeBase: KnowledgeBaseService,
  ) {}

  async handleMessage(clientMessage: string): Promise<SupportAgentResult> {
    const faqs = await this.knowledgeBase.findRelevantFaqs(clientMessage);
    const context = faqs.length
      ? faqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n')
      : 'No matching FAQ found.';

    const response = await this.openAi.chat([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'system', content: `FAQ context:\n${context}` },
      { role: 'user', content: clientMessage },
    ]);

    const rawReply = response.content ?? '';
    const needsLiveAgent = rawReply.includes('[ESCALATE]');
    const reply = rawReply.replace('[ESCALATE]', '').trim();

    return { reply, needsLiveAgent };
  }
}
