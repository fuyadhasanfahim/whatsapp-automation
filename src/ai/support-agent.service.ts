import { Injectable } from '@nestjs/common';
import { OpenAiService } from './openai.service.js';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service.js';

export interface SupportAgentResult {
  reply: string;
  needsLiveAgent: boolean;
}

const SYSTEM_PROMPT = `You are Webi, Web Briks' support assistant, replying to clients over WhatsApp.
Keep replies short and friendly, in the client's own language (Bangla, Banglish, or English).

Handle these YOURSELF — never escalate for them:
- Greetings, small talk, thanks, "hi/hello" — just greet back and ask how you can help.
- Vague or broad questions — ask a short clarifying question instead of escalating. Only escalate
  if, after clarifying, the specific thing they need still isn't something you can answer.
- Anything clearly answered by the FAQ context below — answer using only that context.

Escalate ONLY when at least one of these is true, and then end your reply with the exact tag
[ESCALATE] on its own line (a live team member will take over):
- The client explicitly asks for a human / real person / agent.
- The client has an issue tied to their specific order, account, payment, or an active complaint
  that requires someone to look up their real data.
- The client asks a factual/policy question (exact price quote, contract terms, refund for their
  case, etc.) that the FAQ context does not cover — do not guess.
- The client sounds frustrated or is repeating a question your last reply didn't resolve.

Never make up policy, pricing, or delivery details that aren't in the FAQ context — if you don't
know, say a team member will confirm, and escalate only in that case.`;

const BOT_INTRO =
  "👋 Hi, I'm *Webi* — Web Briks' virtual assistant. I can help with questions about our services, pricing, delivery, and more, and I'll bring in a teammate whenever you need one.\n\n";

@Injectable()
export class SupportAgentService {
  constructor(
    private readonly openAi: OpenAiService,
    private readonly knowledgeBase: KnowledgeBaseService,
  ) {}

  async handleMessage(clientMessage: string, isFirstMessage = false): Promise<SupportAgentResult> {
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

    return { reply: isFirstMessage ? BOT_INTRO + reply : reply, needsLiveAgent };
  }
}
