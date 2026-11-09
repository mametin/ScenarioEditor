import { resolveReference } from './project';
import { orderedOutline } from './outline';
import type { Content, Snapshot } from './schema';

export type ExportOptions = { includeKP: boolean; sectionId?: string };
function inline(content: Content[], snapshot: Snapshot): string {
  return content.map(item => {
    if (item.kind === 'text') { let text = item.text; if (item.marks.includes('bold')) text = `**${text}**`; if (item.marks.includes('italic')) text = `*${text}*`; return text; }
    if (item.kind === 'entity') return resolveReference(item.reference, snapshot).text;
    if (item.kind === 'nodeLink') return `[${item.text}](${encodeURIComponent(item.nodeId)})`;
    if (item.style === 'kp') return '';
    return inline(item.children, snapshot);
  }).join('');
}
function blocks(content: Content[], snapshot: Snapshot, includeKP: boolean): string {
  const output: string[] = [];
  for (const item of content) {
    if (item.kind !== 'block') { output.push(inline([item], snapshot)); continue; }
    if (item.style === 'kp' && !includeKP) continue;
    const text = inline(item.children, snapshot).trim();
    switch (item.style) {
      case 'heading': output.push(`${'#'.repeat(item.level ?? 2)} ${text}`); break;
      case 'quote': output.push(text.split('\n').map(line => `> ${line}`).join('\n')); break;
      case 'bulletList': output.push(item.children.map(child => `- ${inline(child.kind === 'block' ? child.children : [child], snapshot).trim()}`).join('\n')); break;
      case 'orderedList': output.push(item.children.map((child, i) => `${i + 1}. ${inline(child.kind === 'block' ? child.children : [child], snapshot).trim()}`).join('\n')); break;
      case 'listItem': output.push(`- ${text}`); break;
      case 'divider': output.push('---'); break;
      case 'readAloud': output.push(`> **読み上げ**\n> ${text.replaceAll('\n','\n> ')}`); break;
      case 'kp': output.push(`> **KP情報**\n> ${text.replaceAll('\n','\n> ')}`); break;
      default: output.push(text);
    }
  }
  return output.filter(Boolean).join('\n\n');
}
export function exportMarkdown(snapshot: Snapshot, options: ExportOptions): string {
  const ordered = orderedOutline(snapshot);
  const sectionIndex = options.sectionId ? ordered.findIndex(item => item.id === options.sectionId) : -1;
  if (options.sectionId && sectionIndex < 0) throw new Error('出力する章が見つかりません');
  let selected = ordered;
  if (sectionIndex >= 0) {
    const depth = ordered[sectionIndex].depth;
    const end = ordered.findIndex((item, index) => index > sectionIndex && item.depth === depth);
    selected = ordered.slice(sectionIndex, end < 0 ? undefined : end);
  }
  const result = [`# ${snapshot.project.title || '無題のシナリオ'}`];
  if (!selected.length) {
    // No outline yet: export each node in stable creation-array order.
    for (const node of snapshot.nodes) { const doc = snapshot.documents.find(d => d.id === node.documentId); if (doc) result.push(`## ${node.title || '無題'}\n\n${blocks(doc.content, snapshot, options.includeKP)}`); }
  } else for (const item of selected) {
    const headingLevel = Math.min(6, item.depth + 2); result.push(`${'#'.repeat(headingLevel)} ${item.title || (item.nodeId ? snapshot.nodes.find(n => n.id === item.nodeId)?.title : '') || '無題'}`);
    if (item.nodeId) { const node = snapshot.nodes.find(n => n.id === item.nodeId); const doc = node && snapshot.documents.find(d => d.id === node.documentId); if (doc) result.push(blocks(doc.content, snapshot, options.includeKP)); }
  }
  return result.filter(Boolean).join('\n\n').trimEnd() + '\n';
}
export function exportEntitiesMarkdown(snapshot: Snapshot): string {
  return [`# ${snapshot.project.title || '無題のシナリオ'} 設定資料集`, ...snapshot.entities.map(entity => {
    const doc = snapshot.documents.find(d => d.id === entity.descriptionDocumentId);
    return `## ${entity.name}\n\n**カテゴリ:** ${entity.category}\n\n${entity.aliases.length ? `**別名:** ${entity.aliases.map(a => a.name).join('、')}\n\n` : ''}${doc ? blocks(doc.content, snapshot, true) : ''}`;
  })].join('\n\n') + '\n';
}
