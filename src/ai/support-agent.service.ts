import { Injectable } from '@nestjs/common';
import type OpenAI from 'openai';
import { OpenAiService } from './openai.service.js';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service.js';

export interface SupportAgentResult {
  reply: string;
  needsLiveAgent: boolean;
  handoffSummary?: string;
  meetingAction?: 'propose' | 'reschedule' | 'confirmed';
  requestedStart?: Date;
}

export interface ConversationTurn {
  role: 'client' | 'bot' | 'agent';
  content: string;
}

export interface PendingMeeting {
  scheduledAt: Date;
  meetLink: string;
}

const SYSTEM_PROMPT = `You are Webi, Web Briks' support assistant, replying to clients over WhatsApp.

Language: always reply in the client's own language and style — Bangla, Banglish (Bangla written in
English letters, e.g. "tumi", "ki obostha"), or English — mirroring whichever one they just used.

Role: you are a sales/support assistant, NOT a developer or designer. You never write code, never
produce HTML/CSS/JS/design mockups, and never claim you personally build anything. Your job is to
answer questions from the FAQ context, understand what the client needs (project type, goals, must-
haves), and point them at the right service/package — actual design and development is done by the
human team after a quote or handoff, never by you in the chat.

Memory: the conversation history below is the real, ongoing conversation with this client — read it
before replying. Never contradict what you already told them, never re-ask something they already
answered, and stay on the same topic they're currently discussing unless they change it. If you
already asked a clarifying question and they answered it, use that answer — don't ask again or reset
the conversation.

Pricing: you can NEVER state a specific number, dollar figure, or price range yourself, even if the
FAQ context contains one. If the client asks about price, cost, or budget, tell them (in your own
words) that you're an assistant and can't quote exact pricing, give a brief general idea of the
tech/what's typically involved for that kind of project (no numbers), mention that specifics change
based on scope, and offer to set up a quick meeting with the team for an accurate quote.

Consistency for project conversations: always follow the same order — first understand what they
want to build and its scope, THEN either explain the general approach (no pricing) or offer a
meeting. Don't jump ahead to writing deliverables, and don't change your mind mid-conversation about
what you already told them.

Handle these YOURSELF — never escalate for them:
- Greetings, small talk, thanks, "hi/hello" — just greet back and ask how you can help.
- Vague or broad questions — ask a short clarifying question instead of escalating. Only escalate
  if, after clarifying, the specific thing they need still isn't something you can answer.
- Anything clearly answered by the FAQ context below, including general project/pricing questions —
  answer using only that context.

Escalate ONLY when at least one of these is true, and then end your reply with the exact tag
[ESCALATE] on its own line (a live team member will take over):
- The client explicitly asks for a human / real person / agent.
- The client has an issue tied to their specific order, account, payment, or an active complaint
  that requires someone to look up their real data.
- The client asks a factual/policy question (contract terms, refund for their case, etc.) that the
  FAQ context does not cover — do not guess. (Pricing questions are never escalated for this reason —
  handle them yourself per the Pricing rule above.)
- The client sounds frustrated or is repeating a question your last reply didn't resolve.

Never make up policy, pricing, or delivery details that aren't in the FAQ context — if you don't
know, say a team member will confirm, and escalate only in that case.

Meetings: we never cold-call a client. When a client is ready to move forward, we set up a meeting
instead. Follow whatever the "Meeting status" system note says exactly — it tells you whether a
meeting is already pending for this client (in which case never propose a new one, and never say a
specific date/time or link yourself — the system fills those in) or whether none is pending yet.`;

const NO_MEETING_PENDING_NOTE = `Meeting status: no meeting is pending for this client yet.
If they've shown genuine, ready-to-proceed interest (not just browsing — e.g. they want to start a
project, asked "what's next", or clearly want to talk further) and a meeting with the team is the
natural next step, end your reply with the exact tag [PROPOSE_MEETING: <time>] on its own line, where
<time> is the day/time the client asked for IN THEIR OWN WORDS verbatim (e.g. "15 September at 4pm",
"kal bikal", "tomorrow afternoon") if they mentioned one anywhere in this conversation, or the single
word none if they never specified a time. Say in your own words that you'd like to set up a quick
meeting, but do NOT state a specific date, time, or link yourself — the system resolves <time> to a
real slot and attaches it right after your message. Do this at most once; if they aren't there yet,
just keep helping them normally.`;

function pendingMeetingNote(meeting: PendingMeeting): string {
  const when = formatDhakaTime(meeting.scheduledAt);
  return `Meeting status: a meeting is already pending for this client — ${when} (Dhaka time), link ${meeting.meetLink}.
Do not restate that date/time/link yourself (the client already has them).
- If their latest message accepts it, agrees to it, or says they'll confirm/get back to you about it
  WITHOUT asking for a different time, reply with a short thank-you that also says a teammate will
  reach out to them shortly and that they're welcome to ask anything else meanwhile — then end that
  reply with the exact tag [MEETING_CONFIRMED] on its own line. Do not use [ESCALATE] in that case,
  the system handles notifying the team.
- If they say the proposed time doesn't work, or ask for a different day/time, do NOT just apologize
  vaguely — acknowledge it naturally (e.g. "got it, let me move that") and end your reply with the
  exact tag [RESCHEDULE_MEETING: <time>] on its own line, where <time> is the new day/time they asked
  for, in their own words, verbatim. The system will move the meeting and send the new time/link.
- Otherwise, just answer whatever else they're asking normally.`;
}

