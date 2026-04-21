export type BuiltinRdbmsDialect = "mssql" | "oracle" | "mysql" | "postgres" | "sqlite";
export type RdbmsDialect = BuiltinRdbmsDialect | (string & {});

export { alignNodePositions, type AlignCommand } from "./alignment";

export const LOGICAL_DATA_TYPES = [
  "TEXT",
  "DATE",
  "TIME",
  "DATETIME",
  "NUMBER",
  "DECIMAL",
  "FLOAT",
  "BOOLEAN",
  "JSON",
  "UUID",
  "BINARY"
] as const;

export type LogicalDataType = (typeof LOGICAL_DATA_TYPES)[number];

export interface ColumnModel {
  id: string;
  logicalName: string;
  physicalName: string;
  logicalType: LogicalDataType;
  physicalType: string;
  defaultValue?: string;
  nullable: boolean;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  referencesPrimaryColumnId?: string;
  /** FK 컬럼에서만 사용. false이면 캔버스에서 해당 FK 관계선을 숨긴다(전역 선 표시가 켜져 있을 때만 적용). */
  showFkRelationLine?: boolean;
  /** 테이블 노드에서 해당 컬럼 행 배경색 */
  color?: string;
}

export interface TableModel {
  id: string;
  logicalName: string;
  physicalName: string;
  /** Dialect-dependent schema/catalog qualifier (e.g. `public`, `dbo`). */
  schemaName?: string;
  color?: string;
  columns: ColumnModel[];
}

export interface RelationshipModel {
  id: string;
  /** 참조 원본(PK) 테이블 */
  sourceTableId: string;
  /** 참조 대상(FK) 테이블 */
  targetTableId: string;
  /** source(PK) 컬럼 id */
  sourceColumnId?: string;
  /** target(FK) 컬럼 id */
  targetColumnId?: string;
  /** 연결 시 생성된 FK 컬럼인지 여부(삭제 시 컬럼 정리용) */
  autoCreatedTargetColumn?: boolean;
  /** FK가 최초로 연결된 PK 컬럼 id(컬럼명 변경과 무관) */
  originPkColumnId?: string;
}

/**
 * 캔버스에 관계선을 그릴지 여부(전역 표시 + FK 컬럼의 라인 표시 옵션).
 */
export function isRelationshipLineRenderable(
  rel: RelationshipModel,
  model: DesignModel,
  globalLinesVisible: boolean
): boolean {
  if (!globalLinesVisible) return false;
  if (!rel.targetColumnId) return true;
  const targetTable = model.tables.find((t) => t.id === rel.targetTableId);
  const col = targetTable?.columns.find((c) => c.id === rel.targetColumnId);
  if (!col) return true;
  if (!col.isForeignKey) return true;
  return col.showFkRelationLine !== false;
}

export interface IndexModel {
  id: string;
  tableId: string;
  name: string;
  columns: string[];
  unique: boolean;
}

export interface DiagramLayout {
  nodePositions: Record<string, { x: number; y: number }>;
}

export interface DesignModel {
  dialect: RdbmsDialect;
  tables: TableModel[];
  relationships: RelationshipModel[];
  indexes: IndexModel[];
}

export interface DesignDocument {
  schemaVersion: number;
  model: DesignModel;
  layout: DiagramLayout;
  settings?: Record<string, unknown>;
}

export interface DialectCapability {
  supportsSchema: boolean;
}

export type DdlStyleQuote = "double" | "backtick" | "bracket";
export type DdlStyleBooleanLiteral = "trueFalse" | "oneZero";

export interface DdlStyle {
  quote: DdlStyleQuote;
  boolLiteral?: DdlStyleBooleanLiteral;
  nowKeyword?: string;
}

export interface LogicalTypeMeta {
  id: LogicalDataType;
  label?: string;
  defaultPhysicalType: string;
}

export interface DialectMetaJson {
  id: RdbmsDialect;
  label: string;
  supportsSchema: boolean;
  logicalTypes: LogicalTypeMeta[];
  ddlStyle?: DdlStyle;
}

export interface DialectMeta {
  id: RdbmsDialect;
  label: string;
  capabilities: DialectCapability;
  logicalTypes: readonly LogicalDataType[];
  defaultPhysicalTypeMap: Partial<Record<LogicalDataType, string>>;
}

export type DdlScope = { kind: "all" } | { kind: "selected"; tableIds: string[] };

export interface DdlGenerateInput {
  doc: DesignDocument;
  dialectId: RdbmsDialect;
  scope: DdlScope;
}

export interface DdlGenerateOutput {
  sql: string;
  diagnostics?: DdlDiagnostic[];
}

export type DdlGeneratorHook = (input: DdlGenerateInput) => DdlGenerateOutput | Promise<DdlGenerateOutput>;

export interface DdlGeneratorRules {
  quoteIdentifier?: (dialect: RdbmsDialect, identifier: string) => string;
  toDefaultExpression?: (dialect: RdbmsDialect, col: ColumnModel) => string | null;
}

