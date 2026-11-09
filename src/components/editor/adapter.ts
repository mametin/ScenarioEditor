import type { JSONContent } from '@tiptap/core';
import { ContentSchema, type Content } from '../../domain/schema';

const mapping = { paragraph: 'paragraph', heading: 'heading', bulletList: 'bulletList', orderedList: 'orderedList', listItem: 'listItem', quote: 'blockquote', divider: 'horizontalRule', readAloud: 'readAloud', kp: 'kp' } as const;
export function toEditorJSON(content: Content[]): JSONContent {
  const convert = (item: Content): JSONContent => {
    ContentSchema.parse(item);
    if (item.kind === 'text') return { type: 'text', text: item.text, ...(item.marks.length ? { marks: item.marks.map(type => ({ type })) } : {}) };
    if (item.kind === 'entity') return { type: 'entityReference', attrs: { reference: item.reference } };
    if (item.kind === 'nodeLink') return { type: 'nodeReference', attrs: { nodeId: item.nodeId, text: item.text } };
    return { type: mapping[item.style], ...(item.level !== undefined ? { attrs: { level: item.level } } : {}), ...(item.children.length ? { content: item.children.map(convert) } : {}) };
  };
  return { type: 'doc', content: content.map(convert) };
}
export function fromEditorJSON(doc: JSONContent): Content[] {
  if (doc.type !== 'doc') throw new Error('本文のルート形式が不正です');
  const convert = (item: JSONContent): Content => {
    if (item.type === 'text') {
      const marks = (item.marks ?? []).map(m => { if (m.type !== 'bold' && m.type !== 'italic') throw new Error(`未対応の文字装飾: ${m.type}`); return m.type; });
      return ContentSchema.parse({ kind: 'text', text: item.text ?? '', marks });
    }
    if (item.type === 'hardBreak') return { kind: 'text', text: '\n', marks: [] };
    if (item.type === 'entityReference') return ContentSchema.parse({ kind: 'entity', reference: item.attrs?.reference });
    if (item.type === 'nodeReference') return ContentSchema.parse({ kind: 'nodeLink', nodeId: item.attrs?.nodeId, text: item.attrs?.text });
    const style = Object.entries(mapping).find(([,type]) => type === item.type)?.[0];
    if (!style) throw new Error(`未対応の本文要素: ${item.type}`);
    return ContentSchema.parse({ kind: 'block', style, ...(style === 'heading' ? { level: item.attrs?.level ?? 1 } : {}), children: (item.content ?? []).map(convert) });
  };
  return (doc.content ?? []).map(convert);
}
