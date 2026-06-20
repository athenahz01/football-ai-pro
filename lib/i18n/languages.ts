// Supported output languages. This is the small fixed set the product translates
// the final answer into. It is pure data with no secrets, so both the browser
// selector and server code can import it. Only the natural language wording of the
// answer changes with the language. The SQL generation, retrieval, schema, and
// glossary stay in English, and every number still comes from the real rows.

export const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "pt", name: "Portuguese" },
  { code: "de", name: "German" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

export const DEFAULT_LANGUAGE: LanguageCode = "en";

const CODES = new Set<string>(SUPPORTED_LANGUAGES.map((language) => language.code));

export function normalizeLanguage(input: string | undefined | null): LanguageCode {
  if (typeof input === "string") {
    const candidate = input.trim().toLowerCase();
    if (CODES.has(candidate)) {
      return candidate as LanguageCode;
    }
  }

  return DEFAULT_LANGUAGE;
}

export function languageName(code: LanguageCode): string {
  const match = SUPPORTED_LANGUAGES.find((language) => language.code === code);
  return match?.name ?? "English";
}
