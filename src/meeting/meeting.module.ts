import { Module } from '@nestjs/common';
import { MongoMeetingService } from './mongo-meeting.service.js';

@Module({
  providers: [MongoMeetingService],
  exports: [MongoMeetingService],
})
export class MeetingModule {}
