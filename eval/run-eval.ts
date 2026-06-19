import "server-only";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

import {
  answerQuestionWithExplanation,
  type ExplainedAnswerResult,
} from "@/lib/agent/answer-query";
import { executeReadOnlySql } from "@/lib/sql/executor";
import { guardSql } from "@/lib/sql/guard";
import type { SqlExecutionResult, SqlValue } from "@/lib/sql/types";

import { EVAL_QUESTIONS, type EvalQuestion } from "./questions";

type TimedResult<T> = {
  value: T;
  latencyMs: number;
};

type ExpectedAnswer = {
  entities: string[];
  values: number[];
  row: Record<string, SqlValue>;
};

type ComparisonResult = {
  passed: boolean;
  reason: string;
  expected?: ExpectedAnswer;
};

type EvalQuestionResult = {
  id: string;
  category: string;
  question: string;
  passed: boolean;
  gatePassed: boolean;
  reason: string;
  reference: {
    sql: string;
    guardPassed: boolean;
    latencyMs: number;
    columns: string[];
    rows: Record<string, SqlValue>[];
  };
  model: {
    ok: boolean;
    sql?: string;
    sqlGuardPassed: boolean;
    answer: string;
    latencyMs: number;
    columns: string[];
    rows: Record<string, SqlValue>[];
    grounding: {
      grounded: boolean;
      ungroundedNumbers: string[];
    };
    usage: null;
  };
  expected?: ExpectedAnswer;
};

type EvalReport = {
  generatedAt: string;
  gate: {
    requiredAccuracy: number;
    passed: boolean;
  };
  totals: {
    questions: number;
    passed: number;
    failed: number;
    accuracy: number;
    grounded: number;
    ungrounded: number;
    traceability: number;
  };
  categories: Record<
    string,
    {
      questions: number;
      passed: number;
      failed: number;
      accuracy: number;
    }
  >;
  latency: {
    averageMs: number;
    p95Ms: number;
  };
  usage: {
    available: false;
    averageTokens: null;
    costPerQuery: null;
  };
  results: EvalQuestionResult[];
};

const REPORT_DIR = path.join(process.cwd(), "eval", "report");
const GATE_ACCURACY = 0.9;
const NUMERIC_RELATIVE_TOLERANCE = 0.001;
const REFERENCE_SQL_TIMEOUT_MS = 30_000;
const REFERENCE_SQL_MAX_ROWS = 50;

async function main() {
  const results: EvalQuestionResult[] = [];

  for (const [index, question] of EVAL_QUESTIONS.entries()) {
    console.log(
      `Running ${index + 1}/${EVAL_QUESTIONS.length}: ${question.id}`,
    );
    results.push(await runQuestion(question));
  }

  const report = buildReport(results);
  await writeReports(report);
  printSummary(report);

  if (!report.gate.passed) {
    process.exitCode = 1;
  }
}

async function runQuestion(
  question: EvalQuestion,
): Promise<EvalQuestionResult> {
  const referenceGuard = guardSql(question.referenceSql, {
    maxRows: REFERENCE_SQL_MAX_ROWS,
  });
  const reference = await time(() =>
    executeReadOnlySql(question.referenceSql, {
      maxRows: REFERENCE_SQL_MAX_ROWS,
      statementTimeoutMs: REFERENCE_SQL_TIMEOUT_MS,
    }),
  );
  const model = await time(() =>
    answerQuestionWithExplanation(question.question),
  );
  const modelSql = model.value.generatedSql;
  const modelSqlGuard = modelSql === undefined ? undefined : guardSql(modelSql);
  const comparison = compareResult(question, reference.value, model.value);
  const groundingPassed = model.value.grounding.grounded;
  const passed = comparison.passed;
  const gatePassed = comparison.passed && groundingPassed;

  return {
    id: question.id,
    category: question.category,
    question: question.question,
    passed,
    gatePassed,
    reason: comparison.reason,
    reference: {
      sql: question.referenceSql,
      guardPassed: referenceGuard.ok,
      latencyMs: reference.latencyMs,
      columns: reference.value.ok ? reference.value.columns : [],
      rows: reference.value.ok ? reference.value.rows : [],
    },
    model: {
      ok: model.value.ok,
      sql: model.value.ok ? model.value.executedSql : model.value.generatedSql,
      sqlGuardPassed: modelSqlGuard?.ok ?? false,
      answer: model.value.answer,
      latencyMs: model.latencyMs,
      columns: model.value.columns,
      rows: model.value.rows,
      grounding: model.value.grounding,
      usage: null,
    },
    expected: comparison.expected,
  };
}

async function time<T>(operation: () => Promise<T>): Promise<TimedResult<T>> {
  const startedAt = performance.now();
  const value = await operation();

  return {
    value,
    latencyMs: performance.now() - startedAt,
  };
}

