import type { Content, Snapshot } from './schema';
import { resolveReference } from './project';

export type ScenarioSearchResult = {
  kind: 'node' | 'entity';
  id: string;
  title: string;
  context: string;
  excerpt: string;
  score: number;
};

function documentText(content: Content[], snapshot: Snapshot): string {
  return content.map(item => {
    if (item.kind === 'text' || item.kind === 'nodeLink') return item.text;
    if (item.kind === 'entity') return resolveReference(item.reference, snapshot).text;
    if (item.style === 'divider') return '';
    return documentText(item.children, snapshot);
  }).join(' ').replace(/\s+/g, ' ').trim();
}

function excerpt(text: string, terms: string[]): string {
  if (!text) return '';
  const lower = text.toLocaleLowerCase();
  const matchIndex = terms.map(term => lower.indexOf(term)).filter(index => index >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, matchIndex - 34);
  const end = Math.min(text.length, start + 110);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

/** Search only the active project's readable content; this does not mutate its stored snapshot. */
export function searchScenario(snapshot: Snapshot, query: string, limit = 40): ScenarioSearchResult[] {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const results: ScenarioSearchResult[] = [];

  for (const node of snapshot.nodes) {
    const typeName = snapshot.nodeTypes.find(type => type.id === node.typeId)?.name ?? '';
    const tags = node.tagIds.map(id => snapshot.tags.find(tag => tag.id === id)?.name ?? '').filter(Boolean);
    const content = snapshot.documents.find(document => document.id === node.documentId);
    const body = content ? documentText(content.content, snapshot) : '';
    const title = node.title || '無題';
    const searchable = `${title} ${typeName} ${tags.join(' ')} ${body}`.toLocaleLowerCase();
    if (!terms.every(term => searchable.includes(term))) continue;
    const titleMatch = title.toLocaleLowerCase();
    const score = titleMatch.startsWith(terms[0]) ? 0 : titleMatch.includes(terms[0]) ? 1 : tags.some(tag => terms.some(term => tag.toLocaleLowerCase().includes(term))) ? 2 : 3;
    results.push({ kind: 'node', id: node.id, title, context: `ノード · ${typeName}${tags.length ? ` · ${tags.join('、')}` : ''}`, excerpt: excerpt(body, terms), score });
  }

  for (const entity of snapshot.entities) {
    const aliases = entity.aliases.map(alias => alias.name).filter(Boolean);
    const tags = entity.tagIds.map(id => snapshot.tags.find(tag => tag.id === id)?.name ?? '').filter(Boolean);
    const document = snapshot.documents.find(item => item.id === entity.descriptionDocumentId);
    const body = document ? documentText(document.content, snapshot) : '';
    const title = entity.name || '無名の設定資料';
    const searchable = `${title} ${entity.category} ${aliases.join(' ')} ${tags.join(' ')} ${body}`.toLocaleLowerCase();
    if (!terms.every(term => searchable.includes(term))) continue;
    const titleMatch = title.toLocaleLowerCase();
    const score = titleMatch.startsWith(terms[0]) ? 0 : titleMatch.includes(terms[0]) ? 1 : aliases.some(alias => terms.some(term => alias.toLocaleLowerCase().includes(term))) ? 2 : 3;
    results.push({ kind: 'entity', id: entity.id, title, context: `設定資料 · ${entity.category}${aliases.length ? ` · 別名: ${aliases.join('、')}` : ''}${tags.length ? ` · ${tags.join('、')}` : ''}`, excerpt: excerpt(body, terms), score });
  }

  return results.sort((a, b) => a.score - b.score || a.title.localeCompare(b.title, 'ja')).slice(0, limit);
}
