import { v4 as uuidv4 } from "uuid";

function fallbackId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createId(prefix: string): string {
  try {
    return `${prefix}-${uuidv4()}`;
  } catch {
    return `${prefix}-${fallbackId()}`;
  }
}