function compareResult(
  question: EvalQuestion,
  reference: SqlExecutionResult,
  model: ExplainedAnswerResult,
): ComparisonResult {
  if (!reference.ok) {
    return {
      passed: false,
      reason: `Reference SQL failed: ${reference.message}`,
    };
  }

  const expected = readExpectedAnswer(question, reference.rows);

  if (expected === null) {
    return {
      passed: false,
      reason: "Reference SQL returned no comparable answer row.",
    };
  }

  if (!model.ok) {
    return {
      passed: false,
      reason: `Model pipeline failed: ${model.message}`,
      expected,
    };
  }

  if (model.rows.length === 0) {
    return {
      passed: false,
      reason: "Model SQL returned no rows.",
      expected,
    };
  }

  const matched = model.rows.some((row) =>
    rowMatchesExpected(row, expected.entities, expected.values),
  );

  if (!matched) {
    return {
      passed: false,
      reason: "Model rows did not contain the expected entity and value.",
      expected,
    };
  }

  return {
    passed: true,
    reason: "Passed.",
    expected,
  };
}

function readExpectedAnswer(
  question: EvalQuestion,
  rows: Record<string, SqlValue>[],
): ExpectedAnswer | null {
  const row = rows[question.answer.rowIndex ?? 0];

  if (row === undefined) {
    return null;
  }

  const entities = (question.answer.entityColumns ?? []).map((column) =>
    normalizeEntity(readRequiredValue(row, column)),
  );
  const values = question.answer.valueColumns.map((column) =>
    readRequiredNumber(row, column),
  );

  if (
    entities.some((entity) => entity.length === 0) ||
    values.some((value) => !Number.isFinite(value))
  ) {
    return null;
  }

  return {
    entities,
    values,
    row,
  };
}

function rowMatchesExpected(
  row: Record<string, SqlValue>,
  entities: string[],
  values: number[],
): boolean {
  const rowEntities = collectEntityValues(row);
  const rowNumbers = collectComparableNumbers(row);
  const entitiesMatch = entities.every((entity) =>
    rowEntities.some((candidate) => candidate === entity),
  );
  const valuesMatch = values.every((expectedValue) =>
    rowNumbers.some((candidate) => numbersMatch(candidate, expectedValue)),
  );

  return entitiesMatch && valuesMatch;
}

function readRequiredValue(
  row: Record<string, SqlValue>,
  column: string,
): SqlValue {
  if (!(column in row)) {
    throw new Error(`Reference result is missing column ${column}.`);
  }

  return row[column];
}

function readRequiredNumber(
  row: Record<string, SqlValue>,
  column: string,
): number {
  const value = toNumber(readRequiredValue(row, column));

  if (value === null) {
    throw new Error(`Reference result column ${column} is not numeric.`);
  }

  return value;
}

function collectEntityValues(row: Record<string, SqlValue>): string[] {
  return Object.entries(row)
    .filter(([key]) => !isIdColumn(key))
    .flatMap(([, value]) => collectStrings(value))
    .map(normalizeEntity)
    .filter((value) => value.length > 0);
}

function collectComparableNumbers(row: Record<string, SqlValue>): number[] {
  return Object.entries(row)
    .filter(([key]) => !isIdColumn(key))
    .flatMap(([, value]) => collectNumbers(value));
}

function collectStrings(value: SqlValue): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectStrings);
  }

  if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    return Object.values(value).flatMap(collectStrings);
  }

  return [];
}

function collectNumbers(value: SqlValue): number[] {
  const numberValue = toNumber(value);

  if (numberValue !== null) {
    return [numberValue];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectNumbers);
  }

  if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    return Object.values(value).flatMap(collectNumbers);
  }

  return [];
}

function toNumber(value: SqlValue): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replaceAll(",", ""));

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeEntity(value: SqlValue): string {
  return String(value).trim().replace(/\s+/g, " ").toLowerCase();
}

function isIdColumn(column: string): boolean {
  const normalized = column.toLowerCase();

  return normalized === "id" || normalized.endsWith("_id");
}

function numbersMatch(left: number, right: number): boolean {
  const scale = Math.max(1, Math.abs(left), Math.abs(right));

  return Math.abs(left - right) <= NUMERIC_RELATIVE_TOLERANCE * scale;
}

function buildReport(results: EvalQuestionResult[]): EvalReport {
  const passed = results.filter((result) => result.passed).length;
  const grounded = results.filter(
    (result) => result.model.grounding.grounded,
  ).length;
  const accuracy = results.length === 0 ? 0 : passed / results.length;
  const traceability = results.length === 0 ? 0 : grounded / results.length;
  const latencies = results.map((result) => result.model.latencyMs);

  return sanitizeReport({
    generatedAt: new Date().toISOString(),
    gate: {
      requiredAccuracy: GATE_ACCURACY,
      passed: accuracy > GATE_ACCURACY && grounded === results.length,
    },
    totals: {
      questions: results.length,
      passed,
      failed: results.length - passed,
      accuracy,
      grounded,
      ungrounded: results.length - grounded,
      traceability,
    },
    categories: buildCategorySummary(results),
    latency: {
      averageMs: average(latencies),
      p95Ms: percentile(latencies, 0.95),
    },
    usage: {
      available: false,
      averageTokens: null,
      costPerQuery: null,
    },
    results,
  });
}

