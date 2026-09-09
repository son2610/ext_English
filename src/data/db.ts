import { openDB, type DBSchema } from 'idb';
import type { Capture, Unit, Review, Settings } from '../domain/models';
import type { Organizer } from '../domain/organization';
import type { Assessment, Usage, Practice, Weekly, DictionaryEntry, Optimization } from '../domain/enrichment';
export interface Encounter { id: string; unitId: string; day: string; page: string; at: number }
export interface CacheEntry { key: string; value: unknown; at: number }
interface Database extends DBSchema {
  organizers: { key: string; value: Organizer };
  captures: { key: string; value: Capture; indexes: { status: string; videoId: string } };
  units: { key: string; value: Unit; indexes: { canonical: string; due: number } };
  reviews: { key: string; value: Review; indexes: { at: number; unitId: string } };
  encounters: { key: string; value: Encounter };
  cache: { key: string; value: CacheEntry };
  meta: { key: string; value: { key: string; value: Settings | number | string } };
  backups: { key: string; value: { id: string; at: number; json: string } };
  assessments: { key: string; value: Assessment; indexes: { unitId: string; at: number } };
  usage: { key: string; value: Usage; indexes: { day: string; month: string } };
  practices: { key: string; value: Practice };
  weekly: { key: string; value: Weekly; indexes: { week: string } };
  dictionary: { key: string; value: DictionaryEntry };
  optimization: { key: string; value: Optimization };
}
export const db = openDB<Database>('mach-doc', 3, {
  upgrade(database, oldVersion, _newVersion, transaction) {
    if (oldVersion < 3) database.createObjectStore('organizers', { keyPath: 'id' });
    if (oldVersion < 1) {
    database.createObjectStore('captures', { keyPath: 'id' }).createIndex('status', 'status');
    const units = database.createObjectStore('units', { keyPath: 'id' });
    units.createIndex('canonical', 'canonical');
    units.createIndex('due', 'schedule.due');
    const reviews = database.createObjectStore('reviews', { keyPath: 'id' });
    reviews.createIndex('at', 'at'); reviews.createIndex('unitId', 'unitId');
    database.createObjectStore('encounters', { keyPath: 'id' });
    database.createObjectStore('cache', { keyPath: 'key' });
    database.createObjectStore('meta', { keyPath: 'key' });
    database.createObjectStore('backups', { keyPath: 'id' });
    }
    if (oldVersion < 2) {
      transaction.objectStore('captures').createIndex('videoId', 'source.video.videoId');
      const assessments = database.createObjectStore('assessments', { keyPath: 'id' });
      assessments.createIndex('unitId', 'unitId'); assessments.createIndex('at', 'at');
      const usage = database.createObjectStore('usage', { keyPath: 'id' });
      usage.createIndex('day', 'day'); usage.createIndex('month', 'month');
      database.createObjectStore('practices', { keyPath: 'id' });
      database.createObjectStore('weekly', { keyPath: 'id' }).createIndex('week', 'week');
      database.createObjectStore('dictionary', { keyPath: 'id' });
      database.createObjectStore('optimization', { keyPath: 'id' });
    }
  },
  blocking() { void db.then(database => database.close()); },
});