export interface DbMetaAdapter {
  listDialects: () => DialectMeta[];
  getDialectMeta: (dialect: RdbmsDialect) => DialectMeta | undefined;
  getDefaultPhysicalType: (dialect: RdbmsDialect, logicalType: LogicalDataType) => string;
  getDdlRules: (dialect: RdbmsDialect) => DdlGeneratorRules;
}

export interface CoreDbMetaOptions {
  dbMetaAdapter?: DbMetaAdapter;
  hostMetas?: DialectMetaJson[];
  hostDdlGenerators?: Record<string, DdlGeneratorHook>;
  fallbackOnHookError?: boolean;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export const BUILTIN_DIALECTS: readonly BuiltinRdbmsDialect[] = ["mssql", "oracle", "mysql", "postgres", "sqlite"] as const;

const DIALECT_DEFAULT_TYPE_MAP: Record<BuiltinRdbmsDialect, Record<LogicalDataType, string>> = {
  mssql: {
    TEXT: "NVARCHAR(255)",
    DATE: "DATE",
    TIME: "TIME",
    DATETIME: "DATETIME2",
    NUMBER: "INT",
    DECIMAL: "DECIMAL(10,2)",
    FLOAT: "FLOAT",
    BOOLEAN: "BIT",
    JSON: "NVARCHAR(MAX)",
    UUID: "UNIQUEIDENTIFIER",
    BINARY: "VARBINARY(255)"
  },
  oracle: {
    TEXT: "VARCHAR2(255)",
    DATE: "DATE",
    TIME: "TIMESTAMP",
    DATETIME: "TIMESTAMP",
    NUMBER: "NUMBER(10)",
    DECIMAL: "NUMBER(10,2)",
    FLOAT: "BINARY_FLOAT",
    BOOLEAN: "NUMBER(1)",
    JSON: "CLOB",
    UUID: "RAW(16)",
    BINARY: "RAW(255)"
  },
  mysql: {
    TEXT: "VARCHAR(255)",
    DATE: "DATE",
    TIME: "TIME",
    DATETIME: "DATETIME",
    NUMBER: "INT",
    DECIMAL: "DECIMAL(10,2)",
    FLOAT: "FLOAT",
    BOOLEAN: "BOOLEAN",
    JSON: "JSON",
    UUID: "CHAR(36)",
    BINARY: "VARBINARY(255)"
  },
  postgres: {
    TEXT: "VARCHAR(255)",
    DATE: "DATE",
    TIME: "TIME",
    DATETIME: "TIMESTAMP",
    NUMBER: "INTEGER",
    DECIMAL: "NUMERIC(10,2)",
    FLOAT: "REAL",
    BOOLEAN: "BOOLEAN",
    JSON: "JSONB",
    UUID: "UUID",
    BINARY: "BYTEA"
  },
  sqlite: {
    TEXT: "TEXT",
    DATE: "TEXT",
    TIME: "TEXT",
    DATETIME: "TEXT",
    NUMBER: "INTEGER",
    DECIMAL: "NUMERIC(10,2)",
    FLOAT: "REAL",
    BOOLEAN: "INTEGER",
    JSON: "TEXT",
    UUID: "TEXT",
    BINARY: "BLOB"
  }
};

const DIALECT_CAPABILITIES: Record<BuiltinRdbmsDialect, { supportsSchema: boolean }> = {
  mssql: { supportsSchema: true },
  oracle: { supportsSchema: true },
  mysql: { supportsSchema: true },
  postgres: { supportsSchema: true },
  sqlite: { supportsSchema: false }
};

const DIALECT_LABELS: Record<BuiltinRdbmsDialect, string> = {
  mssql: "MS SQL Server",
  oracle: "Oracle",
  mysql: "MySQL",
  postgres: "PostgreSQL",
  sqlite: "SQLite"
};

const DIALECT_DDL_STYLE: Record<BuiltinRdbmsDialect, DdlStyle> = {
  mssql: { quote: "bracket", boolLiteral: "oneZero", nowKeyword: "GETDATE()" },
  oracle: { quote: "double", boolLiteral: "oneZero", nowKeyword: "CURRENT_TIMESTAMP" },
  mysql: { quote: "backtick", boolLiteral: "oneZero", nowKeyword: "CURRENT_TIMESTAMP" },
  postgres: { quote: "double", boolLiteral: "trueFalse", nowKeyword: "CURRENT_TIMESTAMP" },
  sqlite: { quote: "double", boolLiteral: "oneZero", nowKeyword: "CURRENT_TIMESTAMP" }
};

function toLogicalTypeMetas(dialect: BuiltinRdbmsDialect): LogicalTypeMeta[] {
  return LOGICAL_DATA_TYPES.map((id) => ({
    id,
    defaultPhysicalType: DIALECT_DEFAULT_TYPE_MAP[dialect][id]
  }));
}

export const BUILTIN_DIALECT_METAS_JSON: DialectMetaJson[] = BUILTIN_DIALECTS.map((dialect) => ({
  id: dialect,
  label: DIALECT_LABELS[dialect],
  supportsSchema: DIALECT_CAPABILITIES[dialect].supportsSchema,
  logicalTypes: toLogicalTypeMetas(dialect),
  ddlStyle: DIALECT_DDL_STYLE[dialect]
}));

function defaultDdlRules(): DdlGeneratorRules {
  return {
    quoteIdentifier: (dialect, identifier) => {
      if (dialect === "mssql") return `[${identifier}]`;
      if (dialect === "mysql") return `\`${identifier}\``;
      return `"${identifier}"`;
    },
    toDefaultExpression: (dialect, col) => {
      const raw = col.defaultValue?.trim();
      if (!raw) return null;
      const upper = raw.toUpperCase();
      const isFunctionLike = /[()]/.test(raw) || upper === "NULL" || upper === "CURRENT_TIMESTAMP" || upper === "CURRENT_DATE";
      if (isFunctionLike) return raw;
      if (col.logicalType === "NUMBER" || col.logicalType === "DECIMAL" || col.logicalType === "FLOAT") return raw;
      if (col.logicalType === "BOOLEAN") {
        if (upper === "TRUE" || upper === "FALSE") {
          if (dialect === "mssql" || dialect === "oracle" || dialect === "sqlite") return upper === "TRUE" ? "1" : "0";
          return upper;
        }
        if (raw === "1" || raw === "0") return raw;
        return quoteSqlString(raw);
      }
      if (col.logicalType === "DATE" || col.logicalType === "DATETIME") {
        if (dialect === "mssql" && upper === "NOW") return "GETDATE()";
        if (upper === "NOW") return "CURRENT_TIMESTAMP";
        return quoteSqlString(raw);
      }
      if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) return raw;
      return quoteSqlString(raw);
    }
  };
}

