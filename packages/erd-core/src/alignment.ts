export type AlignCommand =
  | "left"
  | "h-center"
  | "right"
  | "top"
  | "v-center"
  | "bottom"
  | "h-gap"
  | "v-gap";

/**
 * 멀티 선택된 노드 위치를 bounding box 기준으로 정렬/분배한다.
 * positions는 id -> 좌표 맵이며, 반환값은 동일 키에 갱신된 좌표만 포함한다.
 */
export function alignNodePositions(
  selectedIds: string[],
  positions: Record<string, { x: number; y: number }>,
  command: AlignCommand
): Record<string, { x: number; y: number }> {
  const entries = selectedIds
    .map((id) => {
      const pos = positions[id];
      return pos ? { id, pos: { ...pos } } : null;
    })
    .filter((e): e is { id: string; pos: { x: number; y: number } } => Boolean(e));

  if (entries.length < 2) {
    return {};
  }

  const xs = entries.map((e) => e.pos.x);
  const ys = entries.map((e) => e.pos.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const sortByX = [...entries].sort((a, b) => a.pos.x - b.pos.x);
  const sortByY = [...entries].sort((a, b) => a.pos.y - b.pos.y);

  const out: Record<string, { x: number; y: number }> = {};

  for (const e of entries) {
    const next = { ...e.pos };
    if (command === "left") next.x = minX;
    if (command === "h-center") next.x = centerX;
    if (command === "right") next.x = maxX;
    if (command === "top") next.y = minY;
    if (command === "v-center") next.y = centerY;
    if (command === "bottom") next.y = maxY;
    out[e.id] = next;
  }

  if (command === "h-gap") {
    const gap = entries.length > 1 ? (maxX - minX) / (entries.length - 1) : 0;
    sortByX.forEach((e, index) => {
      out[e.id] = { ...e.pos, x: minX + gap * index };
    });
  }

  if (command === "v-gap") {
    const gap = entries.length > 1 ? (maxY - minY) / (entries.length - 1) : 0;
    sortByY.forEach((e, index) => {
      out[e.id] = { ...e.pos, y: minY + gap * index };
    });
  }

  return out;
}
