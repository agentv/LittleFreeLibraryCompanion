/** Plain-language summaries used across screens (pure functions). */
import type { Attachment, ConditionLevel, Library, PhotoRole, StockLevel, Visit } from '../types/models';

export const STOCK_LABEL: Record<StockLevel, string> = { empty: 'Empty', low: 'Low', good: 'Good', overflowing: 'Overflowing' };
export const CONDITION_LABEL: Record<ConditionLevel, string> = { good: 'Good', needs_cleaning: 'Needs cleaning', damaged: 'Damaged' };
export const ROLE_LABEL: Record<PhotoRole, string> = { shelf: 'Shelf', establishing: 'Establishing', location: 'Location' };
export const PHOTO_ROLES: PhotoRole[] = ['shelf', 'establishing', 'location'];

export function hasCondition(v: Pick<Visit, 'stockLevel' | 'condition' | 'doorOk' | 'itemsRemoved'>): boolean {
  return v.stockLevel !== null || v.condition !== null || v.doorOk !== null || v.itemsRemoved !== null;
}

/** "Books are low. The box is in good shape, the door works, and nothing was removed." */
export function conditionSentence(v: Pick<Visit, 'stockLevel' | 'condition' | 'doorOk' | 'itemsRemoved'>): string {
  const parts: string[] = [];
  const first: string[] = [];
  if (v.stockLevel) {
    first.push(
      {
        empty: 'The shelves were empty',
        low: 'Books were running low',
        good: 'Plenty of books',
        overflowing: 'Books were overflowing',
      }[v.stockLevel],
    );
  }
  const rest: string[] = [];
  if (v.condition) rest.push({ good: 'the box was in good shape', needs_cleaning: 'the box needed cleaning', damaged: 'the box was damaged' }[v.condition]);
  if (v.doorOk !== null) rest.push(v.doorOk ? 'the door worked fine' : 'the door or latch needed fixing');
  if (v.itemsRemoved !== null) rest.push(v.itemsRemoved ? 'some items were removed' : 'nothing was removed');
  if (first.length) parts.push(first[0] + '.');
  if (rest.length) {
    const joined = rest.length > 1 ? `${rest.slice(0, -1).join(', ')} and ${rest[rest.length - 1]}` : rest[0]!;
    parts.push(joined.charAt(0).toUpperCase() + joined.slice(1) + '.');
  }
  return parts.join(' ') || 'No condition recorded.';
}

/** Short form for lists: "Books low, door loose". */
export function conditionShort(v: Pick<Visit, 'stockLevel' | 'condition' | 'doorOk' | 'itemsRemoved'>): string {
  const bits: string[] = [];
  if (v.stockLevel) bits.push(`Books ${STOCK_LABEL[v.stockLevel].toLowerCase()}`);
  if (v.condition && v.condition !== 'good') bits.push(CONDITION_LABEL[v.condition]);
  if (v.doorOk === false) bits.push('door needs fixing');
  if (v.itemsRemoved) bits.push('items removed');
  if (!bits.length && v.condition === 'good') bits.push('Good shape');
  const s = bits.join(', ');
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'No condition noted';
}

/** A visit that admins and stewards should look at. */
export function needsAttention(v: Pick<Visit, 'stockLevel' | 'condition' | 'doorOk' | 'itemsRemoved'>): boolean {
  return v.stockLevel === 'empty' || v.stockLevel === 'low' || (v.condition !== null && v.condition !== 'good') || v.doorOk === false;
}

export function daysAgo(iso: string, now = Date.now()): number {
  return Math.max(0, Math.floor((now - Date.parse(iso)) / (24 * 3600 * 1000)));
}

export function relativeDay(iso: string, now = Date.now()): string {
  const d = daysAgo(iso, now);
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  return `${d} days ago`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Today, 12:10" or "Nov 9". */
export function shortWhen(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `Today, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const base = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base}, ${d.getFullYear()}`;
}

export function monthLabel(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS_LONG[d.getMonth()]}${d.getFullYear() === new Date().getFullYear() ? '' : ` ${d.getFullYear()}`}`;
}

export function addressLine(l: Pick<Library, 'addressLine' | 'city' | 'addressStatus'>): string | null {
  if (l.addressStatus === 'missing' || !l.addressLine) return null;
  return [l.addressLine, l.city].filter(Boolean).join(', ');
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return 'Good morning,';
  if (h < 18) return 'Good afternoon,';
  return 'Good evening,';
}

export function durationLabel(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function attachmentSummary(atts: Pick<Attachment, 'kind'>[]): string {
  const photos = atts.filter((a) => a.kind === 'photo').length;
  const audio = atts.filter((a) => a.kind === 'audio').length;
  const bits: string[] = [];
  if (photos) bits.push(`${photos} photo${photos === 1 ? '' : 's'}`);
  if (audio) bits.push('voice note');
  return bits.join(', ');
}
