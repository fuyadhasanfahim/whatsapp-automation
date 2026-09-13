import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { KnowledgeBaseService } from './knowledge-base.service.js';

// Run with: pnpm seed:faqs
// Add/edit entries below, then re-run — it's fine to re-run repeatedly during setup.
const FAQS: Array<{ question: string; answer: string; category?: string }> = [
  {
    question: 'Delivery time koto din lagbe?',
    answer: 'Amader standard delivery time 5-7 business days. Express delivery option available.',
    category: 'delivery',
  },
];

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const knowledgeBase = app.get(KnowledgeBaseService);

  for (const faq of FAQS) {
    await knowledgeBase.upsertFaq(faq.question, faq.answer, faq.category);
    console.log(`Seeded: ${faq.question}`);
  }

  await app.close();
}

await run();
