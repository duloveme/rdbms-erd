import type { DesignModel, RelationshipModel } from "@rdbms-erd/core";
import { isRelationshipLineRenderable } from "@rdbms-erd/core";
import type { Edge } from "@xyflow/react";

export type RelationshipEdgeData = { relationshipIds: string[] };

/** Single source handle on the right of each table node; all outgoing FK edges attach here. */
export const TABLE_RELATIONSHIP_SOURCE_HANDLE_ID = "source";

function computeTargetHandleByRelId(relationships: RelationshipModel[]): Record<string, number> {
  const sorted = [...relationships].sort((a, b) => a.id.localeCompare(b.id));
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
  return targetHandleByRelId;
}

export function buildRelationshipFlowEdges(
  model: DesignModel,
  globalLinesVisible: boolean
): Edge<RelationshipEdgeData>[] {
  const targetHandleByRelId = computeTargetHandleByRelId(model.relationships);
  return model.relationships
    .filter((rel) => isRelationshipLineRenderable(rel, model, globalLinesVisible))
    .map((rel) => ({
      id: rel.id,
      source: rel.sourceTableId,
      target: rel.targetTableId,
      sourceHandle: TABLE_RELATIONSHIP_SOURCE_HANDLE_ID,
      targetHandle: `target-${targetHandleByRelId[rel.id]}`,
      data: { relationshipIds: [rel.id] }
    }));
}
