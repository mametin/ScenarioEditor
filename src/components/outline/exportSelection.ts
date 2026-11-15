import type { OutlineItem } from '../../domain/schema';

export function isChapterSelectionValid(items: OutlineItem[], sectionId: string): boolean {
  return !!sectionId && items.some(item => item.id === sectionId);
}
