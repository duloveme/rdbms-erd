import type { ColumnModel, TableModel } from "@rdbms-erd/core";

export type FkPlanRow = {
    sourceColumn: ColumnModel;
    reuseExisting: ColumnModel | null;
    proposedLogical: string;
    proposedPhysical: string;
};

export function planForeignKeyColumns(
    sourceTable: TableModel,
    targetTable: TableModel,
    sourceColumns: ColumnModel[],
): FkPlanRow[] {
    return sourceColumns.map((sourceColumn) => {
        const existingFkColumn =
            targetTable.columns.find(
                (c) =>
                    c.isForeignKey &&
                    c.referencesPrimaryColumnId === sourceColumn.id,
            ) ?? null;
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

/** 새로 만들 FK에 대해, 타깃에 이미 같은 물리명이 있으면 true(재사용 FK 제외). */
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
