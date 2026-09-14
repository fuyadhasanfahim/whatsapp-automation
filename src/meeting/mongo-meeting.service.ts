import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Db, MongoClient, ObjectId } from 'mongodb';
import { google } from 'googleapis';

export interface CreatedMeeting {
  scheduledAt: Date;
  durationMinutes: number;
  meetLink: string;
}

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const SLOT_MS = 30 * 60 * 1000;
const BUSINESS_START_HOUR = 10;
const BUSINESS_END_HOUR = 17; // last slot must end by 17:30

@Injectable()
export class MongoMeetingService implements OnModuleDestroy {
  private readonly logger = new Logger(MongoMeetingService.name);
  private readonly client: MongoClient;
  private readonly dbPromise: Promise<Db>;
  private readonly createdBy: string;

  constructor(private readonly config: ConfigService) {
    const uri = this.config.getOrThrow<string>('MEETING_MONGO_URI');
    this.createdBy = this.config.getOrThrow<string>('MEETING_CREATED_BY_USER_ID');
    this.client = new MongoClient(uri);
    this.dbPromise = this.client.connect().then((c) => c.db());
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.close();
  }

  // A future, still-scheduled meeting already tied to this WhatsApp number — used so the
  // bot never proposes a second meeting on top of one the client hasn't responded to yet.
  async findPendingMeeting(phoneNumber: string) {
    const db = await this.dbPromise;
    return db.collection('meetings').findOne<{ scheduledAt: Date; googleMeetLink?: string }>({
      attendeePhones: phoneNumber,
      status: 'scheduled',
      scheduledAt: { $gte: new Date() },
    });
  }

