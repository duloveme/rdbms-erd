import {
    type CoreDbMetaOptions,
    defaultPhysicalType,
    inferLogicalTypeFromPhysical,
    type ColumnModel,
    type RdbmsDialect,
    type TableModel,
} from "@rdbms-erd/core";

export type TableEditSaveDisplayMode = "logical" | "physical";

export function columnNamesBlank(col: ColumnModel): boolean {
    return !col.logicalName?.trim() && !col.physicalName?.trim();
}

export type ApplyLogicalFromPhysicalOptions = {
    /**
     * 물리 타입에서 추론한 논리 타입이 현재 `logicalType`과 다를 때만 갱신한다(물리→논리 모드 전환).
     * 미설정 시 물리 타입이 있으면 항상 추론값으로 덮는다.
     */
    updateLogicalTypeOnlyWhenMappingMismatch?: boolean;
};

/** 물리 타입 → 논리 타입 (이름은 복사하지 않음; placeholder·캔버스 fallback용). */
export function applyLogicalFieldsFromPhysicalDraft(
    draft: TableModel,
    dialect: RdbmsDialect,
    coreOptions?: CoreDbMetaOptions,
    options?: ApplyLogicalFromPhysicalOptions,
): TableModel {
    const onlyOnMismatch =
        options?.updateLogicalTypeOnlyWhenMappingMismatch === true;
    const columns = draft.columns.map((c) => {
        if (columnNamesBlank(c)) return c;
        const physType = c.physicalType?.trim() ?? "";
        if (physType.length === 0) return c;
        const inferred = inferLogicalTypeFromPhysical(
            dialect,
            physType,
            coreOptions,
        );
        if (onlyOnMismatch && inferred === c.logicalType) {
            return c;
        }
        return { ...c, logicalType: inferred };
    });

    return { ...draft, columns };
}

export type ApplyPhysicalFromLogicalOptions = {
    /** 물리 컬럼명이 이미 있으면 `physicalType`을 논리 기본값으로 덮지 않는다(논리→물리 모드 전환·열기). */
    preservePhysicalTypeIfPhysicalNameSet?: boolean;
};

/** 논리 타입 → 물리 타입 (이름은 복사하지 않음). */
export function applyPhysicalFieldsFromLogicalDraft(
    draft: TableModel,
    dialect: RdbmsDialect,
    coreOptions?: CoreDbMetaOptions,
    options?: ApplyPhysicalFromLogicalOptions,
): TableModel {
    const preserve = options?.preservePhysicalTypeIfPhysicalNameSet === true;
    const columns = draft.columns.map((c) => {
        if (columnNamesBlank(c)) return c;
        if (preserve && (c.physicalName?.trim() ?? "").length > 0) {
            return c;
        }
        const physicalType = defaultPhysicalType(
            dialect,
            c.logicalType,
            coreOptions,
        );
        return { ...c, physicalType };
    });

    return { ...draft, columns };
}

/** 사용자가 물리 DataType을 직접 편집할 때 — 논리 타입은 항상 추론(보존 없음). */
export function patchColumnOnPhysicalTypeUserEdit(
    dialect: RdbmsDialect,
    physicalType: string,
    coreOptions?: CoreDbMetaOptions,
): Pick<ColumnModel, "physicalType" | "logicalType"> {
    const pt = physicalType.trim().toUpperCase();
    return {
        physicalType: pt,
        logicalType: inferLogicalTypeFromPhysical(dialect, pt, coreOptions),
    };
}

/** 대화상자를 열 때 draft 초기화. */
export function syncTableEditDraftOnOpen(
    draft: TableModel,
    dialect: RdbmsDialect,
    coreOptions: CoreDbMetaOptions | undefined,
    displayMode: TableEditSaveDisplayMode,
): TableModel {
    if (displayMode === "logical") {
        return applyPhysicalFieldsFromLogicalDraft(
            draft,
            dialect,
            coreOptions,
            { preservePhysicalTypeIfPhysicalNameSet: true },
        );
    }
    return applyLogicalFieldsFromPhysicalDraft(
        draft,
        dialect,
        coreOptions,
    );
}

/** 대화상자에서 논리 → 물리 표시 모드로 전환할 때. */
export function syncTableEditDraftOnSwitchToPhysical(
    draft: TableModel,
    dialect: RdbmsDialect,
    coreOptions: CoreDbMetaOptions | undefined,
): TableModel {
    return applyPhysicalFieldsFromLogicalDraft(
        draft,
        dialect,
        coreOptions,
        { preservePhysicalTypeIfPhysicalNameSet: true },
    );
}

/** 대화상자에서 물리 → 논리 표시 모드로 전환할 때. */
export function syncTableEditDraftOnSwitchToLogical(
    draft: TableModel,
    dialect: RdbmsDialect,
    coreOptions: CoreDbMetaOptions | undefined,
): TableModel {
    return applyLogicalFieldsFromPhysicalDraft(
        draft,
        dialect,
        coreOptions,
        { updateLogicalTypeOnlyWhenMappingMismatch: true },
    );
}

/**
 * 테이블 편집 저장 시 draft 정규화.
 * - 물리 모드: 사용자가 입력한 `physicalType` 유지, 논리 타입만 물리에서 추론.
 * - 논리 모드: 논리 타입 기준으로 물리 타입 기본값 적용.
 */
export function normalizeTableEditForSave(
    draft: TableModel,
    dialect: RdbmsDialect,
    coreOptions: CoreDbMetaOptions | undefined,
    displayMode: TableEditSaveDisplayMode,
): TableModel {
    const baseColumns = draft.columns.filter((c) => !columnNamesBlank(c));
    const working: TableModel = { ...draft, columns: baseColumns };
    if (displayMode === "physical") {
        return applyLogicalFieldsFromPhysicalDraft(
            working,
            dialect,
            coreOptions,
        );
    }
    return applyPhysicalFieldsFromLogicalDraft(
        working,
        dialect,
        coreOptions,
    );
}
