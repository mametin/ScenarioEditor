import { z } from 'zod';

const id = z.string().uuid();
const date = z.string().datetime();
const base = { id, createdAt: date, updatedAt: date };
export const EntityReferenceSchema = z.discriminatedUnion('mode', [
  z.strictObject({ entityId: id, mode: z.literal('auto') }),
  z.strictObject({ entityId: id, mode: z.literal('alias'), aliasId: id }),
  z.strictObject({ entityId: id, mode: z.literal('fixed'), text: z.string() }),
]);
export type EntityReference = z.infer<typeof EntityReferenceSchema>;
export type Content = { kind: 'text'; text: string; marks: ('bold' | 'italic')[] } | { kind: 'entity'; reference: EntityReference } | { kind: 'nodeLink'; nodeId: string; text: string } | { kind: 'block'; style: 'paragraph' | 'heading' | 'bulletList' | 'orderedList' | 'listItem' | 'quote' | 'divider' | 'readAloud' | 'kp'; level?: number; children: Content[] };
export const ContentSchema: z.ZodType<Content> = z.lazy(() => z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('text'), text: z.string(), marks: z.array(z.enum(['bold', 'italic'])) }),
  z.strictObject({ kind: z.literal('entity'), reference: EntityReferenceSchema }),
  z.strictObject({ kind: z.literal('nodeLink'), nodeId: id, text: z.string() }),
  z.strictObject({ kind: z.literal('block'), style: z.enum(['paragraph', 'heading', 'bulletList', 'orderedList', 'listItem', 'quote', 'divider', 'readAloud', 'kp']), level: z.number().int().min(1).max(6).optional(), children: z.array(ContentSchema) }),
]));
export const DocumentSchema = z.strictObject({ ...base, content: z.array(ContentSchema) });
export const FieldValueSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('text'), value: z.string() }),
  z.strictObject({ kind: z.literal('richText'), documentId: id }),
  z.strictObject({ kind: z.literal('number'), value: z.number().finite() }),
  z.strictObject({ kind: z.literal('boolean'), value: z.boolean() }),
  z.strictObject({ kind: z.literal('singleSelect'), optionId: id.nullable() }),
  z.strictObject({ kind: z.literal('multiSelect'), optionIds: z.array(id) }),
  z.strictObject({ kind: z.literal('date'), value: z.iso.date() }),
  z.strictObject({ kind: z.literal('entityReference'), reference: EntityReferenceSchema }),
  z.strictObject({ kind: z.literal('nodeReference'), nodeId: id }),
]);
const fields = z.record(id, FieldValueSchema);
export const FieldDefinitionSchema = z.strictObject({ id, name: z.string(), kind: z.enum(['text','richText','number','boolean','singleSelect','multiSelect','date','entityReference','nodeReference']), hidden: z.boolean(), options: z.array(z.strictObject({ id, name: z.string() })) });
export const NodeTypeDefinitionSchema = z.strictObject({ id, name: z.string(), icon: z.string(), color: z.string(), fields: z.array(FieldDefinitionSchema) });
const nodeCore = { ...base, typeId: id, title: z.string(), documentId: id, fields, tagIds: z.array(id), position: z.strictObject({ x: z.number().finite(), y: z.number().finite() }), parentGroupId: id.nullable() };
export const ScenarioNodeV1Schema = z.strictObject(nodeCore);
export const ScenarioNodeSchema = z.strictObject({ ...nodeCore, size: z.strictObject({ width: z.number().finite().min(160).max(2500), height: z.number().finite().min(80).max(2500) }).optional() });
export const ScenarioEdgeSchema = z.strictObject({ id, sourceId: id, targetId: id, kind: z.enum(['progression','conditional','reference','dependency']), label: z.string(), condition: z.string() });
export const EntityAliasSchema = z.strictObject({ id, name: z.string() });
export const ScenarioEntitySchema = z.strictObject({ ...base, category: z.string(), name: z.string(), aliases: z.array(EntityAliasSchema), descriptionDocumentId: id, fields, tagIds: z.array(id) });
export const TagSchema = z.strictObject({ id, name: z.string(), color: z.string() });
export const OutlineItemSchema = z.strictObject({ id, parentId: id.nullable(), title: z.string(), nodeId: id.nullable(), order: z.number().int().nonnegative() });
export const SyncMetadataSchema = z.strictObject({ projectId: id, status: z.enum(['notConfigured','pending','syncing','synced','conflict','error']), lastSyncedRevision: z.number().int().nonnegative().nullable(), baseCommitSha: z.string().nullable(), lastSyncedAt: date.nullable() });
export const ProjectSchema = z.strictObject({ ...base, title: z.string(), description: z.string() });
const snapshotCore = { project: ProjectSchema, documents: z.array(DocumentSchema), edges: z.array(ScenarioEdgeSchema), nodeTypes: z.array(NodeTypeDefinitionSchema), entities: z.array(ScenarioEntitySchema), tags: z.array(TagSchema), outline: z.array(OutlineItemSchema), sync: SyncMetadataSchema };
const SnapshotV1Schema = z.strictObject({ schemaVersion: z.literal(1), ...snapshotCore, nodes: z.array(ScenarioNodeV1Schema) });
export const SnapshotSchema = z.strictObject({ schemaVersion: z.literal(2), ...snapshotCore, nodes: z.array(ScenarioNodeSchema) });
export type Project = z.infer<typeof ProjectSchema>;
export type ScenarioNode = z.infer<typeof ScenarioNodeSchema>;
export type ScenarioEdge = z.infer<typeof ScenarioEdgeSchema>;
export type NodeTypeDefinition = z.infer<typeof NodeTypeDefinitionSchema>;
export type FieldDefinition = z.infer<typeof FieldDefinitionSchema>;
export type ScenarioEntity = z.infer<typeof ScenarioEntitySchema>;
export type EntityAlias = z.infer<typeof EntityAliasSchema>;
export type Tag = z.infer<typeof TagSchema>;
export type OutlineItem = z.infer<typeof OutlineItemSchema>;
export type SyncMetadata = z.infer<typeof SyncMetadataSchema>;
export type Snapshot = z.infer<typeof SnapshotSchema>;

