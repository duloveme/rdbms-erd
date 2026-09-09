# @rdbms-erd/designer

`@rdbms-erd/designer` is the React canvas UI package for ER modeling.
It uses `@xyflow/react` internally and is intended to be used with `@rdbms-erd/core`.

## Installation

```bash
npm i @rdbms-erd/designer @rdbms-erd/core
```

`DesignDocument` and helpers such as `createEmptyDesign`, `serializeDesign`, `parseDesign`, `createId`, and `ensureUniqueDesignIds` are **defined in `@rdbms-erd/core`**. For convenience, **`@rdbms-erd/designer` re-exports the same symbols**.

When importing tables from a host database, assign a **document-wide unique** id per table with `createId("table")`. Reusing `table-1` across tables collapses them to a single canvas node. `ERDDesigner` normalizes duplicate ids when loading `value`.

**Logical / physical type mapping** (also re-exported from this package): `LOGICAL_DATA_TYPES`, type `LogicalDataType`, `inferLogicalTypeFromPhysical` (physical string → logical for a dialect), `defaultPhysicalType` (logical → default physical), `convertPhysicalTypeByLogicalType` (keep logical + reshape physical for another dialect), `applyLogicalTypeChange`, `convertDesignDialect`, `createColumn`.

Other core APIs (DDL, diagnostics, metadata helpers, etc.) should still be imported from `@rdbms-erd/core`.

Peer dependencies:

- `react`
- `react-dom`

## Quick Start

```tsx
"use client";

import {
    createEmptyDesign,
    ERDDesigner,
    type DesignDocument,
} from "@rdbms-erd/designer";
import { useState } from "react";

export default function Page() {
    const [doc, setDoc] = useState<DesignDocument>(() =>
        createEmptyDesign("postgres"),
    );
    return (
        <div style={{ height: "100vh", width: "100%" }}>
            <ERDDesigner value={doc} onChange={setDoc} />
        </div>
    );
}
```

## Important Layout Rule

The designer root uses `height: 100%`.
Parent must provide explicit height (`100vh`, flex child with `minHeight: 0`, etc.).

## Main Props (`ERDDesignerProps`)

- Document:
    - `value?: DesignDocument`
    - `onChange?: (doc: DesignDocument) => void`
    - `onSave?: (doc: DesignDocument) => void`
- Workflow callbacks:
    - `onRequestNewEr?: (currentDialect: RdbmsDialect) => void`
    - `onRequestCreateTable?: (payload: CreateTableRequestPayload) => void`
- View/control:
    - `defaultPhysicalTypes?: Partial<Record<LogicalDataType, string>>` — overrides logical→default physical DataType (table edit / `defaultPhysicalType`). If `TEXT` is omitted, defaults to `VARCHAR(20)`. Takes precedence over dialect defaults from `hostMetas`.
    - `defaultColumns?: readonly DefaultColumnSpec[]` — templates for the table-edit "Create default columns" action; omit or pass empty to hide the button
    - `glossaryMatchKey?: "logical" | "physical"` (default `"logical"`) — match/upsert/batch-apply key for glossary; also sets Glossary dialog column order (key side first)
    - `allowRelationshipTargetLineDrag?: boolean` (default `false`) — when true, allows vertical drag of the relationship line end (child/target)
    - `onExportExcel?: (tablesJson: string, meta?: { projectName?: unknown }) => void | Promise<void>` — when set, toolbar Excel export calls this instead of the built-in `.xlsx` download
    - `locale?: string`
    - `translations?: Partial<Record<I18nKey, string>>`
    - `t?: (key: I18nKey, vars?: I18nVars) => string`
    - `showRightPanel?: boolean`
    - `showNewErButton?: boolean` (default `true`, toolbar "New ER")
    - `tableWidth?: number` (default `400`)
    - `revealHiddenRelationshipLines?: boolean`
    - `defaultRevealHiddenRelationshipLines?: boolean`
    - `onRevealHiddenRelationshipLinesChange?: (reveal: boolean) => void`
    - `elevateSelectedRelationships?: boolean` (default `false`)
    - `layoutLocked?: boolean`
    - `defaultLayoutLocked?: boolean`
    - `onLayoutLockedChange?: (locked: boolean) => void`
    - `themeMode?: "light" | "dark"`
    - `defaultThemeMode?: "light" | "dark"`
    - `onThemeModeChange?: (mode: "light" | "dark") => void`
- Toolbar extension:
    - `toolbarExtra?: React.ReactNode`

## Next.js (Webpack / Turbopack)

