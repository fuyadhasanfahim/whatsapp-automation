import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { OpenAiService } from '../ai/openai.service.js';

export interface FaqMatch {
  id: string;
  question: string;
  answer: string;
  distance: number;
}

@Injectable()
export class KnowledgeBaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly openAi: OpenAiService,
  ) {}

  async upsertFaq(question: string, answer: string, category?: string) {
    const embedding = await this.openAi.embed(`${question}\n${answer}`);
    const vectorLiteral = toVectorLiteral(embedding);

    const [row] = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO faq_entries (id, question, answer, category, embedding, "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${question}, ${answer}, ${category ?? null}, ${vectorLiteral}::vector, now(), now())
      RETURNING id
    `;
    return row;
  }

  // Cosine distance (<=>) is the recommended pgvector operator for OpenAI embeddings.
  async findRelevantFaqs(question: string, limit = 3): Promise<FaqMatch[]> {
    const embedding = await this.openAi.embed(question);
    const vectorLiteral = toVectorLiteral(embedding);

    return this.prisma.$queryRaw<FaqMatch[]>`
      SELECT id, question, answer, embedding <=> ${vectorLiteral}::vector AS distance
      FROM faq_entries
      ORDER BY embedding <=> ${vectorLiteral}::vector
      LIMIT ${limit}
    `;
  }
}

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
