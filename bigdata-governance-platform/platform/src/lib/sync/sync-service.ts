// SYNC-01: Channel recommendation
export function recommendChannel(sourceType: string, targetType: string, syncMode: string) {
  const options = [
    { channel: "glue", supported: true, recommended: false, reason: "通用 ETL，支持所有 JDBC 源和目标" },
    { channel: "zero-etl", supported: false, recommended: false, reason: "" },
    { channel: "dms", supported: false, recommended: false, reason: "" },
  ];

  const isMySQL = ["mysql", "aurora-mysql"].includes(sourceType);
  const isPG = ["postgresql", "aurora-pg"].includes(sourceType);
  const toRedshift = targetType === "redshift" || targetType === "both";
  const isCDC = syncMode === "incremental";

  // Zero-ETL: MySQL/Aurora → Redshift only
  if (isMySQL && toRedshift) {
    options[1].supported = true;
    options[1].reason = "近实时同步，零运维，推荐用于 MySQL → Redshift";
    if (isCDC) { options[1].recommended = true; options[1].reason += "（增量场景最优）"; }
  } else {
    options[1].reason = `不支持: ${!isMySQL ? "仅支持 MySQL/Aurora 源" : "仅支持 Redshift 目标"}`;
  }

  // DMS: CDC scenario
  if (isMySQL || isPG || ["oracle", "sqlserver"].includes(sourceType)) {
    options[2].supported = true;
    options[2].reason = "持续 CDC 复制，适合实时增量场景";
    if (isCDC && !options[1].recommended) { options[2].recommended = true; }
  } else {
    options[2].reason = "不支持当前源类型";
  }

  // Glue: default for full sync
  if (!isCDC || (!options[1].recommended && !options[2].recommended)) {
    options[0].recommended = true;
  }

  const recommended = options.find((o) => o.recommended)!.channel;
  return { recommended, options };
}

// SYNC-02: Type mapping
const MYSQL_TO_REDSHIFT: Record<string, { type: string; compat: "compatible" | "conversion" | "truncation" }> = {
  "int": { type: "INTEGER", compat: "compatible" },
  "integer": { type: "INTEGER", compat: "compatible" },
  "tinyint": { type: "SMALLINT", compat: "compatible" },
  "smallint": { type: "SMALLINT", compat: "compatible" },
  "mediumint": { type: "INTEGER", compat: "compatible" },
  "bigint": { type: "BIGINT", compat: "compatible" },
  "float": { type: "REAL", compat: "compatible" },
  "double": { type: "DOUBLE PRECISION", compat: "compatible" },
  "decimal": { type: "DECIMAL", compat: "compatible" },
  "numeric": { type: "DECIMAL", compat: "compatible" },
  "char": { type: "CHAR", compat: "compatible" },
  "varchar": { type: "VARCHAR", compat: "compatible" },
  "tinytext": { type: "VARCHAR(256)", compat: "compatible" },
  "text": { type: "VARCHAR(65535)", compat: "compatible" },
  "mediumtext": { type: "VARCHAR(65535)", compat: "truncation" },
  "longtext": { type: "VARCHAR(65535)", compat: "truncation" },
  "date": { type: "DATE", compat: "compatible" },
  "datetime": { type: "TIMESTAMP", compat: "compatible" },
  "timestamp": { type: "TIMESTAMP", compat: "compatible" },
  "time": { type: "VARCHAR(20)", compat: "conversion" },
  "year": { type: "SMALLINT", compat: "conversion" },
  "boolean": { type: "BOOLEAN", compat: "compatible" },
  "tinyint(1)": { type: "BOOLEAN", compat: "compatible" },
  "json": { type: "SUPER", compat: "conversion" },
  "blob": { type: "VARCHAR(65535)", compat: "conversion" },
  "binary": { type: "VARCHAR(256)", compat: "conversion" },
  "enum": { type: "VARCHAR(256)", compat: "conversion" },
  "set": { type: "VARCHAR(256)", compat: "conversion" },
};

