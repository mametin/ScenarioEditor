export function recoveryKey(projectId: string, documentId: string) { return `trpg-editor-rescue:${projectId}:${documentId}`; }
export function persistRecovery(storage: Pick<Storage, 'setItem'>, key: string, json: unknown): string {
  const text = JSON.stringify({ format: 'tiptap-rescue', savedAt: new Date().toISOString(), content: json }, null, 2);
  storage.setItem(key, text);
  return text;
}
