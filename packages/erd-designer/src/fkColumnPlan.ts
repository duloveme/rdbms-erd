import type {
    ColumnModel,
    RelationshipModel,
    TableModel,
} from "@rdbms-erd/core";

export type FkPlanRow = {
    sourceColumn: ColumnModel;
    reuseExisting: ColumnModel | null;
    proposedLogical: string;
    proposedPhysical: string;
};

/** 부모 PK → 자식 컬럼 쌍으로 이미 릴레이션이 있는지. */
export function isPkFkPairAlreadyRelated(
    relationships: readonly RelationshipModel[],
    sourceTableId: string,
    targetTableId: string,
    sourceColumnId: string,
    targetColumnId: string,
): boolean {
    return relationships.some(
        (r) =>
            r.sourceTableId === sourceTableId &&
            r.targetTableId === targetTableId &&
            r.sourceColumnId === sourceColumnId &&
            r.targetColumnId === targetColumnId,
    );
}

/**
 * 타깃 컬럼 중 이 부모 PK를 가리키는 FK를 찾되,
 * 이미 릴레이션으로 묶인 컬럼은 제외한다(고아 FK만 재사용).
 */
export function findReusableFkColumn(
    targetColumns: readonly ColumnModel[],
    relationships: readonly RelationshipModel[],
    sourceTableId: string,
    targetTableId: string,
    sourceColumnId: string,
): ColumnModel | null {
    return (
        targetColumns.find(
            (c) =>
                c.isForeignKey &&
                c.referencesPrimaryColumnId === sourceColumnId &&
                !isPkFkPairAlreadyRelated(
                    relationships,
                    sourceTableId,
                    targetTableId,
                    sourceColumnId,
                    c.id,
                ),
        ) ?? null
    );
}

export function planForeignKeyColumns(
    sourceTable: TableModel,
    targetTable: TableModel,
    sourceColumns: ColumnModel[],
    relationships: readonly RelationshipModel[] = [],
): FkPlanRow[] {
    return sourceColumns.map((sourceColumn) => {
        const existingFkColumn = findReusableFkColumn(
            targetTable.columns,
            relationships,
            sourceTable.id,
            targetTable.id,
            sourceColumn.id,
        );
        return {
            sourceColumn,
            reuseExisting: existingFkColumn,
            proposedLogical: sourceColumn.logicalName,
            proposedPhysical: sourceColumn.physicalName,
        };
    });
}

export function physicalNameUsedOnTarget(
    targetColumns: ColumnModel[],
    physicalName: string,
    excludeColumnId?: string,
): boolean {
    const p = physicalName.trim();
    if (!p) return false;
    return targetColumns.some(
        (c) =>
            c.id !== excludeColumnId && c.physicalName.trim() === p,
    );
}

/**
 * 물리명이 타깃에 있고, 그 컬럼이 이미 이 부모 PK와 릴레이션으로 묶여 있으면 true.
 * (확정 시 미변경이면 제외·기존 FK 유지)
 */
export function physicalNameCollidesWithBoundFk(
    targetColumns: readonly ColumnModel[],
    relationships: readonly RelationshipModel[],
    sourceTableId: string,
    targetTableId: string,
    sourceColumnId: string,
    physicalName: string,
): boolean {
    const p = physicalName.trim();
    if (!p) return false;
    const col = targetColumns.find((c) => c.physicalName.trim() === p);
    if (!col) return false;
    return isPkFkPairAlreadyRelated(
        relationships,
        sourceTableId,
        targetTableId,
        sourceColumnId,
        col.id,
    );
}

/** 새로 만들 FK에 대해, 타깃에 이미 같은 물리명이 있으면 true(재사용 FK만 제외). */
export function fkPlanNeedsRenameDialog(
    planned: FkPlanRow[],
    targetColumns: ColumnModel[],
): boolean {
    for (const row of planned) {
        if (
            physicalNameUsedOnTarget(
                targetColumns,
                row.proposedPhysical,
                row.reuseExisting?.id,
            )
        ) {
            return true;
        }
    }
    return false;
}

/** 대화상자에 넣을 행: 제안 물리명이 타깃에 이미 있는 planned 행(재사용 FK 제외). */
export function filterFkPlanRowsForRenameDialog(
    planned: FkPlanRow[],
    targetColumns: readonly ColumnModel[],
): FkPlanRow[] {
    return planned.filter((p) =>
        physicalNameUsedOnTarget(
            targetColumns as ColumnModel[],
            p.proposedPhysical,
            p.reuseExisting?.id,
        ),
    );
}

/** 확정 시 apply에 넘길 행: 이미 묵인 FK와 동명이면 제외(기존 FK 유지). */
export function filterOutBoundFkRenameRows(
    draftRows: readonly FkRenameDraftRow[],
    targetColumns: readonly ColumnModel[],
    relationships: readonly RelationshipModel[],
    sourceTableId: string,
    targetTableId: string,
): FkRenameDraftRow[] {
    return draftRows.filter(
        (row) =>
            !physicalNameCollidesWithBoundFk(
                targetColumns,
                relationships,
                sourceTableId,
                targetTableId,
                row.sourceColumnId,
                row.physicalName,
            ),
    );
}

export type FkRenameDraftRow = {
    sourceColumnId: string;
    logicalName: string;
    physicalName: string;
};

export function validateFkRenameRows(
    draftRows: FkRenameDraftRow[],
): { ok: true } | { ok: false; messageKey: "empty" | "dupWithin" } {
    const physSet = new Set<string>();
    for (const row of draftRows) {
        const lp = row.logicalName.trim();
        const pp = row.physicalName.trim();
        if (!lp || !pp) return { ok: false, messageKey: "empty" };
        if (physSet.has(pp)) return { ok: false, messageKey: "dupWithin" };
        physSet.add(pp);
    }
    return { ok: true };
}

/** 물리명이 타깃 테이블 기존 컬럼과 겹치거나, 다른 입력 행과 겹치면 true (시각적 경고용). */
export function fkPhysicalInputShowsConflict(
    targetColumns: ColumnModel[],
    draftRows: Array<{ physicalName: string }>,
    rowIndex: number,
): boolean {
    const p = draftRows[rowIndex]?.physicalName.trim() ?? "";
    if (!p) return false;
    const onTable = targetColumns.some((c) => c.physicalName.trim() === p);
    const dupOtherRow = draftRows.some(
        (r, i) => i !== rowIndex && r.physicalName.trim() === p,
    );
    return onTable || dupOtherRow;
}

/**
 * 대화상자에서 물리명을 그대로 두면 FK로 바뀔 타깃 컬럼 중 PK인 것들.
 * 이미 이 PK↔FK 쌍으로 묶인 컬럼은 제외한다.
 */
export function findTargetPkColumnsForPhysicalMerge(
    targetColumns: readonly ColumnModel[],
    relationships: readonly RelationshipModel[],
    sourceTableId: string,
    targetTableId: string,
    draftRows: readonly FkRenameDraftRow[],
): ColumnModel[] {
    const found: ColumnModel[] = [];
    const seen = new Set<string>();
    for (const row of draftRows) {
        const pp = row.physicalName.trim();
        if (!pp) continue;
        if (
            physicalNameCollidesWithBoundFk(
                targetColumns,
                relationships,
                sourceTableId,
                targetTableId,
                row.sourceColumnId,
                pp,
            )
        ) {
            continue;
        }
        const col = targetColumns.find((c) => c.physicalName.trim() === pp);
        if (!col || !col.isPrimaryKey) continue;
        if (seen.has(col.id)) continue;
        seen.add(col.id);
        found.push(col);
    }
    return found;
}