function toAdapterDialectMeta(meta: DialectMetaJson): DialectMeta {
  const typeMap: Partial<Record<LogicalDataType, string>> = {};
  for (const lt of meta.logicalTypes) typeMap[lt.id] = lt.defaultPhysicalType;
  return {
    id: meta.id,
    label: meta.label,
    capabilities: { supportsSchema: meta.supportsSchema },
    logicalTypes: meta.logicalTypes.map((lt) => lt.id),
    defaultPhysicalTypeMap: typeMap
  };
}

export function mergeDialectMetas(base: DialectMetaJson[], host: DialectMetaJson[] = []): DialectMetaJson[] {
  const byId = new Map<string, DialectMetaJson>(base.map((meta) => [meta.id, meta]));
  for (const meta of host) byId.set(meta.id, meta);
  return Array.from(byId.values());
}

export function resolveDialectMetas(options?: CoreDbMetaOptions): DialectMetaJson[] {
  return mergeDialectMetas(BUILTIN_DIALECT_METAS_JSON, options?.hostMetas ?? []);
}

function buildDbMetaAdapterFromMetas(metas: DialectMetaJson[]): DbMetaAdapter {
  const byId = new Map<RdbmsDialect, DialectMeta>(metas.map((meta) => [meta.id, toAdapterDialectMeta(meta)]));
  const defaultRules = defaultDdlRules();
  return {
    listDialects: () => Array.from(byId.values()),
    getDialectMeta: (dialect) => byId.get(dialect),
    getDefaultPhysicalType: (dialect, logicalType) => {
      const mapped = byId.get(dialect)?.defaultPhysicalTypeMap[logicalType];
      return mapped ?? DIALECT_DEFAULT_TYPE_MAP.postgres[logicalType];
    },
    getDdlRules: (dialect) => {
      const json = metas.find((m) => m.id === dialect);
      const style = json?.ddlStyle;
      if (!style) return defaultRules;
      const quoteIdentifier: DdlGeneratorRules["quoteIdentifier"] = (_d, identifier) => {
        if (style.quote === "bracket") return `[${identifier}]`;
        if (style.quote === "backtick") return `\`${identifier}\``;
        return `"${identifier}"`;
      };
      const toDefaultExpression: DdlGeneratorRules["toDefaultExpression"] = (_d, col) => {
        const raw = col.defaultValue?.trim();
        if (!raw) return null;
        const upper = raw.toUpperCase();
        const isFunctionLike =
          /[()]/.test(raw) || upper === "NULL" || upper === "CURRENT_TIMESTAMP" || upper === "CURRENT_DATE";
        if (isFunctionLike) return raw;
        if (col.logicalType === "NUMBER" || col.logicalType === "DECIMAL" || col.logicalType === "FLOAT") return raw;
        if (col.logicalType === "BOOLEAN") {
          if (upper === "TRUE" || upper === "FALSE") {
            if ((style.boolLiteral ?? "oneZero") === "oneZero") return upper === "TRUE" ? "1" : "0";
            return upper;
          }
          if (raw === "1" || raw === "0") return raw;
          return quoteSqlString(raw);
        }
        if (col.logicalType === "DATE" || col.logicalType === "DATETIME") {
          if (upper === "NOW") return style.nowKeyword ?? "CURRENT_TIMESTAMP";
          return quoteSqlString(raw);
        }
        if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) return raw;
        return quoteSqlString(raw);
      };
      return { quoteIdentifier, toDefaultExpression };
    }
  };
}

