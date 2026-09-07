import { openDB, type DBSchema } from 'idb';
import type { Capture, Unit, Review, Settings } from '../domain/models';
export interface Encounter { id: string; unitId: string; day: string; page: string; at: number }
export interface CacheEntry { key: string; value: unknown; at: number }
interface Database extends DBSchema {
  captures: { key: string; value: Capture; indexes: { status: string } };
  units: { key: string; value: Unit; indexes: { canonical: string; due: number } };
  reviews: { key: string; value: Review; indexes: { at: number; unitId: string } };
  encounters: { key: string; value: Encounter };
  cache: { key: string; value: CacheEntry };
  meta: { key: string; value: { key: string; value: Settings | number | string } };
  backups: { key: string; value: { id: string; at: number; json: string } };
}
export const db = openDB<Database>('mach-doc', 1, {
  upgrade(database) {
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
  },
});
