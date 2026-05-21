# @rdbms-erd/designer

`@rdbms-erd/designer` is the React canvas UI package for ER modeling.
It uses `@xyflow/react` internally and is intended to be used with `@rdbms-erd/core`.

## Installation

```bash
npm i @rdbms-erd/designer @rdbms-erd/core
```

`DesignDocument` 및 `createEmptyDesign` / `serializeDesign` / `parseDesign` / `createId` / `ensureUniqueDesignIds` 등은 **`@rdbms-erd/core`에 정의**되어 있으며, 편의를 위해 **`@rdbms-erd/designer`에서도 동일 심볼을 재export**합니다.

Host DB import 시 테이블마다 `createId("table")`로 **문서 전역 유일** id를 부여하세요. `table-1`을 여러 테이블에 재사용하면 캔버스에 노드가 하나만 보입니다. `ERDDesigner`는 `value` 로드 시 중복 id를 자동 정규화합니다.

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
    - `defaultPhysicalTypes?: Partial<Record<LogicalDataType, string>>` — 논리→물리 기본 DataType(테이블 편집·`defaultPhysicalType`). `TEXT` 미지정 시 `VARCHAR(20)`. `hostMetas` 방언 기본보다 우선.
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
- `createDesignerStore`
- `ErdI18nProvider`, `useErdI18n`, `useErdTranslator`, `createTranslator`
- `I18N_KEYS`, `I18nKey`, `I18nVars`

## Notes

- Toolbar **Add table** (`Ctrl/Cmd+Shift+E`): after save, the new table is placed at the **center of the currently visible pane** (uses React Flow `getViewport()`, so pan/zoom does not affect placement). Edge-drop still uses the drop point; paste uses clipboard positions + offset.
- `designer.css` and React Flow style are imported by package entry.
- DDL hooks are runtime-only values and are not serialized in design JSON.
- Relationship edge customization state is serialized in document relationships:
    - `cardinality?: "1:1" | "1:N"`
    - `canvasLineHidden?: boolean`
    - `linePivotRatio?: number`
    - `sourceLineY?: number` (`sourceLineRatio` is kept for legacy fallback)

## License

MIT
