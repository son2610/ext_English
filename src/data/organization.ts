import { z } from 'zod';
import { db } from './db';
import { OrganizerSchema, OrganizationSchema, searchText, type Organizer } from '../domain/organization';

export async function organizers(): Promise<Organizer[]> {
  return (await (await db).getAll('organizers')).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}
export async function saveOrganizer(draft: Pick<Organizer, 'kind' | 'name' | 'color'>, previous?: Organizer): Promise<void> {
  const value = OrganizerSchema.parse({ ...draft, id: previous?.id ?? crypto.randomUUID(), updatedAt: Math.max(Date.now(), (previous?.updatedAt ?? 0) + 1) });
  const tx = (await db).transaction('organizers', 'readwrite');
  const rows = await tx.store.getAll();
  if (previous && !rows.some(row => row.id === previous.id && row.updatedAt === previous.updatedAt && row.kind === value.kind)) {
    await tx.done; throw new Error('Nhóm hoặc nhãn đã thay đổi. Hãy mở lại phần quản lý.');
  }
  if (rows.some(row => row.id !== value.id && row.kind === value.kind && searchText(row.name) === searchText(value.name))) {
    await tx.done; throw new Error('Tên nhóm hoặc nhãn này đã có. Hãy chọn tên khác.');
  }
  if (!previous && rows.length >= 1000) { await tx.done; throw new Error('Đã đạt giới hạn 1.000 nhóm và nhãn.'); }
  await tx.store.put(value); await tx.done;
}

const PatchSchema = z.object({
  groupId: z.string().uuid().nullable().optional(),
  addLabel: z.string().uuid().optional(), removeLabel: z.string().uuid().optional(),
});
export type OrganizationPatch = z.infer<typeof PatchSchema>;
/** Read current values inside the transaction: bulk changes never overwrite another tab's labels. */
export async function organizeCaptures(ids: string[], input: OrganizationPatch): Promise<void> {
  const patch = PatchSchema.parse(input);
  const tx = (await db).transaction(['captures', 'organizers'], 'readwrite');
  const catalog = await tx.objectStore('organizers').getAll();
  for (const [id, kind] of [[patch.groupId, 'group'], [patch.addLabel, 'label'], [patch.removeLabel, 'label']] as const) {
    if (id && !catalog.some(row => row.id === id && row.kind === kind)) { await tx.done; throw new Error('Nhóm hoặc nhãn không còn tồn tại. Hãy chọn lại.'); }
  }
  const items = await Promise.all([...new Set(ids)].map(id => tx.objectStore('captures').get(id)));
  // Validate the entire batch before writing any item, so a limit error cannot partially save a batch.
  const updates = items.flatMap(item => {
    if (!item) return [];
    const labels = new Set(item.organization?.labelIds ?? []);
    if (patch.addLabel) labels.add(patch.addLabel);
    if (patch.removeLabel) labels.delete(patch.removeLabel);
    const organization = OrganizationSchema.safeParse({
      groupId: patch.groupId === undefined ? item.organization?.groupId : patch.groupId ?? undefined,
      labelIds: [...labels],
    });
    return [{ item, organization }];
  });
  if (updates.some(update => !update.organization.success)) { await tx.done; throw new Error('Mỗi câu có thể gắn tối đa 30 nhãn. Chưa áp dụng thay đổi nào.'); }
  for (const { item, organization } of updates) if (organization.success) {
    await tx.objectStore('captures').put({ ...item, organization: organization.data, updatedAt: Math.max(Date.now(), item.updatedAt + 1) });
  }
  await tx.done;
}

/** Removing an organizer only detaches it. Captures, lessons and FSRS history are retained. */
export async function deleteOrganizer(previous: Organizer): Promise<void> {
  const tx = (await db).transaction(['organizers', 'captures'], 'readwrite');
  const row = await tx.objectStore('organizers').get(previous.id);
  if (!row || row.updatedAt !== previous.updatedAt) { await tx.done; throw new Error('Nhóm hoặc nhãn đã thay đổi. Hãy mở lại phần quản lý.'); }
  await tx.objectStore('organizers').delete(row.id);
  let cursor = await tx.objectStore('captures').openCursor();
  while (cursor) {
    const c = cursor.value, org = c.organization;
    if (org && (org.groupId === row.id || org.labelIds.includes(row.id))) {
      await cursor.update({ ...c, organization: { groupId: org.groupId === row.id ? undefined : org.groupId, labelIds: org.labelIds.filter(id => id !== row.id) }, updatedAt: Math.max(Date.now(), c.updatedAt + 1) });
    }
    cursor = await cursor.continue();
  }
  await tx.done;
}
