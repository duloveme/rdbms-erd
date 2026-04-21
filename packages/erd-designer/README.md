# @rdbms-erd/designer

`@rdbms-erd/designer` is the React canvas UI package for ER modeling.
It uses `@xyflow/react` internally and is intended to be used with `@rdbms-erd/core`.

## Installation

```bash
npm i @rdbms-erd/designer @rdbms-erd/core
```

Peer dependencies:
- `react`
- `react-dom`

## Quick Start

```tsx
"use client";

import { createEmptyDesign, type DesignDocument } from "@rdbms-erd/core";
import { ERDDesigner } from "@rdbms-erd/designer";
import { useState } from "react";

export default function Page() {
  const [doc, setDoc] = useState<DesignDocument>(() => createEmptyDesign("postgres"));
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
  - `onSaveJson?: (doc: DesignDocument) => void`
- Workflow callbacks:
  - `onRequestNewEr?: (currentDialect: RdbmsDialect) => void`
  - `onRequestCreateTable?: (payload: CreateTableRequestPayload) => void`
- View/control:
  - `showRightPanel?: boolean`
  - `relationshipLinesVisible?: boolean`
  - `defaultRelationshipLinesVisible?: boolean`
  - `onRelationshipLinesVisibleChange?: (visible: boolean) => void`
  - `themeMode?: "light" | "dark"`
  - `defaultThemeMode?: "light" | "dark"`
  - `onThemeModeChange?: (mode: "light" | "dark") => void`
- Toolbar extension:
  - `toolbarSlots?: ToolbarSlots`
  - `toolbarExtra?: React.ReactNode`
- i18n:
  - `locale?`, `translations?`, `t?`

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
      { id: "NUMBER", defaultPhysicalType: "INT64" }
    ],
    ddlStyle: { quote: "double", boolLiteral: "oneZero" }
  }
];

<ERDDesigner
  value={doc}
  onChange={setDoc}
  hostMetas={hostMetas}
  hostDdlGenerators={{
    acme: ({ scope }) => ({ sql: `-- custom acme ddl (${scope.kind})` })
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

- `designer.css` and React Flow style are imported by package entry.
- DDL hooks are runtime-only values and are not serialized in design JSON.

## License

MIT