export function createDefaultDbMetaAdapter(overrides?: Partial<DbMetaAdapter>): DbMetaAdapter {
  const base = buildDbMetaAdapterFromMetas(BUILTIN_DIALECT_METAS_JSON);
  return { ...base, ...overrides };
}

export const defaultDbMetaAdapter = createDefaultDbMetaAdapter();

function resolveDbMetaAdapter(options?: CoreDbMetaOptions): DbMetaAdapter {
  if (options?.dbMetaAdapter) return options.dbMetaAdapter;
  if (options?.hostMetas && options.hostMetas.length > 0) {
    return buildDbMetaAdapterFromMetas(resolveDialectMetas(options));
  }
  return defaultDbMetaAdapter;
}

export function defaultPhysicalType(dialect: RdbmsDialect, logicalType: LogicalDataType, options?: CoreDbMetaOptions): string {
  return resolveDbMetaAdapter(options).getDefaultPhysicalType(dialect, logicalType);
}

export function getRdbmsDialectCapability(dialect: RdbmsDialect, options?: CoreDbMetaOptions): DialectCapability {
  const meta = resolveDbMetaAdapter(options).getDialectMeta(dialect);
  return meta?.capabilities ?? { supportsSchema: false };
}

export function dialectSupportsSchema(dialect: RdbmsDialect, options?: CoreDbMetaOptions): boolean {
  return getRdbmsDialectCapability(dialect, options).supportsSchema;
}

function parseTypeArguments(physicalType: string): number[] | null {
  const m = physicalType.match(/\(([^)]+)\)/);
  if (!m) return null;
  const values = m[1]
    .split(",")
    .map((v) => Number.parseInt(v.trim(), 10))
    .filter((v) => Number.isFinite(v));
  return values.length > 0 ? values : null;
}

function convertPhysicalTypeByLogicalType(
  physicalType: string,
  logicalType: LogicalDataType,
  nextDialect: RdbmsDialect,
  options?: CoreDbMetaOptions
): string {
  const args = parseTypeArguments(physicalType);
  const precision = args?.[0];
  const scale = args?.[1];
  const length = args?.[0];

  if (logicalType === "NUMBER") {
    if (nextDialect === "oracle") {
      if (precision && scale !== undefined) return `NUMBER(${precision},${scale})`;
      if (precision) return `NUMBER(${precision})`;
      return "NUMBER(10)";
    }
    if (nextDialect === "mssql") {
      if (precision && scale !== undefined) return `NUMERIC(${precision},${scale})`;
      if (precision) return `NUMERIC(${precision},0)`;
      return "INT";
    }
    if (nextDialect === "mysql") {
      if (precision && scale !== undefined) return `DECIMAL(${precision},${scale})`;
      if (precision) return `DECIMAL(${precision},0)`;
      return "INT";
    }
    if (nextDialect === "postgres") {
      if (precision && scale !== undefined) return `NUMERIC(${precision},${scale})`;
      if (precision) return `NUMERIC(${precision},0)`;
      return "INTEGER";
    }
    return "INTEGER";
  }

  if (logicalType === "DECIMAL") {
    if (precision && scale !== undefined) {
      if (nextDialect === "oracle") return `NUMBER(${precision},${scale})`;
      if (nextDialect === "postgres") return `NUMERIC(${precision},${scale})`;
      return `DECIMAL(${precision},${scale})`;
    }
    return defaultPhysicalType(nextDialect, logicalType, options);
  }

  if (logicalType === "FLOAT") {
    if (nextDialect === "oracle") return "BINARY_FLOAT";
    if (nextDialect === "sqlite") return "REAL";
    return "FLOAT";
  }

  if (logicalType === "TEXT") {
    if (nextDialect === "oracle") return length ? `VARCHAR2(${length})` : "VARCHAR2(255)";
    if (nextDialect === "mssql") return length ? `NVARCHAR(${length})` : "NVARCHAR(255)";
    if (nextDialect === "mysql") return length ? `VARCHAR(${length})` : "VARCHAR(255)";
    if (nextDialect === "postgres") return length ? `VARCHAR(${length})` : "VARCHAR(255)";
    return "TEXT";
  }

  if (logicalType === "BINARY") {
    if (nextDialect === "mssql") return length ? `VARBINARY(${length})` : "VARBINARY(255)";
    if (nextDialect === "oracle") return length ? `RAW(${length})` : "RAW(255)";
    if (nextDialect === "mysql") return length ? `VARBINARY(${length})` : "VARBINARY(255)";
    if (nextDialect === "postgres") return "BYTEA";
    return "BLOB";
  }

  return defaultPhysicalType(nextDialect, logicalType, options);
}

