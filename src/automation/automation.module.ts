import { Module } from '@nestjs/common';
import { AutomationMongoService } from './automation-mongo.service.js';

@Module({
  providers: [AutomationMongoService],
  exports: [AutomationMongoService],
})
export class AutomationModule {}
