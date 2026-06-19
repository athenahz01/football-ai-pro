import type { SqlValue } from "@/lib/sql/types";

export type GroundingVerification = {
  grounded: boolean;
  ungroundedNumbers: string[];
};

// Advisory check for evaluation. Percentages and derived ratios may be valid
// even when they are not printed verbatim in a result row.
const NUMBER_PATTERN = /(?<![A-Za-z])-?\d[\d,]*(?:\.\d+)?%?/g;
const EPSILON = 0.000001;

export function verifyGrounding(
  answer: string,
  rows: Record<string, SqlValue>[],
): GroundingVerification {
  const answerNumbers = extractNumbers(answer);
  const groundedNumbers = buildGroundedNumberSet(rows);
  const ungroundedNumbers = answerNumbers.filter(
    (numberText) => !isGroundedNumber(numberText, groundedNumbers),
  );

  return {
    grounded: ungroundedNumbers.length === 0,
    ungroundedNumbers,
  };
}

function extractNumbers(text: string): string[] {
  return [...new Set(text.match(NUMBER_PATTERN) ?? [])];
}

function buildGroundedNumberSet(rows: Record<string, SqlValue>[]): number[] {
  const values = rows.flatMap((row) => collectNumbers(row));
  const aggregates = buildSimpleAggregates(values, rows.length);

  return [...values, ...aggregates];
}

function collectNumbers(value: SqlValue): number[] {
  if (typeof value === "number" && Number.isFinite(value)) {
    return [value];
  }

  if (typeof value === "string") {
    return extractNumbers(value)
      .filter((numberText) => !numberText.endsWith("%"))
      .map(parseNumberText)
      .filter((numberValue) => Number.isFinite(numberValue));
  }

  if (value instanceof Date) {
    return extractNumbers(value.toISOString())
      .map(parseNumberText)
      .filter((numberValue) => Number.isFinite(numberValue));
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectNumbers(entry));
  }

  if (value !== null && typeof value === "object") {
    return Object.values(value).flatMap((entry) => collectNumbers(entry));
  }

  return [];
}

function buildSimpleAggregates(values: number[], rowCount: number): number[] {
  if (values.length === 0) {
    return [rowCount];
  }

  const sum = values.reduce((total, value) => total + value, 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const average = sum / values.length;

  return [rowCount, values.length, sum, min, max, average];
}

function isGroundedNumber(
  numberText: string,
  groundedNumbers: number[],
): boolean {
  const parsed = parseNumberText(numberText);

  if (!Number.isFinite(parsed)) {
    return true;
  }

  return groundedNumbers.some((groundedNumber) =>
    numbersMatch(parsed, groundedNumber),
  );
}

function parseNumberText(numberText: string): number {
  return Number(numberText.replaceAll(",", "").replace("%", ""));
}

function numbersMatch(left: number, right: number): boolean {
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= EPSILON * scale;
}