export function convertDesignDialect(doc: DesignDocument, nextDialect: RdbmsDialect, options?: CoreDbMetaOptions): DesignDocument {
  if (doc.model.dialect === nextDialect) return doc;
  const supportsSchema = dialectSupportsSchema(nextDialect, options);
  return {
    ...doc,
    model: {
      ...doc.model,
      dialect: nextDialect,
      tables: doc.model.tables.map((table) => ({
        ...table,
        schemaName: supportsSchema ? table.schemaName : undefined,
        columns: table.columns.map((col) => ({
          ...col,
          physicalType: convertPhysicalTypeByLogicalType(col.physicalType, col.logicalType, nextDialect, options)
        }))
      }))
    }
  };
}

export function applyLogicalTypeChange(
  column: ColumnModel,
  nextLogicalType: LogicalDataType,
  dialect: RdbmsDialect,
  options?: CoreDbMetaOptions
): ColumnModel {
  return {
    ...column,
    logicalType: nextLogicalType,
    physicalType: defaultPhysicalType(dialect, nextLogicalType, options)
  };
}

export function createColumn(
  dialect: RdbmsDialect,
  params: {
    id: string;
    logicalName: string;
    /** 생략 시 논리 이름과 동일한 물리 이름으로 생성된다. */
    physicalName?: string;
    logicalType: LogicalDataType;
    defaultValue?: string;
    nullable?: boolean;
    isPrimaryKey?: boolean;
    isForeignKey?: boolean;
    referencesPrimaryColumnId?: string;
    showFkRelationLine?: boolean;
    color?: string;
  },
  options?: CoreDbMetaOptions
): ColumnModel {
  const physicalName = params.physicalName ?? params.logicalName;
  const isPrimaryKey = params.isPrimaryKey ?? false;
  const isForeignKey = params.isForeignKey ?? false;
  const col: ColumnModel = {
    id: params.id,
    logicalName: params.logicalName,
    physicalName,
    logicalType: params.logicalType,
    physicalType: defaultPhysicalType(dialect, params.logicalType, options),
    defaultValue: params.defaultValue,
    nullable: isPrimaryKey ? false : (params.nullable ?? true),
    isPrimaryKey,
    isForeignKey,
    referencesPrimaryColumnId: params.referencesPrimaryColumnId
  };
  if (params.color !== undefined) col.color = params.color;
  if (isForeignKey && params.showFkRelationLine === false) col.showFkRelationLine = false;
  return col;
}

export function createEmptyDesign(dialect: RdbmsDialect = "mssql"): DesignDocument {
  return {
    schemaVersion: 1,
    model: {
      dialect,
      tables: [],
      relationships: [],
      indexes: []
    },
    layout: {
      nodePositions: {}
    }
  };
}

export function serializeDesign(doc: DesignDocument): string {
  return JSON.stringify(doc, null, 2);
}

export function parseDesign(json: string, options?: CoreDbMetaOptions): DesignDocument {
  const parsed = JSON.parse(json) as unknown;
  return validateDesignDocument(parsed, options);
}

export function validateDesignDocument(input: unknown, options?: CoreDbMetaOptions): DesignDocument {
  if (!isObject(input)) {
    throw new Error("Invalid design document: root must be object");
  }

  if (input.schemaVersion !== 1) {
    throw new Error("Unsupported schemaVersion");
  }

  if (!isObject(input.model) || !Array.isArray(input.model.tables) || !Array.isArray(input.model.relationships) || !Array.isArray(input.model.indexes)) {
    throw new Error("Invalid design document: model is malformed");
  }

  const dialects = new Set(resolveDbMetaAdapter(options).listDialects().map((d) => d.id));
  const modelDialect = (input.model as unknown as { dialect?: unknown }).dialect;
  if (typeof modelDialect !== "string" || !dialects.has(modelDialect as RdbmsDialect)) {
    throw new Error("Invalid design document: model.dialect is invalid");
  }

  if (!isObject(input.layout) || !isObject(input.layout.nodePositions)) {
    throw new Error("Invalid design document: layout is malformed");
  }

  return input as unknown as DesignDocument;
}

export function roundTripDesign(doc: DesignDocument): DesignDocument {
  return parseDesign(serializeDesign(doc));
}

function quoteIdentifier(dialect: RdbmsDialect, identifier: string, options?: CoreDbMetaOptions): string {
  const quote = resolveDbMetaAdapter(options).getDdlRules(dialect).quoteIdentifier ?? defaultDdlRules().quoteIdentifier!;
  return quote(dialect, identifier);
}