/** Additive v1 -> v2 migration: preserve all records and IDs; node sizes remain unset until edited. */
export function migrateSnapshotV1ToV2(raw: unknown) {
  const version1 = SnapshotV1Schema.parse(raw);
  return { ...version1, schemaVersion: 2 as const };
}

/** Reject unsupported versions and unknown fields; only the additive v1 -> v2 migration is accepted. */
export function parseSnapshot(raw: unknown): Snapshot {
  const version = raw && typeof raw === 'object' && 'schemaVersion' in raw ? raw.schemaVersion : undefined;
  const migrated = version === 1 ? migrateSnapshotV1ToV2(raw) : raw;
  const data = SnapshotSchema.parse(migrated);
  const allIds = [data.project.id, ...[data.nodes,data.documents,data.edges,data.nodeTypes,data.entities,data.tags,data.outline].flatMap(xs => xs.map(x => x.id)), ...data.entities.flatMap(e => e.aliases.map(a => a.id)), ...data.nodeTypes.flatMap(t => t.fields.flatMap(f => [f.id, ...f.options.map(o => o.id)]))];
  if (new Set(allIds).size !== allIds.length) throw new Error('IDが重複しています');
  if (data.sync.projectId !== data.project.id) throw new Error('同期情報のプロジェクトIDが一致しません');
  const docs = new Set(data.documents.map(d => d.id));
  const nodes = new Set(data.nodes.map(n => n.id));
  for (const n of data.nodes) {
    if (!docs.has(n.documentId) || !data.nodeTypes.some(t => t.id === n.typeId)) throw new Error('ノードの本文またはタイプが見つかりません');
    if (n.parentGroupId && !nodes.has(n.parentGroupId)) throw new Error('親グループが見つかりません');
  }
  for (const e of data.edges) if (!nodes.has(e.sourceId) || !nodes.has(e.targetId)) throw new Error('接続先が見つかりません');
  for (const e of data.entities) if (!docs.has(e.descriptionDocumentId)) throw new Error('設定資料の説明が見つかりません');
  for (const item of [...data.nodes, ...data.entities]) {
    if (item.tagIds.some(t => !data.tags.some(tag => tag.id === t))) throw new Error('タグが見つかりません');
    for (const value of Object.values(item.fields)) if (value.kind === 'richText' && !docs.has(value.documentId)) throw new Error('フィールドの本文が見つかりません');
  }
  const outlineIds = new Set(data.outline.map(o => o.id));
  for (const o of data.outline) if ((o.parentId && !outlineIds.has(o.parentId)) || (o.nodeId && !nodes.has(o.nodeId))) throw new Error('アウトラインの参照先が見つかりません');
  function checkCycles(items: { id: string; parent: string | null }[]) {
    const parents = new Map(items.map(x => [x.id, x.parent]));
    for (const item of items) { const seen = new Set<string>(); let current: string | null = item.id; while (current) { if (seen.has(current)) throw new Error('階層が循環しています'); seen.add(current); current = parents.get(current) ?? null; } }
  }
  checkCycles(data.nodes.map(n => ({ id: n.id, parent: n.parentGroupId })));
  checkCycles(data.outline.map(o => ({ id: o.id, parent: o.parentId })));
  return data;
}
