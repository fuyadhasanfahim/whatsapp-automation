import { Module } from '@nestjs/common';
import { KnowledgeBaseService } from './knowledge-base.service.js';
import { OpenAiModule } from '../ai/openai.module.js';

@Module({
  imports: [OpenAiModule],
  providers: [KnowledgeBaseService],
  exports: [KnowledgeBaseService],
})
export class KnowledgeBaseModule {}
