import type { DesignModel, RelationshipModel } from "@rdbms-erd/core";
import { isRelationshipLineRenderable } from "@rdbms-erd/core";
import type { Edge } from "@xyflow/react";

export type RelationshipEdgeData = { relationshipIds: string[] };

export function computeRelationshipHandleMaps(relationships: RelationshipModel[]): {
  sourceHandleByRelId: Record<string, number>;
  targetHandleByRelId: Record<string, number>;
} {
  const sorted = [...relationships].sort((a, b) => a.id.localeCompare(b.id));
  const sourceHandleByRelId: Record<string, number> = {};
  const bySource = new Map<string, RelationshipModel[]>();
  for (const rel of sorted) {
    const arr = bySource.get(rel.sourceTableId) ?? [];
    arr.push(rel);
    bySource.set(rel.sourceTableId, arr);
  }
  for (const [, list] of bySource) {
    list.forEach((rel, idx) => {
      sourceHandleByRelId[rel.id] = idx;
    });
  }
  const targetHandleByRelId: Record<string, number> = {};
  const byTarget = new Map<string, RelationshipModel[]>();
  for (const rel of sorted) {
    const arr = byTarget.get(rel.targetTableId) ?? [];
    arr.push(rel);
    byTarget.set(rel.targetTableId, arr);
  }
  for (const [, list] of byTarget) {
    list.forEach((rel, idx) => {
      targetHandleByRelId[rel.id] = idx;
    });
  }
  return { sourceHandleByRelId, targetHandleByRelId };
}

export function buildRelationshipFlowEdges(
  model: DesignModel,
  globalLinesVisible: boolean
): Edge<RelationshipEdgeData>[] {
  const { sourceHandleByRelId, targetHandleByRelId } = computeRelationshipHandleMaps(model.relationships);
  return model.relationships
    .filter((rel) => isRelationshipLineRenderable(rel, model, globalLinesVisible))
    .map((rel) => ({
      id: rel.id,
      source: rel.sourceTableId,
      target: rel.targetTableId,
      sourceHandle: `source-${sourceHandleByRelId[rel.id]}`,
      targetHandle: `target-${targetHandleByRelId[rel.id]}`,
      data: { relationshipIds: [rel.id] }
    }));
}