function buildCategorySummary(
  results: EvalQuestionResult[],
): EvalReport["categories"] {
  const categories: EvalReport["categories"] = {};

  for (const result of results) {
    categories[result.category] ??= {
      questions: 0,
      passed: 0,
      failed: 0,
      accuracy: 0,
    };
    categories[result.category].questions += 1;

    if (result.passed) {
      categories[result.category].passed += 1;
    } else {
      categories[result.category].failed += 1;
    }
  }

  for (const category of Object.values(categories)) {
    category.accuracy =
      category.questions === 0 ? 0 : category.passed / category.questions;
  }

  return categories;
}

async function writeReports(report: EvalReport) {
  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(
    path.join(REPORT_DIR, "latest.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await writeFile(path.join(REPORT_DIR, "latest.md"), buildMarkdown(report));
}

function buildMarkdown(report: EvalReport): string {
  const factualFailures = report.results.filter((result) => !result.passed);
  const traceabilityFailures = report.results.filter(
    (result) => !result.model.grounding.grounded,
  );

  return sanitizeText(
    [
      "# Phase 0 Evaluation Report",
      "",
      `Generated at: ${report.generatedAt}`,
      "",
      "## Overall",
      "",
      `Factual accuracy: ${formatPercent(report.totals.accuracy)} (${report.totals.passed}/${report.totals.questions})`,
      `Traceability: ${formatPercent(report.totals.traceability)} (${report.totals.grounded}/${report.totals.questions})`,
      `Gate: ${report.gate.passed ? "passed" : "failed"} with accuracy above ${formatPercent(report.gate.requiredAccuracy)} and every answer grounded`,
      "",
      "## Latency",
      "",
      `Average model latency: ${formatNumber(report.latency.averageMs)} ms`,
      `P95 model latency: ${formatNumber(report.latency.p95Ms)} ms`,
      "",
      "## Usage",
      "",
      "Token usage is unavailable because the current pipeline return type does not expose AI SDK usage.",
      "",
      "## Category Breakdown",
      "",
      "| Category | Passed | Total | Accuracy |",
      "| --- | ---: | ---: | ---: |",
      ...Object.entries(report.categories).map(
        ([category, summary]) =>
          `| ${category} | ${summary.passed} | ${summary.questions} | ${formatPercent(summary.accuracy)} |`,
      ),
      "",
      "## Factual Failures",
      "",
      factualFailures.length === 0
        ? "No factual failures."
        : factualFailures.map(formatFailure).join("\n\n"),
      "",
      "## Traceability Failures",
      "",
      traceabilityFailures.length === 0
        ? "No traceability failures."
        : traceabilityFailures.map(formatTraceabilityFailure).join("\n\n"),
      "",
    ].join("\n"),
  );
}

function formatFailure(result: EvalQuestionResult): string {
  return [
    `### ${result.id}`,
    "",
    `Category: ${result.category}`,
    "",
    `Question: ${result.question}`,
    "",
    `Reason: ${result.reason}`,
    "",
    `Expected: ${JSON.stringify(result.expected?.row ?? null)}`,
    "",
    "Model SQL:",
    "",
    "```sql",
    result.model.sql ?? "No SQL generated.",
    "```",
    "",
    `Model answer: ${result.model.answer}`,
    "",
    `Model rows: ${JSON.stringify(result.model.rows.slice(0, 5))}`,
    "",
    `Grounding: ${result.model.grounding.grounded ? "grounded" : "not grounded"}`,
  ].join("\n");
}

function formatTraceabilityFailure(result: EvalQuestionResult): string {
  return [
    `### ${result.id}`,
    "",
    `Category: ${result.category}`,
    "",
    `Question: ${result.question}`,
    "",
    `Ungrounded numbers: ${result.model.grounding.ungroundedNumbers.join(", ")}`,
    "",
    `Expected: ${JSON.stringify(result.expected?.row ?? null)}`,
    "",
    "Model SQL:",
    "",
    "```sql",
    result.model.sql ?? "No SQL generated.",
    "```",
    "",
    `Model answer: ${result.model.answer}`,
    "",
    `Model rows: ${JSON.stringify(result.model.rows.slice(0, 5))}`,
  ].join("\n");
}

function printSummary(report: EvalReport) {
  console.log(
    `Factual accuracy ${formatPercent(report.totals.accuracy)} with ${report.totals.passed}/${report.totals.questions} passing.`,
  );
  console.log(
    `Traceability ${formatPercent(report.totals.traceability)} with ${report.totals.grounded}/${report.totals.questions} grounded.`,
  );
  console.log(`Gate ${report.gate.passed ? "passed" : "failed"}.`);
  console.log(`Report written to ${REPORT_DIR}.`);
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * percentileValue) - 1),
  );

  return sorted[index];
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value: number): string {
  return value.toFixed(0);
}

function sanitizeReport<T>(value: T): T {
  if (typeof value === "string") {
    return sanitizeText(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeReport) as T;
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitizeReport(entry)]),
    ) as T;
  }

  return value;
}

function sanitizeText(value: string): string {
  return value.replaceAll("\u2014", "-");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
