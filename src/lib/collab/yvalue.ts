import * as Y from 'yjs';

export function toPlainValue(value: unknown): unknown {
  if (value instanceof Y.AbstractType) {
    return value.toJSON();
  }
  return value;
}

export function clonePlainValue<T>(value: unknown): T | null {
  const plain = toPlainValue(value);
  if (!plain || typeof plain !== 'object') return null;
  return structuredClone(plain) as T;
}
