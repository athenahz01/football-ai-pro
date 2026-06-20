import "server-only";

import { executeSqlInReadOnlyTransaction } from "@/lib/sql/executor";

type SchemaCommentRow = {
  table_name: string;
  column_name: string | null;
  ordinal_position: number | null;
  data_type: string | null;
  table_comment: string | null;
  column_comment: string | null;
};

const TABLES_IN_PROMPT = [
  "competitions",
  "teams",
  "players",
  "player_teams",
  "matches",
  "match_events",
  "spadl_actions",
  "action_values",
  "shot_xg",
  "player_metric_totals",
  "team_metric_totals",
  "team_ratings",
  "match_predictions",
  "glossary_terms",
];

let schemaContextPromise: Promise<string> | undefined;

export function getSchemaContext(): Promise<string> {
  schemaContextPromise ??= loadSchemaContext();
  return schemaContextPromise;
}

async function loadSchemaContext(): Promise<string> {
  const result = await executeSqlInReadOnlyTransaction(
    `
      select
        c.relname as table_name,
        a.attname as column_name,
        a.attnum as ordinal_position,
        format_type(a.atttypid, a.atttypmod) as data_type,
        obj_description(c.oid, 'pg_class') as table_comment,
        col_description(c.oid, a.attnum) as column_comment
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      left join pg_attribute a
        on a.attrelid = c.oid
        and a.attnum > 0
        and not a.attisdropped
      where n.nspname = 'public'
        and c.relkind in ('r', 'v', 'm')
        and c.relname = any($1)
      order by c.relname, a.attnum
    `,
    1_000,
    5_000,
    [TABLES_IN_PROMPT],
  );

  if (!result.ok) {
    throw new Error(result.message);
  }

  return formatSchemaRows(result.rows as unknown as SchemaCommentRow[]);
}

function formatSchemaRows(rows: SchemaCommentRow[]): string {
  const rowsByTable = new Map<string, SchemaCommentRow[]>();

  for (const row of rows) {
    const tableRows = rowsByTable.get(row.table_name) ?? [];
    tableRows.push(row);
    rowsByTable.set(row.table_name, tableRows);
  }

  return TABLES_IN_PROMPT.filter((tableName) => rowsByTable.has(tableName))
    .map((tableName) => {
      const tableRows = rowsByTable.get(tableName) ?? [];
      const tableComment = tableRows[0]?.table_comment ?? "No table comment.";
      const columns = tableRows
        .filter((row) => row.column_name !== null)
        .sort(
          (left, right) =>
            (left.ordinal_position ?? 0) - (right.ordinal_position ?? 0),
        )
        .map(
          (row) =>
            `- ${row.column_name} ${row.data_type}: ${
              row.column_comment ?? "No column comment."
            }`,
        )
        .join("\n");

      return `Table ${tableName}\n${tableComment}\nColumns:\n${columns}`;
    })
    .join("\n\n");
}