export function formatDhakaTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Dhaka',
  }).format(date);
}

const BOT_INTRO =
  "👋 Hi, I'm *Webi* — Web Briks' virtual assistant. I can help with questions about our services, pricing, delivery, and more, and I'll bring in a teammate whenever you need one.\n\n";

const HANDOFF_SUMMARY_PROMPT = `You write short internal handoff summaries for a Web Briks teammate, based
on a WhatsApp transcript between the "Webi" bot and a client. Output ONLY the message below, filled in —
no preamble, no extra commentary.

Never use an em dash (—); use a comma or period instead. Use the client's own words where useful, and
keep it scannable. Follow this exact structure:

🔎 *New lead needs a live reply*

*Potential:* <pick exactly one, with an emoji and one short reason> 🔥 High / 🌤️ Medium / ❄️ Low
*What they want:* <1-2 lines on the project/request, in plain terms>
*Proposals sent:* <how many times Webi offered a meeting/next step in this chat, and briefly what was offered — say "None yet" if none>
*Client's response so far:* <what the client said back to those proposals, or "No response yet">
*Last message:* "<the client's most recent message, verbatim>"`;

interface HistoryEntry {
  role: ConversationTurn['role'];
  content: string;
}

function transcriptFor(history: HistoryEntry[]): string {
  return history.map((turn) => `${turn.role === 'client' ? 'Client' : 'Webi'}: ${turn.content}`).join('\n');
}

@Injectable()
export class SupportAgentService {
  constructor(
    private readonly openAi: OpenAiService,
    private readonly knowledgeBase: KnowledgeBaseService,
  ) {}

  async handleMessage(
    clientMessage: string,
    history: ConversationTurn[] = [],
    isFirstMessage = false,
    pendingMeeting?: PendingMeeting,
  ): Promise<SupportAgentResult> {
    const faqs = await this.knowledgeBase.findRelevantFaqs(clientMessage);
    const context = faqs.length
      ? faqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n')
      : 'No matching FAQ found.';

    const historyMessages: OpenAI.Chat.ChatCompletionMessageParam[] = history.map((turn) => ({
      role: turn.role === 'client' ? 'user' : 'assistant',
      content: turn.content,
    }));

    const meetingNote = pendingMeeting ? pendingMeetingNote(pendingMeeting) : NO_MEETING_PENDING_NOTE;

    const response = await this.openAi.chat([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'system', content: `FAQ context for the client's latest message:\n${context}` },
      { role: 'system', content: meetingNote },
      ...historyMessages,
      { role: 'user', content: clientMessage },
    ]);

    const rawReply = response.content ?? '';
    const meetingConfirmed = rawReply.includes('[MEETING_CONFIRMED]');
    const proposeMatch = !meetingConfirmed ? rawReply.match(/\[PROPOSE_MEETING:\s*([^\]]*)\]/) : null;
    const rescheduleMatch = !meetingConfirmed ? rawReply.match(/\[RESCHEDULE_MEETING:\s*([^\]]*)\]/) : null;
    const needsLiveAgent = meetingConfirmed || (!proposeMatch && !rescheduleMatch && rawReply.includes('[ESCALATE]'));

    const reply = rawReply
      .replace('[MEETING_CONFIRMED]', '')
      .replace(/\[PROPOSE_MEETING:[^\]]*\]/, '')
      .replace(/\[RESCHEDULE_MEETING:[^\]]*\]/, '')
      .replace('[ESCALATE]', '')
      .trim();

    const meetingAction: SupportAgentResult['meetingAction'] = meetingConfirmed
      ? 'confirmed'
      : proposeMatch
        ? 'propose'
        : rescheduleMatch
          ? 'reschedule'
          : undefined;

    const timeText = (proposeMatch ?? rescheduleMatch)?.[1]?.trim();
    const requestedStart = timeText ? (await this.resolveRequestedTime(timeText)) ?? undefined : undefined;

    const handoffSummary = needsLiveAgent
      ? await this.summarizeForHandoff([...history, { role: 'client', content: clientMessage }, { role: 'bot', content: reply }])
      : undefined;

    return { reply: isFirstMessage ? BOT_INTRO + reply : reply, needsLiveAgent, handoffSummary, meetingAction, requestedStart };
  }

  private async resolveRequestedTime(timeText: string): Promise<Date | undefined> {
    if (!timeText || /^none$/i.test(timeText)) return undefined;

    const now = new Date();
    const response = await this.openAi.chat([
      {
        role: 'system',
        content: `Convert a day/time phrase (Bangla, Banglish, or English, always meaning Asia/Dhaka
local time) into an exact future UTC instant. Right now it is ${now.toISOString()} UTC, which is
${formatDhakaTime(now)} in Dhaka. Reply with ONLY an ISO-8601 UTC datetime like
2026-09-15T10:00:00.000Z and nothing else — no words, no explanation. If the phrase truly has no
resolvable date/time, reply with exactly: NONE`,
      },
      { role: 'user', content: timeText },
    ]);

    const raw = response.content?.trim() ?? '';
    if (!raw || raw.toUpperCase() === 'NONE') return undefined;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  private async summarizeForHandoff(fullHistory: HistoryEntry[]): Promise<string> {
    const response = await this.openAi.chat([
      { role: 'system', content: HANDOFF_SUMMARY_PROMPT },
      { role: 'user', content: transcriptFor(fullHistory) },
    ]);
    return response.content?.trim() ?? '';
  }
}
