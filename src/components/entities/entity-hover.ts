export const ENTITY_HOVER_EVENT = 'scenario-editor:entity-hover';

export type EntityHoverDetail = {
  action: 'show' | 'hide';
  entityId: string;
  left?: number;
  top?: number;
  pinned?: boolean;
};

export function showEntityHover(entityId: string, anchor: Element, pinned = false) {
  const rect = anchor.getBoundingClientRect();
  window.dispatchEvent(new CustomEvent<EntityHoverDetail>(ENTITY_HOVER_EVENT, {
    detail: { action: 'show', entityId, left: rect.left, top: rect.bottom, pinned },
  }));
}

export function hideEntityHover(entityId: string) {
  window.dispatchEvent(new CustomEvent<EntityHoverDetail>(ENTITY_HOVER_EVENT, {
    detail: { action: 'hide', entityId },
  }));
}
