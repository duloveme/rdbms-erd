# rdbms-erd

Monorepo for **relational database ERD (entity–relationship diagram)** tooling backed by a JSON document model: shared schema (`@rdbms-erd/core`), a React canvas designer (`@rdbms-erd/designer`), and a reference Next.js app (`apps/playground`).

**Licensing:** open source under the [MIT License](LICENSE). **Commercial / enterprise use** is expected to be covered by a separate [Commercial License Agreement](LICENSING.md#2-commercial--enterprise--paid-commercial-license)—see [LICENSING.md](LICENSING.md) for details and how to contact the maintainers.

## Packages

| Package | Role |
|---------|------|
| `@rdbms-erd/core` | Design document types, validation, DDL generation, alignment helpers, sample data |
| `@rdbms-erd/designer` | `ERDDesigner` (React Flow–based), `TableEditDialog`, Zustand store factory |
| `apps/playground` | Reference integration (controlled state, toolbar and options demo) |

---

## Requirements

- **Node.js** 20+ recommended.
- **React 19** — `@rdbms-erd/designer` lists `react` and `react-dom` as peer dependencies (see versions in [`packages/erd-designer/package.json`](packages/erd-designer/package.json)).

---

## Installing in your app

Use whatever fits your host project: workspace path, `npm link`, or install from npm / GitHub Packages after publishing.

Example `file:` dependency on a local checkout:

```json
{
  "dependencies": {
    "@rdbms-erd/core": "file:../rdbms-erd/packages/erd-core",
    "@rdbms-erd/designer": "file:../rdbms-erd/packages/erd-designer"
  }
}
```

Configure your bundler (Next.js, Vite, etc.) to compile TypeScript from `packages/erd-designer` and resolve `@rdbms-erd/core`. The designer entry follows the `exports` field in [`packages/erd-designer/package.json`](packages/erd-designer/package.json).

---

## Using `@rdbms-erd/core` (summary)

- The single source of truth for a design is the **`DesignDocument`** JSON model.
- Empty design: `createEmptyDesign(dialect?)`
- Column factory: `createColumn(dialect, params)`
- Serialization / validation: `serializeDesign`, `parseDesign`, `validateDesignDocument`, etc.
- DDL strings: `generateDdl`, `generateDdlWithDiagnostics`, etc.

For a symbol overview see [`docs/API.md`](docs/API.md). **When injecting external JSON from the host, prefer validating with `parseDesign` / `validateDesignDocument` before passing it to `ERDDesigner`’s `value`.**

---

## Using `@rdbms-erd/designer`

### Overview

- `ERDDesigner` is a **`"use client"`** component.
- It wraps `@xyflow/react`’s **`ReactFlowProvider`** internally; you do not need to wrap it again in the host.
- The package side-effect–imports **`designer.css`** and React Flow styles. If your bundler follows those imports, **you do not need a separate CSS import** in the host app.

### Layout: give the designer a height

The designer root uses `height: 100%` and `width: 100%`. If the parent has no height, the canvas may not render. Prefer a wrapper with **explicit height** (e.g. `height: 100vh`) or a **flex/grid child with `min-height: 0`** so the canvas gets a definite size.

```tsx
<div style={{ height: "100vh", minHeight: 0, width: "100%" }}>
  <ERDDesigner value={doc} onChange={setDoc} />
</div>
```

### Minimal example (controlled document)

```tsx
"use client";

import { createEmptyDesign, type DesignDocument } from "@rdbms-erd/core";
import { ERDDesigner, type ERDDesignerHandle } from "@rdbms-erd/designer";
import { useCallback, useRef, useState } from "react";

export function ErdPage() {
  const [doc, setDoc] = useState<DesignDocument>(() => createEmptyDesign("postgres"));
  const designerRef = useRef<ERDDesignerHandle>(null);

  return (
    <div style={{ height: "100vh", width: "100%" }}>
      <ERDDesigner
        ref={designerRef}
        value={doc}
        onChange={setDoc}
        onSaveJson={useCallback((d) => {
          console.log("save", d);
        }, [])}
      />
    </div>
  );
}
```

### `value` / `onChange` (controlled pattern)

| Aspect | Description |
|--------|-------------|
| `value` | When you pass the current `DesignDocument`, it is applied to the internal store. |
| `onChange` | Called whenever the document changes from the canvas, dialogs, etc. |
| Sync | If the same `value` signature was just emitted via `onChange`, redundant churn is reduced. |

For an **empty landing state**, use `value={undefined}`. After the user creates a design (e.g. **New ER**), `onChange` fires; store that document in parent state and pass it back as `value`.

### `onSaveJson`

Called only from the toolbar **Save (JSON)** action, with the current `DesignDocument`.  
The built-in save button enables only when the document differs from the last known signature (for your own “dirty” UI you can mirror this with `onChange` and `serializeDesign`, etc.).

### `ERDDesigner` props summary

| Prop | Description |
|------|-------------|
| `value?` | Controlled design document. Omit for an empty-canvas flow. |
| `onChange?` | Called when the document changes. |
| `onSaveJson?` | Toolbar save (JSON): receives the current document. |
| `onRequestNewEr?` | **New ER** click. If set, the built-in new-ER dialog is skipped; host runs `(currentDialect) => void`. Host creates a new doc (e.g. `createEmptyDesign`) and injects via `value`. |
| `onRequestCreateTable?` | When a relationship edge is dropped on empty canvas. Omit to use the built-in create-table dialog. |
| `toolbarSlots?` | Toolbar slots `slot1` … `slot5`, `trailing` (see below). |
| `toolbarExtra?` | Right toolbar row: after `trailing`, before the panel toggle. |
| `largeDiagramThreshold?` | At or above this table count, large-diagram mode (no minimap, compact nodes, etc.). Default `120`. |
| `relationshipLinesVisible?` | If set, relationship lines are **controlled** by this prop. |
| `defaultRelationshipLinesVisible?` | Uncontrolled initial visibility for lines. Default `true`. |
| `onRelationshipLinesVisibleChange?` | Called when the relationship-lines toggle changes. |
| `locale?` | Built-in bundle locale: `ko*` → Korean, otherwise English. Ignored when `t` is set. |
| `translations?` | Shallow overrides on top of the bundle. |
| `t?` | Full host control of strings; when set, `locale` / `translations` are ignored. |
| `showRightPanel?` | Show the built-in **right-side ER properties** column. Default `false`. Panel body starts **collapsed**; use the toolbar **menu (panel)** button to expand. |

For types, see `ERDDesignerProps`, `CreateTableRequestPayload`, `ToolbarSlots` in [`packages/erd-designer/src/ERDDesigner.tsx`](packages/erd-designer/src/ERDDesigner.tsx).

### Imperative API (`ref` / `ERDDesignerHandle`)

```ts
const ref = useRef<ERDDesignerHandle>(null);

ref.current?.getJson(); // current DesignDocument
ref.current?.undo();
ref.current?.redo();
ref.current?.addTableAt(tableModel, flowX, flowY);
ref.current?.connectWithForeignKey(sourceTableId, targetTableId, sourcePkColumnId?);
```

**Note:** `addTableAt` / `connectWithForeignKey` only take effect once a design is active (e.g. when `value` points at a valid design). On an empty screen they are effectively no-ops.

### Host-driven flows

#### New ER (`onRequestNewEr`)

If you pass this callback, the built-in “New ER” form does not open; only the host is notified. Create the new project document with **`createEmptyDesign`** (or similar), update state, and pass it as **`value`**.

```tsx
<ERDDesigner
  value={doc}
  onChange={setDoc}
  onRequestNewEr={(dialect) => {
    setDoc(createEmptyDesign(dialect));
  }}
/>
```

#### Create table after edge drop on empty canvas (`onRequestCreateTable`)

Dropping a relationship handle onto empty canvas yields a `CreateTableRequestPayload`: `flowX` / `flowY` are React Flow coordinates; `screenX` / `screenY` are screen coordinates; source table and PK column ids may be included. Open your own UI, then place the table with **`ref.current?.addTableAt(table, flowX, flowY)`** when ready.

### Right panel (`showRightPanel`)

With `showRightPanel={true}`, a docked panel appears to the right of the canvas (project name, description, RDBMS type, stats). The panel **starts collapsed**; toggle visibility with the **menu (panel)** button on the right of the toolbar.

### Relationship lines (controlled / uncontrolled)

- Pass `relationshipLinesVisible` alone for a fully controlled line visibility prop.
- Omit it to use internal state seeded by `defaultRelationshipLinesVisible` (default `true`).
- Pair with `onRelationshipLinesVisibleChange` to keep parent state in sync when the user toggles lines.

### Large diagrams (`largeDiagramThreshold`)

When the table count reaches the threshold, performance-oriented behavior applies (e.g. no minimap, summarized node bodies). Default threshold: `120`.

### Toolbar extension (`toolbarSlots` / `toolbarExtra`)

Built-in groups, left to right:

1. **File** — New ER, save JSON, PDF, copy canvas image, copy DDL  
2. **Tools** — Add table, delete selection (tables and/or selected relationship edges)  
3. **View** — Logical/physical mode, relationship lines  
4. **Edit** — Selection drag, copy/paste tables, undo/redo  
5. **Align** — Align/distribute, fit view  

Host actions use **`slot1` … `slot5`** **between** those groups; **`trailing`** sits in the right cluster (`margin-left: auto`); **`toolbarExtra`** follows `trailing`, before the panel toggle. Wrap clusters in `div.erd-toolbar-group` to match built-in spacing.

For host buttons, the **`erd-toolbar-btn`** class matches built-in styling.

### Internationalization (i18n)

1. **`t` prop** — If set, every string goes through your function.  
2. Otherwise **`locale`** (`ko*` → Korean, else English) plus the built-in bundle.  
3. **`translations`** — partial overrides on top of the bundle.

When using `TableEditDialog` **outside** `ERDDesigner`, wrap with `ErdI18nProvider` or pass `locale` / `translations` / `t` the same way. String keys: exported **`I18N_KEYS`** and type **`I18nKey`**.

### Other exports from `@rdbms-erd/designer`

- **`createDesignerStore`** — Reuse the same state pattern for a fully custom UI.  
- **`ErdI18nProvider`**, **`useErdI18n`**, **`useErdTranslator`**, **`createTranslator`**  
- Types: **`ERDDesignerShellProps`** (`ERDDesigner` props without `locale` / `translations` / `t`), etc.

---

## Reference integration

See **[`apps/playground/app/page.tsx`](apps/playground/app/page.tsx)** for controlled `value` / `onChange`, `showRightPanel`, `locale`, and relationship-line control in one place.

[`docs/API.md`](docs/API.md) summarizes symbols and package boundaries.

---

## Developing this repository

```bash
npm install
npm run dev      # playground Next.js dev server
npm test         # Vitest
npm run build    # production build of playground
```

---

## License

- **Open source:** [MIT License](LICENSE) (SPDX: `MIT` in published packages).  
- **Enterprise / commercial:** see [LICENSING.md](LICENSING.md) for the paid **Commercial License** policy and contact.