function qualifiedTableName(table: TableModel, dialect: RdbmsDialect, options?: CoreDbMetaOptions): string {
  const schema = table.schemaName?.trim();
  if (dialectSupportsSchema(dialect, options) && schema) {
    return `${quoteIdentifier(dialect, schema, options)}.${quoteIdentifier(dialect, table.physicalName, options)}`;
  }
  return quoteIdentifier(dialect, table.physicalName, options);
}

function quoteSqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function toDefaultExpression(dialect: RdbmsDialect, col: ColumnModel, options?: CoreDbMetaOptions): string | null {
  const handler = resolveDbMetaAdapter(options).getDdlRules(dialect).toDefaultExpression ?? defaultDdlRules().toDefaultExpression!;
  return handler(dialect, col);
}

function joinColumnDefs(table: TableModel, dialect: RdbmsDialect, options?: CoreDbMetaOptions): string[] {
  const defs = table.columns.map((col) => {
    const nullable = col.nullable ? "NULL" : "NOT NULL";
    const defaultExpr = toDefaultExpression(dialect, col, options);
    const defaultSql = defaultExpr ? ` DEFAULT ${defaultExpr}` : "";
    return `  ${quoteIdentifier(dialect, col.physicalName, options)} ${col.physicalType}${defaultSql} ${nullable}`;
  });
  const pkColumns = table.columns.filter((col) => col.isPrimaryKey).map((col) => quoteIdentifier(dialect, col.physicalName, options));
  if (pkColumns.length > 0) {
    defs.push(`  PRIMARY KEY (${pkColumns.join(", ")})`);
  }
  return defs;
}

function createTableSql(table: TableModel, dialect: RdbmsDialect, options?: CoreDbMetaOptions): string {
  const columns = joinColumnDefs(table, dialect, options);
  return `CREATE TABLE ${qualifiedTableName(table, dialect, options)} (\n${columns.join(",\n")}\n);`;
}

function createRelationshipSql(
  rel: RelationshipModel,
  model: DesignModel,
  dialect: RdbmsDialect,
  index: number,
  options?: CoreDbMetaOptions
): string | null {
  const sourceTable = model.tables.find((table) => table.id === rel.sourceTableId);
  const targetTable = model.tables.find((table) => table.id === rel.targetTableId);
  if (!sourceTable || !targetTable || !rel.sourceColumnId || !rel.targetColumnId) {
    return null;
  }

  const sourceColumn = sourceTable.columns.find((col) => col.id === rel.sourceColumnId);
  const targetColumn = targetTable.columns.find((col) => col.id === rel.targetColumnId);
  if (!sourceColumn || !targetColumn) {
    return null;
  }

  const fkName = `FK_${targetTable.physicalName}_${sourceTable.physicalName}_${index + 1}`;
  return [
    `ALTER TABLE ${qualifiedTableName(targetTable, dialect, options)}`,
    `  ADD CONSTRAINT ${quoteIdentifier(dialect, fkName, options)}`,
    `  FOREIGN KEY (${quoteIdentifier(dialect, targetColumn.physicalName, options)})`,
    `  REFERENCES ${qualifiedTableName(sourceTable, dialect, options)} (${quoteIdentifier(dialect, sourceColumn.physicalName, options)});`
  ].join("\n");
}

function createIndexSql(indexModel: IndexModel, model: DesignModel, dialect: RdbmsDialect, options?: CoreDbMetaOptions): string | null {
  const table = model.tables.find((item) => item.id === indexModel.tableId);
  if (!table || indexModel.columns.length === 0) {
    return null;
  }
  const unique = indexModel.unique ? "UNIQUE " : "";
  const columns = indexModel.columns.map((col) => quoteIdentifier(dialect, col, options)).join(", ");
  return `CREATE ${unique}INDEX ${quoteIdentifier(dialect, indexModel.name, options)} ON ${qualifiedTableName(table, dialect, options)} (${columns});`;
}

function buildDdlSql(doc: DesignDocument, options?: CoreDbMetaOptions): string {
  const { model } = doc;
  const tableSql = model.tables.map((table) => createTableSql(table, model.dialect, options));
  const relSql = model.relationships
    .map((rel, index) => createRelationshipSql(rel, model, model.dialect, index, options))
    .filter((item): item is string => Boolean(item));
  return [...tableSql, ...relSql].join("\n\n");
}

function buildIndexDdlSql(doc: DesignDocument, options?: CoreDbMetaOptions): string {
  const { model } = doc;
  const statements = model.indexes
    .map((index) => createIndexSql(index, model, model.dialect, options))
    .filter((item): item is string => Boolean(item));
  return statements.join("\n\n");
}

