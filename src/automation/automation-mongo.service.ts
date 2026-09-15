import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Db, MongoClient } from 'mongodb';
import { normalizePhone } from '../common/phone.util.js';

@Injectable()
export class AutomationMongoService implements OnModuleDestroy {
  private readonly client: MongoClient;
  private readonly dbPromise: Promise<Db>;

  constructor(private readonly config: ConfigService) {
    const uri = this.config.getOrThrow<string>('MEETING_MONGO_URI');
    this.client = new MongoClient(uri);
    this.dbPromise = this.client.connect().then((c) => c.db());
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.close();
  }

  // Records a first-time WhatsApp sender into the `automation` collection. Skipped if the
  // number is already a known lead (`leads`) or already recorded here, so contacts already
  // being worked never get duplicated. `leads.phone` is stored with a leading "+" while the
  // WhatsApp webhook sends digits only, so both forms are checked.
  async saveContactIfNew(phoneNumber: string, name?: string): Promise<void> {
    const digits = normalizePhone(phoneNumber);
    if (!digits) return;
    const candidates = [digits, `+${digits}`];

    const db = await this.dbPromise;
    const [existingLead, existingAutomationContact] = await Promise.all([
      db.collection('leads').findOne({ phone: { $in: candidates } }),
      db.collection('automation').findOne({ phone: { $in: candidates } }),
    ]);
    if (existingLead || existingAutomationContact) return;

    await db.collection('automation').insertOne({
      phone: digits,
      name: name || null,
      createdAt: new Date(),
    });
  }

  async saveMemory(phoneNumber: string, message: string): Promise<void> {
    const db = await this.dbPromise;
    await db.collection('automation_memories').insertOne({
      phone: normalizePhone(phoneNumber),
      message,
      createdAt: new Date(),
    });
  }
}
