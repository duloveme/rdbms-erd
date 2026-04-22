import type { DesignModel, RelationshipModel } from "@rdbms-erd/core";
import { isRelationshipLineRenderable } from "@rdbms-erd/core";
import type { Edge } from "@xyflow/react";

export type RelationshipEdgeData = {
    relationshipIds: string[];
    cardinality: "1:1" | "1:N";
};

/** Single source handle on the right of each table node; all outgoing FK edges attach here. */
export const TABLE_RELATIONSHIP_SOURCE_HANDLE_ID = "source";

/** Left target handle id for an FK column on the target table (see TableNode). */
export function targetFkColumnHandleId(columnId: string): string {
    return `target-fk-${columnId}`;
}

function fkColumnIndex(
    targetTable: DesignModel["tables"][number],
    columnId: string | undefined,
): number {
    if (!columnId) return -1;
    const i = targetTable.columns.findIndex((c) => c.id === columnId);
    if (i < 0) return -1;
    return targetTable.columns[i]?.isForeignKey ? i : -1;
}

/**
 * Target handle for an edge on the target table (FK column only).
 * Each relationship uses its own `targetColumnId` so multiple incoming edges
 * land on the correct FK row, including when the source table has a composite PK.
 */
export function resolveTargetFkHandleId(
    rel: RelationshipModel,
    model: DesignModel,
): string | null {
    const targetTable = model.tables.find((t) => t.id === rel.targetTableId);
    if (!targetTable) return null;

    const i = fkColumnIndex(targetTable, rel.targetColumnId);
    if (i < 0) return null;
    const col = targetTable.columns[i];
    return col ? targetFkColumnHandleId(col.id) : null;
}

export function buildRelationshipFlowEdges(
    model: DesignModel,
    revealHiddenLines: boolean,
): Edge<RelationshipEdgeData>[] {
    return model.relationships
        .filter((rel) =>
            isRelationshipLineRenderable(rel, revealHiddenLines),
        )
        .map((rel) => {
            const targetHandle = resolveTargetFkHandleId(rel, model);
            if (!targetHandle) return null;
            return {
                id: rel.id,
                source: rel.sourceTableId,
                target: rel.targetTableId,
                sourceHandle: TABLE_RELATIONSHIP_SOURCE_HANDLE_ID,
                targetHandle,
                style: {
                    stroke: "#94a3b8",
                    strokeWidth: 1.6,
                },
                type: "relationship",
                data: {
                    relationshipIds: [rel.id],
                    cardinality: rel.cardinality ?? "1:N",
                },
            } satisfies Edge<RelationshipEdgeData>;
        })
        .filter((e): e is Edge<RelationshipEdgeData> => e != null);
}
