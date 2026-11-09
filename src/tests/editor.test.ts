import { describe, expect, it } from 'vitest';
import { toEditorJSON, fromEditorJSON } from '../components/editor/adapter';
import type { Content } from '../domain/schema';
import { persistRecovery, recoveryKey } from '../components/editor/recovery';

describe('本文の独自JSONとTiptapの変換', () => {
  it('すべての本文要素と装飾を往復する', () => {
    const text: Content = { kind: 'text', text: '日本語の本文', marks: ['bold','italic'] };
    const paragraph: Content = { kind: 'block', style: 'paragraph', children: [text] };
    const content: Content[] = [paragraph, { kind: 'block', style: 'heading', level: 2, children: [text] }, ...(['quote','readAloud','kp'] as const).map(style => ({ kind: 'block' as const, style, children: [paragraph] })), ...(['bulletList','orderedList'] as const).map(style => ({ kind: 'block' as const, style, children: [{ kind: 'block' as const, style: 'listItem' as const, children: [paragraph] }] })), { kind: 'block', style: 'divider', children: [] }];
    expect(fromEditorJSON(toEditorJSON(content))).toEqual(content);
  });
  it('正式名・別名・固定名・内部リンクのIDを維持する', () => {
    const entityId = crypto.randomUUID(); const aliasId = crypto.randomUUID();
    const content: Content[] = [{ kind: 'block', style: 'paragraph', children: [{ kind: 'entity', reference: { entityId, mode: 'auto' } }, { kind: 'entity', reference: { entityId, aliasId, mode: 'alias' } }, { kind: 'entity', reference: { entityId, mode: 'fixed', text: '固定' } }, { kind: 'nodeLink', nodeId: crypto.randomUUID(), text: '内部リンク' }] }];
    expect(fromEditorJSON(toEditorJSON(content))).toEqual(content);
  });
  it('未知の本文要素や文字装飾を黙って破棄しない', () => {
    expect(() => fromEditorJSON({ type: 'doc', content: [{ type: 'image', attrs: { src: 'x' } }] })).toThrow('未対応');
    expect(() => fromEditorJSON({ type: 'doc', content: [{ type: 'text', text: 'x', marks: [{ type: 'code' }] }] })).toThrow('未対応');
  });
  it('不正な参照を拒否する', () => { expect(() => fromEditorJSON({ type: 'doc', content: [{ type: 'entityReference', attrs: { reference: { mode: 'auto', entityId: 'bad' } } }] })).toThrow(); });
  it('改行と空本文を保持する', () => { const value: Content[] = [{ kind: 'block', style: 'paragraph', children: [{ kind: 'text', text: '一行目\n二行目', marks: [] }] }]; expect(fromEditorJSON(toEditorJSON(value))).toEqual(value); expect(fromEditorJSON(toEditorJSON([]))).toEqual([]); });
  it('Shift+Enterの改行を保存形式に変換する', () => { expect(fromEditorJSON({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '一' }, { type: 'hardBreak' }, { type: 'text', text: '二' }] }] })).toEqual([{ kind: 'block', style: 'paragraph', children: [{ kind: 'text', text: '一', marks: [] }, { kind: 'text', text: '\n', marks: [] }, { kind: 'text', text: '二', marks: [] }] }]); });
  it('救出用JSONをプロジェクト・本文別に保持し、保存障害を通知する', () => { const map = new Map<string,string>(); const key = recoveryKey('project','document'); const json = { type: 'doc', content: [{ type: 'unknown', attrs: { important: '消さない' } }] }; const text = persistRecovery({ setItem: (k,v) => { map.set(k,v); } }, key, json); expect(map.get(key)).toBe(text); expect(JSON.parse(text).content).toEqual(json); expect(recoveryKey('other','document')).not.toBe(key); expect(() => persistRecovery({ setItem: () => { throw new Error('quota'); } }, key, json)).toThrow('quota'); });
});