Published builds expose **compiled ESM** under `dist/`. Importing `ERDDesigner` pulls in `@xyflow/react` styles and bundled designer tokens via `import './index.css'` inside the package entry, so **no extra CSS import is required** for the default chrome.

Optional: `import "@rdbms-erd/designer/designer.css"` resolves to the same token stylesheet if you need an explicit side-effect import (e.g. SSR split). You may still set `transpilePackages: ["@rdbms-erd/designer", "@rdbms-erd/core"]` when targeting older JS output.

## DB Extension Props (JSON + optional hook)

- `hostMetas?: DialectMetaJson[]`
    - override/append dialect metadata by id
    - affects right-panel DB dropdown and logical-type defaults
- `hostDdlGenerators?: Record<string, DdlGeneratorHook>`
    - optional per-dialect DDL function
    - used by toolbar DDL copy action (`all` / `selected` scope)
- `fallbackOnHookError?: boolean` (default `true`)
- `dbMetaAdapter?: DbMetaAdapter`
    - advanced/legacy adapter path

## Example: Custom Dialect in Designer

```tsx
import { ERDDesigner } from "@rdbms-erd/designer";

const hostMetas = [
    {
        id: "acme",
        label: "AcmeDB",
        supportsSchema: true,
        logicalTypes: [
            { id: "TEXT", defaultPhysicalType: "STRING(255)" },
            { id: "NUMBER", defaultPhysicalType: "INT64" },
        ],
        ddlStyle: { quote: "double", boolLiteral: "oneZero" },
    },
];

<ERDDesigner
    value={doc}
    onChange={setDoc}
    hostMetas={hostMetas}
    hostDdlGenerators={{
        acme: ({ scope }) => ({ sql: `-- custom acme ddl (${scope.kind})` }),
    }}
/>;
```

## Ref API (`ERDDesignerHandle`)

- `getJson()`
- `undo()`, `redo()`
- `addTableAt(table, x, y)`
- `connectWithForeignKey(sourceTableId, targetTableId, sourceColumnId?)`

## Other Exports

- `TableEditDialog`
- `GlossaryDialog`
- `createDesignerStore`
- `ErdI18nProvider`, `useErdI18n`, `useErdTranslator`, `createTranslator`
- `I18N_KEYS`, `I18nKey`, `I18nVars`
- `DefaultColumnSpec`, `appendDefaultColumns`, `preserveDefaultColumnPhysicalTypes`
- Glossary helpers: `findGlossaryMatch`, `upsertGlossaryEntry`, `removeGlossaryEntries`, `applyGlossaryToTables`, `fillOppositeNamesFromGlossary`, `parseGlossaryJson`, `mergeGlossaryEntries`, type `GlossaryMatchKey`

## Notes

- Toolbar **Add table** (`Ctrl/Cmd+Shift+E`): after save, the new table is placed at the **center of the currently visible pane** (uses React Flow `getViewport()`, so pan/zoom does not affect placement). Edge-drop still uses the drop point; paste uses clipboard positions + offset.
- `designer.css` and React Flow style are imported by package entry.
- DDL hooks are runtime-only values and are not serialized in design JSON.
- **Glossary** lives on `DesignDocument.glossary` (undo/save with the document). Toolbar opens `GlossaryDialog`; table edit can upsert and fill opposite names. Match/upsert/batch apply follow `glossaryMatchKey`. Batch apply overwrites the opposite name; mode-switch fill only fills empty opposite names.
- **Glossary JSON I/O**: the `GlossaryDialog` footer exports the entry list on its own and imports either a bare entry array or `{ "glossary": [...] }`. When the current list is non-empty the import asks to replace or merge (merge upserts on `glossaryMatchKey`).
- **Design JSON I/O**: the toolbar exports the whole `DesignDocument` as `{projectName}_{YYYY-MM-DD}.json` and imports a design file through `parseDesign`, replacing the current document and clearing undo history. Import warns first when there are unsaved changes; it stays enabled with no design so an empty canvas can open a file. This is separate from **Save (JSON)**, which only calls `onSave`.
- **Table edit column selection**: each column row has a leading checkbox (last blank input row excluded) with select-all in the header and Shift+click range selection; the footer deletes all checked columns after a confirm.
- Relationship edge customization state is serialized in document relationships:
    - `cardinality?: "1:1" | "1:N"`
    - `canvasLineHidden?: boolean`
    - `linePivotRatio?: number`
    - `sourceLineY?: number` (`sourceLineRatio` is kept for legacy fallback)
    - `targetLineY?: number` (`targetLineRatio` fallback; child-end drag when `allowRelationshipTargetLineDrag` is true)

## License

MIT
