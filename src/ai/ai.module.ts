import { Module } from '@nestjs/common';
import { SupportAgentService } from './support-agent.service.js';
import { OpenAiModule } from './openai.module.js';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module.js';

@Module({
  imports: [OpenAiModule, KnowledgeBaseModule],
  providers: [SupportAgentService],
  exports: [SupportAgentService],
})
export class AiModule {}