  async proposeMeeting(phoneNumber: string, title: string, description: string, preferredStart?: Date): Promise<CreatedMeeting> {
    const db = await this.dbPromise;
    const scheduledAt = await this.findAvailableSlot(db, preferredStart);
    const durationMinutes = 30;
    const endTime = new Date(scheduledAt.getTime() + durationMinutes * 60 * 1000);

    const { eventId, meetLink } = await this.createCalendarEvent(title, description, scheduledAt, endTime);

    await db.collection('meetings').insertOne({
      meetingTitle: title,
      description,
      scheduledAt,
      durationMinutes,
      attendeeEmails: [],
      attendeePhones: [phoneNumber],
      googleEventId: eventId,
      googleMeetLink: meetLink,
      status: 'scheduled',
      reminderSent: false,
      reminder5Sent: false,
      smsSent: false,
      createdBy: new ObjectId(this.createdBy),
      notes: 'Proposed automatically by Webi (WhatsApp bot) — awaiting client confirmation.',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return { scheduledAt, durationMinutes, meetLink };
  }

  // Moves an already-pending meeting for this client to a new slot (client asked for a
  // different time than what was first proposed) — updates both Mongo and the calendar event.
  async rescheduleMeeting(phoneNumber: string, preferredStart?: Date): Promise<CreatedMeeting | null> {
    const db = await this.dbPromise;
    const meeting = await db.collection('meetings').findOne<{
      _id: ObjectId;
      googleEventId?: string;
      durationMinutes: number;
    }>({ attendeePhones: phoneNumber, status: 'scheduled', scheduledAt: { $gte: new Date() } });
    if (!meeting) return null;

    const scheduledAt = await this.findAvailableSlot(db, preferredStart, meeting._id);
    const durationMinutes = meeting.durationMinutes || 30;
    const endTime = new Date(scheduledAt.getTime() + durationMinutes * 60 * 1000);

    let meetLink = '';
    if (meeting.googleEventId) {
      meetLink = await this.patchCalendarEventTime(meeting.googleEventId, scheduledAt, endTime);
    }

    await db.collection('meetings').updateOne(
      { _id: meeting._id },
      { $set: { scheduledAt, updatedAt: new Date(), reminderSent: false, reminder5Sent: false } },
    );

    return { scheduledAt, durationMinutes, meetLink };
  }

  // Walks forward in 30-minute steps — starting from the client's requested time when we have
  // one (snapped to the nearest slot), otherwise from ~2 hours out — staying inside Dhaka
  // business hours (10:00-17:30, Sat-Thu — Friday off) and skipping any overlapping meeting.
  private async findAvailableSlot(db: Db, preferredStart?: Date, excludeMeetingId?: ObjectId): Promise<Date> {
    const minStart = Date.now() + 30 * 60 * 1000;
    const seed = preferredStart && preferredStart.getTime() > minStart ? preferredStart : new Date(Date.now() + 2 * 60 * 60 * 1000);
    let candidate = roundToNearest(seed, SLOT_MS);

    for (let i = 0; i < 200; i++) {
      const dhaka = new Date(candidate.getTime() + DHAKA_OFFSET_MS);
      const weekday = dhaka.getUTCDay(); // 0=Sun ... 5=Fri, 6=Sat
      const hour = dhaka.getUTCHours();
      const minute = dhaka.getUTCMinutes();
      const withinHours = hour >= BUSINESS_START_HOUR && (hour < BUSINESS_END_HOUR || (hour === BUSINESS_END_HOUR && minute === 0));

      if (weekday === 5 || !withinHours) {
        const nextDayDhaka = new Date(dhaka);
        nextDayDhaka.setUTCDate(nextDayDhaka.getUTCDate() + (hour >= BUSINESS_END_HOUR || weekday === 5 ? 1 : 0));
        nextDayDhaka.setUTCHours(BUSINESS_START_HOUR, 0, 0, 0);
        candidate = new Date(nextDayDhaka.getTime() - DHAKA_OFFSET_MS);
        continue;
      }

      const hasOverlap = await db.collection('meetings').findOne({
        status: 'scheduled',
        ...(excludeMeetingId ? { _id: { $ne: excludeMeetingId } } : {}),
        $expr: {
          $and: [
            { $lt: ['$scheduledAt', new Date(candidate.getTime() + SLOT_MS)] },
            { $gt: [{ $add: ['$scheduledAt', { $multiply: ['$durationMinutes', 60000] }] }, candidate] },
          ],
        },
      });

      if (!hasOverlap) return candidate;
      candidate = new Date(candidate.getTime() + SLOT_MS);
    }

    this.logger.warn('Could not find a conflict-free slot in 200 steps — using last candidate anyway');
    return candidate;
  }

  private getCalendarClient() {
    const email = this.config.getOrThrow<string>('GOOGLE_SERVICE_ACCOUNT_EMAIL');
    const privateKey = this.config.getOrThrow<string>('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY').replace(/\\n/g, '\n');
    const calendarId = this.config.get<string>('GOOGLE_CALENDAR_ID') || 'primary';

    const auth = new google.auth.JWT({
      email,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/calendar'],
      subject: calendarId.includes('@') ? calendarId : undefined,
    });
    return { calendar: google.calendar({ version: 'v3', auth }), calendarId };
  }

  private async createCalendarEvent(title: string, description: string, start: Date, end: Date) {
    const { calendar, calendarId } = this.getCalendarClient();
    const requestId = `wa-bot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const { data } = await calendar.events.insert({
      calendarId,
      conferenceDataVersion: 1,
      requestBody: {
        summary: title,
        description,
        start: { dateTime: start.toISOString(), timeZone: 'Asia/Dhaka' },
        end: { dateTime: end.toISOString(), timeZone: 'Asia/Dhaka' },
        conferenceData: { createRequest: { requestId, conferenceSolutionKey: { type: 'hangoutsMeet' } } },
      },
    });

    const meetLink = data.hangoutLink || data.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri || '';
    return { eventId: data.id || '', meetLink };
  }

  private async patchCalendarEventTime(eventId: string, start: Date, end: Date): Promise<string> {
    const { calendar, calendarId } = this.getCalendarClient();
    try {
      const { data } = await calendar.events.patch({
        calendarId,
        eventId,
        requestBody: {
          start: { dateTime: start.toISOString(), timeZone: 'Asia/Dhaka' },
          end: { dateTime: end.toISOString(), timeZone: 'Asia/Dhaka' },
        },
      });
      return data.hangoutLink || data.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri || '';
    } catch (err: any) {
      this.logger.error(`Failed to patch calendar event ${eventId}: ${err.message}`);
      return '';
    }
  }
}

function roundToNearest(date: Date, stepMs: number): Date {
  return new Date(Math.round(date.getTime() / stepMs) * stepMs);
}