const PG_TO_REDSHIFT: Record<string, { type: string; compat: "compatible" | "conversion" | "truncation" }> = {
  "integer": { type: "INTEGER", compat: "compatible" },
  "bigint": { type: "BIGINT", compat: "compatible" },
  "smallint": { type: "SMALLINT", compat: "compatible" },
  "real": { type: "REAL", compat: "compatible" },
  "double precision": { type: "DOUBLE PRECISION", compat: "compatible" },
  "numeric": { type: "DECIMAL", compat: "compatible" },
  "decimal": { type: "DECIMAL", compat: "compatible" },
  "character varying": { type: "VARCHAR", compat: "compatible" },
  "character": { type: "CHAR", compat: "compatible" },
  "text": { type: "VARCHAR(65535)", compat: "compatible" },
  "boolean": { type: "BOOLEAN", compat: "compatible" },
  "date": { type: "DATE", compat: "compatible" },
  "timestamp without time zone": { type: "TIMESTAMP", compat: "compatible" },
  "timestamp with time zone": { type: "TIMESTAMPTZ", compat: "compatible" },
  "json": { type: "SUPER", compat: "conversion" },
  "jsonb": { type: "SUPER", compat: "conversion" },
  "uuid": { type: "VARCHAR(36)", compat: "conversion" },
  "bytea": { type: "VARCHAR(65535)", compat: "conversion" },
  "inet": { type: "VARCHAR(50)", compat: "conversion" },
  "interval": { type: "VARCHAR(50)", compat: "conversion" },
};

export function mapColumnType(sourceDb: string, sourceType: string): { targetType: string; compatibility: string } {
  const normalized = sourceType.toLowerCase().replace(/\s+/g, " ").trim();
  const baseType = normalized.replace(/\(.*\)/, "").trim();
  const sizeMatch = normalized.match(/\((\d+(?:,\d+)?)\)/);
  const size = sizeMatch ? sizeMatch[1] : "";

  const registry = sourceDb === "postgresql" ? PG_TO_REDSHIFT : MYSQL_TO_REDSHIFT;
  const mapping = registry[normalized] || registry[baseType];

  if (mapping) {
    let targetType = mapping.type;
    // Preserve size for varchar/char/decimal
    if (size && ["VARCHAR", "CHAR", "DECIMAL"].includes(mapping.type)) {
      targetType = `${mapping.type}(${size})`;
    }
    return { targetType, compatibility: mapping.compat };
  }

  return { targetType: "VARCHAR(256)", compatibility: "conversion" };
}

export function mapAllColumns(sourceDb: string, columns: { name: string; type: string }[]) {
  return columns.map((col) => {
    const { targetType, compatibility } = mapColumnType(sourceDb, col.type);
    return { source: col.name, sourceType: col.type, target: col.name, targetType, compatibility };
  });
}

// SYNC-06: Generate CREATE TABLE DDL
export function generateDDL(
  tableName: string,
  columns: { target: string; targetType: string; nullable?: boolean }[],
  config?: { distKey?: string; sortKeys?: string[]; distStyle?: string }
): string {
  const colDefs = columns.map((c) => {
    const nullable = c.nullable === false ? " NOT NULL" : "";
    return `  ${c.target} ${c.targetType}${nullable}`;
  }).join(",\n");

  let ddl = `CREATE TABLE IF NOT EXISTS ${tableName} (\n${colDefs}\n)`;

  if (config?.distStyle === "key" && config?.distKey) {
    ddl += `\nDISTKEY(${config.distKey})`;
  } else if (config?.distStyle && config.distStyle !== "auto") {
    ddl += `\nDISTSTYLE ${config.distStyle.toUpperCase()}`;
  }

  if (config?.sortKeys?.length) {
    ddl += `\nSORTKEY(${config.sortKeys.join(", ")})`;
  }

  return ddl + ";";
}
