# @rdbms-erd/core

`@rdbms-erd/core` is the headless model/DDL package for rdbms-erd.
It provides document types, validation/serialization, logical->physical type defaults,
DDL generation, diagnostics, and host-extensible database metadata.

## Installation

```bash
npm i @rdbms-erd/core
```

## Quick Start

```ts
import { createEmptyDesign, createColumn, generateDdl } from "@rdbms-erd/core";

const doc = createEmptyDesign("postgres");
doc.model.tables.push({
    id: "table-users",
    logicalName: "Users",
    physicalName: "users",
    columns: [
        createColumn("postgres", {
            id: "col-users-id",
            logicalName: "ID",
            physicalName: "id",
            logicalType: "NUMBER",
            nullable: false,
            isPrimaryKey: true,
        }),
    ],
});

console.log(generateDdl(doc));
```

## Table and column IDs (required)

Every `TableModel.id` and `ColumnModel.id` must be **unique across the whole document**.
React Flow nodes use `table.id` as the node id; duplicate ids (for example two `table-1` rows from a DB import) collapse to one canvas node and break layout keys in `layout.nodePositions`.

When building a design from a database in your host app, do **not** reuse `table-1` per table. Use a fresh id per entity:

```ts
import { createId } from "@rdbms-erd/core";

const table = {
  id: createId("table"), // e.g. table-550e8400-e29b-41d4-a716-446655440000
  physicalName: row.tableName,
  logicalName: row.comment ?? "",
  columns: row.columns.map((c) => ({
    id: createId("col"),
    physicalName: c.name,
    // ...
  })),
};
```

`parseDesign` and `ensureUniqueDesignIds(doc)` reissue duplicate ids when loading legacy or host-generated JSON.

## Core Concepts

- `DesignDocument`: ER JSON source of truth (includes optional `glossary`)
- `GlossaryEntry`: `{ id, logicalName, physicalName }` term mapped in the document
- `RdbmsDialect`: dialect id stored in document
- `LogicalDataType`: normalized logical type ids
- `DialectMetaJson`: host-overridable per-dialect metadata
- `DdlGeneratorHook`: optional per-dialect SQL generation hook

## Glossary

`DesignDocument.glossary?: GlossaryEntry[]` stores a logical↔physical name dictionary with the design JSON (serialize/parse/validate). Omit or leave empty when unused; loaders treat a missing glossary as `[]`. Incomplete entries (blank logical or physical name) are skipped on normalize.

## Relationship Model Notes

`RelationshipModel` supports canvas-specific rendering state used by the designer:

- `cardinality?: "1:1" | "1:N"`
- `canvasLineHidden?: boolean`
- `linePivotRatio?: number` (middle vertical segment ratio)
- `sourceLineY?: number` (source edge absolute Y inside table)
- `sourceLineRatio?: number` (legacy fallback when `sourceLineY` is absent)
- `targetLineY?: number` (target edge absolute Y inside table)
- `targetLineRatio?: number` (fallback when `targetLineY` is absent)

## Host-Extensible DB Metadata

### 1) Override/append dialect metadata with JSON

Use `hostMetas` in options. Merge policy:

- same `id`: override builtin
- new `id`: append

```ts
import { resolveDialectMetas } from "@rdbms-erd/core";

const metas = resolveDialectMetas({
    hostMetas: [
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
    ],
});
```

### 2) Optional per-dialect DDL function hook

If a dialect DDL is complex, provide a function in `hostDdlGenerators`.
If omitted, style-based builtin SQL generation is used.

```ts
import {
    generateDdlForSelection,
    type DdlGenerateInput,
} from "@rdbms-erd/core";

const sql = generateDdlForSelection(doc, ["table-users"], {
    hostDdlGenerators: {
        acme: (input: DdlGenerateInput) => {
            // input.scope.kind: "all" | "selected"
            return { sql: "-- custom acme ddl" };
        },
    },
    fallbackOnHookError: true,
}).sql;
```

## Main APIs

- Document lifecycle:
    - `createEmptyDesign`
    - `serializeDesign`, `parseDesign`, `validateDesignDocument`, `roundTripDesign`
- Type defaults / mapping:
    - `defaultPhysicalType` (logical → default physical for a dialect)
    - `inferLogicalTypeFromPhysical` (physical string → logical, dialect-aware)
    - `convertPhysicalTypeByLogicalType` (reshape physical for `nextDialect` while keeping `logicalType`)
    - `createColumn`
    - `applyLogicalTypeChange`
    - `convertDesignDialect`
- DDL:
    - `generateDdl`
    - `generateDdlForSelection`
    - `generateIndexDdl`
    - `generateDdlWithDiagnostics`
    - `generateIndexDdlWithDiagnostics`
- Metadata:
    - `resolveDialectMetas`
    - `mergeDialectMetas`
    - `createDefaultDbMetaAdapter` (legacy/advanced adapter path)

## Notes

- DDL function hooks are runtime values and are **not serialized** in `DesignDocument`.
- `DesignDocument` stores dialect id, model data, layout, optional settings, and optional `glossary`.

## License

MIT