function sliceDocByScope(doc: DesignDocument, scope: DdlScope): DesignDocument {
  if (scope.kind === "all") return doc;
  const selected = new Set(scope.tableIds);
  return {
    ...doc,
    model: {
      ...doc.model,
      tables: doc.model.tables.filter((t) => selected.has(t.id)),
      relationships: doc.model.relationships.filter((r) => selected.has(r.sourceTableId) && selected.has(r.targetTableId)),
      indexes: doc.model.indexes.filter((i) => selected.has(i.tableId))
    }
  };
}

function styleBasedDdlGenerator(input: DdlGenerateInput, options?: CoreDbMetaOptions): DdlGenerateOutput {
  const scoped = sliceDocByScope(input.doc, input.scope);
  return {
    sql: buildDdlSql(scoped, options),
    diagnostics: analyzeDdlDocument(scoped, options)
  };
}

function hasBuiltinDialect(dialectId: RdbmsDialect): dialectId is BuiltinRdbmsDialect {
  return (BUILTIN_DIALECTS as readonly string[]).includes(dialectId);
}

function getBuiltinDdlGenerator(dialectId: RdbmsDialect, _options?: CoreDbMetaOptions): DdlGeneratorHook | undefined {
  if (!hasBuiltinDialect(dialectId)) return undefined;
  return (input) => styleBasedDdlGenerator(input, _options);
}

function invokeDdlGeneratorSync(generator: DdlGeneratorHook, input: DdlGenerateInput): DdlGenerateOutput {
  const result = generator(input);
  if (result && typeof (result as Promise<DdlGenerateOutput>).then === "function") {
    throw new Error("Async DDL generator is not supported in sync API");
  }
  return result as DdlGenerateOutput;
}

function runDdlGenerator(doc: DesignDocument, scope: DdlScope, options?: CoreDbMetaOptions): DdlGenerateOutput {
  const input: DdlGenerateInput = { doc, dialectId: doc.model.dialect, scope };
  const hostGenerator = options?.hostDdlGenerators?.[doc.model.dialect];
  const builtinGenerator = getBuiltinDdlGenerator(doc.model.dialect, options);
  const fallback = () => styleBasedDdlGenerator(input, options);
  const fallbackOnError = options?.fallbackOnHookError ?? true;

  const selectedGenerator = hostGenerator ?? builtinGenerator;
  if (!selectedGenerator) return fallback();
  try {
    return invokeDdlGeneratorSync(selectedGenerator, input);
  } catch (error) {
    if (!fallbackOnError) throw error;
    return fallback();
  }
}

/** DDL/인덱스 분석 공통 심각도 */
export type DdlDiagnosticSeverity = "error" | "warning";

/** 구조화된 DDL 관련 진단(에러·경고) */
export interface DdlDiagnostic {
  severity: DdlDiagnosticSeverity;
  code: string;
  message: string;
  /** 예: relationship:rel1, index:ix1, table:t1 */
  context?: string;
}

/**
 * 통일된 한 줄 텍스트 포맷.
 * 예: `[WARN][DDL_REL_MISSING_COLUMNS] ... | relationship:rel1`
 */
export function formatDdlDiagnostic(d: DdlDiagnostic): string {
  const level = d.severity === "error" ? "ERROR" : "WARN";
  const tail = d.context ? ` | ${d.context}` : "";
  return `[${level}][${d.code}] ${d.message}${tail}`;
}

export function formatDdlDiagnostics(diagnostics: DdlDiagnostic[]): string {
  return diagnostics.map(formatDdlDiagnostic).join("\n");
}

/**
 * 모델 전체에 대한 DDL·인덱스 관련 진단(테이블/관계/인덱스).
 * 검증 예외(Invalid design document)와는 별도로, 생성 가능 여부와 경고를 나열한다.
 */
