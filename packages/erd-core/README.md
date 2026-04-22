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
      isPrimaryKey: true
    })
  ]
});

console.log(generateDdl(doc));
```

## Core Concepts

- `DesignDocument`: ER JSON source of truth
- `RdbmsDialect`: dialect id stored in document
- `LogicalDataType`: normalized logical type ids
- `DialectMetaJson`: host-overridable per-dialect metadata
- `DdlGeneratorHook`: optional per-dialect SQL generation hook

## Relationship Model Notes

`RelationshipModel` supports canvas-specific rendering state used by the designer:

- `cardinality?: "1:1" | "1:N"`
- `canvasLineHidden?: boolean`
- `linePivotRatio?: number` (middle vertical segment ratio)
- `sourceLineY?: number` (source edge absolute Y inside table)
- `sourceLineRatio?: number` (legacy fallback; kept for compatibility)

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
        { id: "NUMBER", defaultPhysicalType: "INT64" }
      ],
      ddlStyle: { quote: "double", boolLiteral: "oneZero" }
    }
  ]
});
```

### 2) Optional per-dialect DDL function hook

If a dialect DDL is complex, provide a function in `hostDdlGenerators`.
If omitted, style-based builtin SQL generation is used.

```ts
import { generateDdlForSelection, type DdlGenerateInput } from "@rdbms-erd/core";

const sql = generateDdlForSelection(doc, ["table-users"], {
  hostDdlGenerators: {
    acme: (input: DdlGenerateInput) => {
      // input.scope.kind: "all" | "selected"
      return { sql: "-- custom acme ddl" };
    }
  },
  fallbackOnHookError: true
}).sql;
```

## Main APIs

- Document lifecycle:
  - `createEmptyDesign`
  - `serializeDesign`, `parseDesign`, `validateDesignDocument`, `roundTripDesign`
- Type defaults:
  - `defaultPhysicalType`
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
- `DesignDocument` stores only dialect id and model data.

## License

MIT
