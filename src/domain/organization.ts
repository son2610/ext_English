import { z } from 'zod';

export const colors = {
  emerald: { name: 'Xanh ngọc', ink: '#23634d', soft: '#e4f2e9', stripe: '#549978' },
  blue: { name: 'Xanh dương', ink: '#285d95', soft: '#e8f1fc', stripe: '#6d9dd1' },
  purple: { name: 'Tím', ink: '#70469a', soft: '#f2eafb', stripe: '#a17cc2' },
  amber: { name: 'Vàng', ink: '#825e13', soft: '#fcf2d9', stripe: '#d4b157' },
  coral: { name: 'Cam san hô', ink: '#974c39', soft: '#fcece5', stripe: '#d68f78' },
  rose: { name: 'Hồng', ink: '#984b6a', soft: '#fbeaf1', stripe: '#ce8ba7' },
} as const;
export const OrganizerSchema = z.object({
  id: z.string().uuid(), kind: z.enum(['group', 'label']),
  name: z.string().trim().min(1).max(60).transform(s => s.normalize('NFC')),
  color: z.enum(['emerald', 'blue', 'purple', 'amber', 'coral', 'rose']),
  updatedAt: z.number().nonnegative(),
});
export type Organizer = z.infer<typeof OrganizerSchema>;
export const OrganizationSchema = z.object({ groupId: z.string().uuid().optional(), labelIds: z.array(z.string().uuid()).max(30) });
/** Accent-insensitive search only; source quotes and text anchors remain untouched. */
export function searchText(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
}