export function analyzeDdlDocument(doc: DesignDocument, options?: CoreDbMetaOptions): DdlDiagnostic[] {
  const out: DdlDiagnostic[] = [];
  const { model } = doc;
  const tableById = new Map(model.tables.map((t) => [t.id, t]));
  const physicalTableNames = new Map<string, string[]>();

  for (const table of model.tables) {
    const qualifiedName = dialectSupportsSchema(model.dialect, options) && table.schemaName?.trim()
      ? `${table.schemaName.trim()}.${table.physicalName}`
      : table.physicalName;
    const list = physicalTableNames.get(qualifiedName) ?? [];
    list.push(table.id);
    physicalTableNames.set(qualifiedName, list);
    if (table.columns.length === 0) {
      out.push({
        severity: "warning",
        code: "DDL_EMPTY_TABLE",
        message: "컬럼이 없는 테이블은 CREATE TABLE 구문이 비어 있거나 무의미할 수 있다.",
        context: `table:${table.id}`
      });
    }
  }

  for (const [name, ids] of physicalTableNames) {
    if (ids.length > 1) {
      out.push({
        severity: "warning",
        code: "DDL_DUPLICATE_TABLE_NAME",
        message: `동일한 물리 테이블명 "${name}"이 ${ids.length}개 테이블에 사용되었다.`,
        context: `tables:${ids.join(",")}`
      });
    }
  }

  for (const rel of model.relationships) {
    const ctx = `relationship:${rel.id}`;
    const sourceTable = tableById.get(rel.sourceTableId);
    const targetTable = tableById.get(rel.targetTableId);
    if (!sourceTable || !targetTable) {
      out.push({
        severity: "error",
        code: "DDL_REL_UNKNOWN_TABLE",
        message: "관계의 소스 또는 타겟 테이블을 찾을 수 없어 FK DDL을 생성할 수 없다.",
        context: ctx
      });
      continue;
    }
    if (!rel.sourceColumnId || !rel.targetColumnId) {
      out.push({
        severity: "warning",
        code: "DDL_REL_MISSING_COLUMNS",
        message: "소스/타겟 컬럼이 지정되지 않아 FK DDL을 생략한다.",
        context: ctx
      });
      continue;
    }
    const sourceColumn = sourceTable.columns.find((c) => c.id === rel.sourceColumnId);
    const targetColumn = targetTable.columns.find((c) => c.id === rel.targetColumnId);
    if (!sourceColumn || !targetColumn) {
      out.push({
        severity: "warning",
        code: "DDL_REL_UNKNOWN_COLUMN",
        message: "관계에 지정된 컬럼 id를 테이블에서 찾을 수 없어 FK DDL을 생략한다.",
        context: ctx
      });
    }
  }

  for (const indexModel of model.indexes) {
    const ctx = `index:${indexModel.id}`;
    const table = tableById.get(indexModel.tableId);
    if (!table) {
      out.push({
        severity: "warning",
        code: "IDX_UNKNOWN_TABLE",
        message: "인덱스가 가리키는 테이블을 찾을 수 없어 인덱스 DDL을 생략한다.",
        context: ctx
      });
      continue;
    }
    if (indexModel.columns.length === 0) {
      out.push({
        severity: "warning",
        code: "IDX_EMPTY_COLUMNS",
        message: "인덱스 컬럼 목록이 비어 있어 인덱스 DDL을 생략한다.",
        context: ctx
      });
      continue;
    }
    for (const colPhys of indexModel.columns) {
      if (!table.columns.some((c) => c.physicalName === colPhys)) {
        out.push({
          severity: "warning",
          code: "IDX_UNKNOWN_COLUMN",
          message: `인덱스가 참조하는 물리 컬럼명 "${colPhys}"을(를) 테이블 "${table.physicalName}"에서 찾을 수 없다.`,
          context: ctx
        });
      }
    }
  }

  return out;
}

export function generateDdlWithDiagnostics(doc: DesignDocument, options?: CoreDbMetaOptions): { sql: string; diagnostics: DdlDiagnostic[] } {
  const out = runDdlGenerator(doc, { kind: "all" }, options);
  return { sql: out.sql, diagnostics: out.diagnostics ?? analyzeDdlDocument(doc, options) };
}

export function generateIndexDdlWithDiagnostics(doc: DesignDocument, options?: CoreDbMetaOptions): { sql: string; diagnostics: DdlDiagnostic[] } {
  return { sql: buildIndexDdlSql(doc, options), diagnostics: analyzeDdlDocument(doc, options) };
}

export function generateDdl(doc: DesignDocument, options?: CoreDbMetaOptions): string {
  return runDdlGenerator(doc, { kind: "all" }, options).sql;
}

export function generateDdlForSelection(
  doc: DesignDocument,
  tableIds: string[],
  options?: CoreDbMetaOptions
): { sql: string; diagnostics: DdlDiagnostic[] } {
  const out = runDdlGenerator(doc, { kind: "selected", tableIds }, options);
  const diagnostics = out.diagnostics ?? analyzeDdlDocument(sliceDocByScope(doc, { kind: "selected", tableIds }), options);
  return { sql: out.sql, diagnostics };
}

export function generateIndexDdl(doc: DesignDocument, options?: CoreDbMetaOptions): string {
  return buildIndexDdlSql(doc, options);
}

/** 성능·부하 테스트용: 지정 개수의 빈 테이블과 격자 레이아웃을 생성한다. */
export function createLargeDesign(tableCount: number, dialect: RdbmsDialect = "postgres"): DesignDocument {
  const doc = createEmptyDesign(dialect);
  const cols = 20;
  for (let i = 0; i < tableCount; i++) {
    const id = `t-${i}`;
    doc.model.tables.push({
      id,
      logicalName: `엔티티${i}`,
      physicalName: `TB_T${i}`,
      columns: [
        createColumn(dialect, {
          id: `${id}-pk`,
          logicalName: "식별자",
          logicalType: "NUMBER",
          nullable: false
        })
      ]
    });
    doc.layout.nodePositions[id] = {
      x: (i % cols) * 220,
      y: Math.floor(i / cols) * 120
    };
  }
  return doc;
}
