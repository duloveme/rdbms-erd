import "./designer.css";

/** 호스트가 `@rdbms-erd/core` 없이 문서 타입·헬퍼만 쓸 때를 위한 얇은 재export */
export type {
    ColumnModel,
    DesignDocument,
    DesignModel,
    DiagramLayout,
    IndexModel,
    LogicalDataType,
    RelationshipModel,
    RdbmsDialect,
    TableModel,
} from "@rdbms-erd/core";
export {
    applyLogicalTypeChange,
    convertDesignDialect,
    convertPhysicalTypeByLogicalType,
    createColumn,
    createEmptyDesign,
    defaultPhysicalType,
    inferLogicalTypeFromPhysical,
    LOGICAL_DATA_TYPES,
    parseDesign,
    serializeDesign,
} from "@rdbms-erd/core";

export { ERDDesigner } from "./ERDDesigner";
export type {
    CanvasDisplayMode,
    CreateTableRequestPayload,
    DesignerThemeMode,
    ERDDesignerHandle,
    ERDDesignerProps,
    ERDDesignerShellProps,
} from "./ERDDesigner";
export { TableEditDialog } from "./TableEditDialog";
export type { TableEditDialogProps } from "./TableEditDialog";
export { createDesignerStore } from "./createDesignerStore";
export { ErdI18nProvider, useErdI18n, useErdTranslator } from "./i18n/I18nContext";
export type { ErdI18nProviderProps, ErdI18nContextValue } from "./i18n/I18nContext";
export { createTranslator } from "./i18n/createTranslator";
export type { CreateTranslatorOptions } from "./i18n/createTranslator";
export type { I18nKey, I18nVars } from "./i18n/types";
export { I18N_KEYS } from "./i18n/types";
