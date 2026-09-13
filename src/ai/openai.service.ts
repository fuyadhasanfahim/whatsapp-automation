import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class OpenAiService {
  private readonly client: OpenAI;
  private readonly chatModel: string;
  private readonly embeddingModel: string;

  constructor(config: ConfigService) {
    this.client = new OpenAI({ apiKey: config.get<string>('OPENAI_API_KEY', '') });
    this.chatModel = config.get<string>('OPENAI_CHAT_MODEL', 'gpt-4.1-mini');
    this.embeddingModel = config.get<string>('OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small');
  }

  async embed(text: string): Promise<number[]> {
    const result = await this.client.embeddings.create({
      model: this.embeddingModel,
      input: text,
    });
    return result.data[0].embedding;
  }

  async chat(messages: OpenAI.Chat.ChatCompletionMessageParam[]) {
    const result = await this.client.chat.completions.create({
      model: this.chatModel,
      messages,
      temperature: 0.3,
    });
    return result.choices[0].message;
  }
}
