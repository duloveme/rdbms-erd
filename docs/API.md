# Public API Overview

This document summarizes the host-facing API for:

- `@rdbms-erd/core`
- `@rdbms-erd/designer`

For implementation details, read each package source.

## `@rdbms-erd/core`

| Symbol | Description |
|------|------|
| `DesignDocument`, `DesignModel`, `TableModel`, ... | JSON document and model types |
| `DialectMeta`, `DbMetaAdapter`, `CoreDbMetaOptions` | Host-extensible DB metadata contracts |
| `createDefaultDbMetaAdapter`, `defaultDbMetaAdapter` | Built-in adapter with default dialects/rules |
| `createEmptyDesign(dialect?)` | Create an empty design document |
| `createColumn(dialect, params, options?)` | Create a column model with adapter-backed defaults |
| `defaultPhysicalType`, `applyLogicalTypeChange` | Logical-to-physical type mapping helpers |
| `convertDesignDialect(doc, nextDialect, options?)` | Converts dialect and updates column physical types |
| `serializeDesign` / `parseDesign` / `validateDesignDocument` / `roundTripDesign` | Serialization and validation |
| `generateDdl(doc, options?)`, `generateIndexDdl(doc, options?)` | SQL generation (adapter-overridable) |
| `analyzeDdlDocument`, `formatDdlDiagnostic`, `formatDdlDiagnostics` | DDL/index diagnostics |
| `generateDdlWithDiagnostics`, `generateIndexDdlWithDiagnostics` | SQL + diagnostics |
| `alignNodePositions`, `AlignCommand` | Pure alignment/distribution utilities |
| `createLargeDesign(count, dialect?)` | Large sample generator for performance testing |

## `@rdbms-erd/designer`

### `ERDDesigner`

Client React component (`"use client"`). `ReactFlowProvider` is already wrapped internally.

#### Main props (`ERDDesignerProps`)

- `value?: DesignDocument`
- `onChange?: (doc: DesignDocument) => void`
- `onSaveJson?: (doc: DesignDocument) => void`
- `onRequestNewEr?: (currentDialect: RdbmsDialect) => void`
- `onRequestCreateTable?: (payload: CreateTableRequestPayload) => void`
- `toolbarSlots?: ToolbarSlots`
- `toolbarExtra?: React.ReactNode`
- `showRightPanel?: boolean`
- `themeMode?: "light" | "dark"`
- `defaultThemeMode?: "light" | "dark"` (default `light`)
- `onThemeModeChange?: (mode: "light" | "dark") => void`
- `relationshipLinesVisible?: boolean`
- `defaultRelationshipLinesVisible?: boolean`
- `onRelationshipLinesVisibleChange?: (visible: boolean) => void`
- `locale?: string`
- `translations?: Partial<Record<I18nKey, string>>`
- `t?: (key: I18nKey, vars?: I18nVars) => string`
- `dbMetaAdapter?: DbMetaAdapter`

### Host DB metadata extension

`ERDDesigner` and `@rdbms-erd/core` can share the same adapter object:

```tsx
import { createDefaultDbMetaAdapter } from "@rdbms-erd/core";

const dbMetaAdapter = createDefaultDbMetaAdapter({
  listDialects: () => [
    // keep built-ins + host custom dialects
    // ...
  ],
});

<ERDDesigner dbMetaAdapter={dbMetaAdapter} />;
```

When `dbMetaAdapter` is omitted, `defaultDbMetaAdapter` is used.

### Host i18n integration

Two supported patterns:

1. **Built-in locale + overrides**

```tsx
<ERDDesigner
  locale="en"
  translations={{
    "canvas.emptyHint": "Create a new ER diagram to get started.",
  }}
/>
```

2. **Full host ownership via `t`**

```tsx
<ERDDesigner
  t={(key, vars) => appTranslate(`erd.${key}`, vars)}
/>
```

When `t` is provided, `locale` and `translations` are ignored.

### `TableEditDialog`

- Inside `ERDDesigner`, i18n context is provided automatically.
- For standalone usage, wrap with `ErdI18nProvider` or pass `locale` / `translations` / `t`.

### Ref API (`ERDDesignerHandle`)

- `getJson(): DesignDocument`
- `undo()` / `redo()`
- `addTableAt(table, x, y)`
- `connectWithForeignKey(sourceTableId, targetTableId, sourceColumnId?)`

### `createDesignerStore(options?)`

Zustand store factory used internally by `ERDDesigner`; also reusable for custom chrome/UI.

## Integration example

See `apps/playground/app/page.tsx` for a full integration example with:

- controlled document state
- ref API usage
- locale switching
- controlled relationship-line visibility
