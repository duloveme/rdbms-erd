# Component and Factory Props (`@rdbms-erd/designer`)

This file documents the host-facing behavior of designer exports from
`packages/erd-designer/src`.

Entry point: `exports["."] -> ./src/index.ts`

---

## 1) `ERDDesigner`

`ERDDesigner` is `forwardRef<ERDDesignerHandle, ERDDesignerProps>`, wrapped by
`ReactFlowProvider` internally.

### 1.1 Ref API (`ERDDesignerHandle`)

| Method | Signature | Behavior |
|--------|-----------|----------|
| `getJson` | `() => DesignDocument` | Returns current internal document snapshot |
| `undo` | `() => void` | Calls temporal undo |
| `redo` | `() => void` | Calls temporal redo |
| `addTableAt` | `(table, x, y) => void` | Adds table at flow coordinates when a design is active |
| `connectWithForeignKey` | `(sourceTableId, targetTableId, sourceColumnId?) => void` | Creates FK relation(s) and missing FK columns when needed |

### 1.2 Props (`ERDDesignerProps`)

#### Document flow

- `value?: DesignDocument`
- `onChange?: (doc: DesignDocument) => void`
- `onSave?: (doc: DesignDocument) => void`

`value={undefined}` drives the component into an empty/disabled canvas state.

#### Host workflow hooks

- `onRequestNewEr?: (currentDialect: RdbmsDialect) => void`
- `onRequestCreateTable?: (payload: CreateTableRequestPayload) => void`

`CreateTableRequestPayload`:

| Field | Type | Description |
|------|------|-------------|
| `flowX`, `flowY` | `number` | React Flow coordinates |
| `screenX`, `screenY` | `number` | Screen coordinates |
| `sourceTableId?` | `string` | Source table id when PK context exists |
| `sourceColumnId?` | `string` | Reserved field in type (currently not populated by edge-drop payload) |
| `sourcePrimaryColumnIds?` | `string[]` | Source PK column ids |

#### Toolbar/panel

- `toolbarSlots?: ToolbarSlots`
- `toolbarExtra?: React.ReactNode`
- `showRightPanel?: boolean`
- `showNewErButton?: boolean` (default `true`, toolbar "New ER")
- `dbMetaAdapter?: DbMetaAdapter` (host dialect/type/DDL adapter)
- `themeMode?: "light" | "dark"` (controlled)
- `defaultThemeMode?: "light" | "dark"` (default `light`, uncontrolled)
- `onThemeModeChange?: (mode: "light" | "dark") => void`

#### Performance mode

- Large diagrams are handled internally (no prop): when the table count crosses an internal threshold, the designer switches to compact rendering and visible-only node rendering for performance.

#### Relationship lines

- `relationshipLinesVisible?: boolean` (controlled)
- `defaultRelationshipLinesVisible?: boolean` (default `true`, uncontrolled)
- `onRelationshipLinesVisibleChange?: (visible: boolean) => void`

### 1.3 Host i18n integration

Props:

- `locale?: string`
- `translations?: Partial<Record<I18nKey, string>>`
- `t?: (key: I18nKey, vars?: I18nVars) => string`

Resolution behavior:

1. If `t` exists, it is used for all strings.
2. Otherwise, built-in bundle is selected by `locale` (`ko*` => Korean, else English).
3. `translations` overrides bundle keys.

#### Example: integrate with host translation layer

```tsx
<ERDDesigner
  t={(key, vars) => translate(`erd.${key}`, vars)}
/>
```

#### Example: built-in locale with partial overrides

```tsx
<ERDDesigner
  locale="en"
  translations={{
    "toolbar.newEr": "New Diagram",
    "canvas.emptyHint": "Start by creating a diagram.",
  }}
/>
```

### 1.4 Internal-only state (not exposed as public props)

- logical/physical display mode toggle state
- selection-drag arming state
- internal dialog open states (`TableEditDialog`, new ER dialog)

---

## 2) `TableEditDialog`

Standalone component used internally by `ERDDesigner` as well.

| Prop | Type | Description |
|------|------|-------------|
| `open` | `boolean` | Renders `null` when false |
| `table` | `TableModel \| null` | Target table |
| `dialect` | `RdbmsDialect` | Used for physical type defaults |
| `dbMetaAdapter?` | `DbMetaAdapter` | Host adapter for dialect metadata and logical-type defaults |
| `displayMode` | `CanvasDisplayMode` | Controls logical/physical naming mode |
| `onClose` | `() => void` | Close callback |
| `onSave` | `(table: TableModel) => void` | Save callback with normalized table payload |

i18n for standalone usage:

- Wrap with `ErdI18nProvider`, or
- Pass `locale` / `translations` / `t` directly.

---

## 3) `createDesignerStore(options?)`

Store factory for custom host UI/chrome.

```ts
createDesignerStore(options?: {
  initialDialect?: RdbmsDialect;
  dbMetaAdapter?: DbMetaAdapter;
})
```

- Default dialect: `"mssql"`
- Initial doc: `createEmptyDesign(initialDialect)`
- `setColumnLogicalType` uses adapter-aware `defaultPhysicalType`

---

## 4) Host DB extension pattern

1. Build an adapter in host using `createDefaultDbMetaAdapter()` plus overrides.
2. Pass the same adapter to:
   - `ERDDesigner` via `dbMetaAdapter`
   - core helpers (`generateDdl`, `createColumn`, `convertDesignDialect`, etc.) via `{ dbMetaAdapter }`
3. Keep adapter instance stable (e.g. `useMemo`) to avoid unnecessary store recreation.

---

## 5) Controlled vs uncontrolled summary

| Area | Controlled | Uncontrolled |
|------|------------|--------------|
| Document | `value` + `onChange` | Omit `value` for empty-start flow |
| Relationship lines | `relationshipLinesVisible` + callback | `defaultRelationshipLinesVisible` |

---

## 6) Styling and theming

No theme object prop is exposed currently.
The supported extension path is CSS override of classes/variables from `designer.css`.

---

## 7) Related docs

- `docs/API.md` — public API overview
