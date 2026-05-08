// ─── Types ────────────────────────────────────────────────────────────────────

export type ProblemType =
  | 'UNESCAPED_QUOTE'
  | 'DOUBLE_ESCAPED_QUOTE'
  | 'TAG_MISSING'
  | 'TAG_EXTRA'
  | 'TAG_UNBALANCED'
  | 'PLACEHOLDER_MISSING'
  | 'PLACEHOLDER_EXTRA'
  | 'ICU_COUNT_MISMATCH'
  | 'ICU_VARIABLE_MISMATCH'
  | 'ICU_KEYWORD_MISMATCH'
  | 'ICU_CATEGORIES_MISSING'
  | 'ICU_CATEGORIES_EXTRA';

export interface TranslationProblem {
  type: ProblemType;
  message: string;
}

interface ICUExpression {
  variable: string;   // e.g. "count" or "4"
  keyword: string;    // e.g. "plural"
  categories: string[]; // e.g. ["one", "other"]
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Compares a Lingui source message against its translation and returns
 * an array of syntax problems found in the translation.
 *
 * Checks performed:
 *  - Escaped quotes  (\")
 *  - Numeric XML-style tags  (<0>, </0>, …)
 *  - Numeric placeholders  ({0}, {1}, …)
 *  - ICU plural/select expressions  ({count, plural, one {…} other {…}})
 */
export function compareMessages(
  source: string,
  translation: string,
): TranslationProblem[] {
  const problems: TranslationProblem[] = [];

  checkEscapedQuotes(source, translation, problems);
  checkTags(source, translation, problems);
  checkNumericPlaceholders(source, translation, problems);
  checkICUExpressions(source, translation, problems);

  return problems;
}

// ─── Escaped quotes ───────────────────────────────────────────────────────────

function checkEscapedQuotes(
  source: string,
  translation: string,
  problems: TranslationProblem[],
): void {
  // A correct Lingui escaped quote is \" (single backslash + quote).
  // Lookbehind ensures we don't match the \" inside a \\".
  const singleEscaped = /(?<!\\)\\"/;
  const doubleEscaped = /\\\\"/;

  if (!singleEscaped.test(source)) return;

  if (doubleEscaped.test(translation)) {
    problems.push({
      type: 'DOUBLE_ESCAPED_QUOTE',
      message: 'Translation uses double-escaped quotes (\\\\\") instead of single-escaped quotes (\\\")',
    });
    return; // More specific error; skip the next check
  }

  if (!singleEscaped.test(translation) && /"/.test(translation)) {
    problems.push({
      type: 'UNESCAPED_QUOTE',
      message: 'Translation uses raw quotes (") instead of Lingui-escaped quotes (\\\")',
    });
  }
}

// ─── XML-style numeric tags ───────────────────────────────────────────────────

function extractTagNumbers(str: string): Set<number> {
  const set = new Set<number>();
  const re = /<\/?(\d+)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(str)) !== null) set.add(+m[1]);
  return set;
}

function checkTagBalance(str: string, problems: TranslationProblem[]): void {
  const stack: number[] = [];
  const re = /<(\/?)(\d+)>/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(str)) !== null) {
    const closing = m[1] === '/';
    const num = +m[2];

    if (!closing) {
      stack.push(num);
    } else if (stack.length === 0) {
      problems.push({
        type: 'TAG_UNBALANCED',
        message: `Closing tag </${num}> in translation has no matching opening tag`,
      });
    } else if (stack[stack.length - 1] !== num) {
      const expected = stack[stack.length - 1];
      problems.push({
        type: 'TAG_UNBALANCED',
        message: `Mismatched tags in translation: expected </${expected}>, found </${num}>`,
      });
      stack.pop(); // Treat as consumed to avoid cascading errors
    } else {
      stack.pop();
    }
  }

  for (const n of stack) {
    problems.push({
      type: 'TAG_UNBALANCED',
      message: `Opening tag <${n}> in translation is never closed`,
    });
  }
}

function checkTags(
  source: string,
  translation: string,
  problems: TranslationProblem[],
): void {
  const srcTags = extractTagNumbers(source);
  if (srcTags.size === 0) return;

  const transTags = extractTagNumbers(translation);
  let setsMatch = true;

  for (const n of srcTags) {
    if (!transTags.has(n)) {
      setsMatch = false;
      problems.push({
        type: 'TAG_MISSING',
        message: `Tag <${n}> exists in source but is missing from translation`,
      });
    }
  }

  for (const n of transTags) {
    if (!srcTags.has(n)) {
      setsMatch = false;
      problems.push({
        type: 'TAG_EXTRA',
        message: `Tag <${n}> exists in translation but not in source`,
      });
    }
  }

  // Only check balance when the tag sets match; otherwise the missing/extra
  // errors above already explain the structural problem.
  if (setsMatch) checkTagBalance(translation, problems);
}

// ─── Numeric placeholders ─────────────────────────────────────────────────────

function extractNumericPlaceholders(str: string): Set<number> {
  const set = new Set<number>();
  // Match {N} only — braces must contain only digits (not ICU commas etc.)
  const re = /\{(\d+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(str)) !== null) set.add(+m[1]);
  return set;
}

function checkNumericPlaceholders(
  source: string,
  translation: string,
  problems: TranslationProblem[],
): void {
  const srcPH = extractNumericPlaceholders(source);
  if (srcPH.size === 0) return;

  const transPH = extractNumericPlaceholders(translation);

  for (const n of srcPH) {
    if (!transPH.has(n)) {
      problems.push({
        type: 'PLACEHOLDER_MISSING',
        message: `Placeholder {${n}} exists in source but is missing from translation`,
      });
    }
  }

  for (const n of transPH) {
    if (!srcPH.has(n)) {
      problems.push({
        type: 'PLACEHOLDER_EXTRA',
        message: `Placeholder {${n}} exists in translation but not in source`,
      });
    }
  }
}

// ─── ICU plural / select expressions ─────────────────────────────────────────

const ICU_KEYWORDS = new Set(['plural', 'select', 'selectordinal']);

/**
 * Parses category names from the "rest" portion of an ICU expression.
 * e.g. `one {foo} other {bar}` → ['one', 'other']
 * Handles arbitrary nesting inside category values.
 */
function extractICUCategories(rest: string): string[] {
  const categories: string[] = [];
  let i = 0;

  while (i < rest.length) {
    // Skip whitespace
    while (i < rest.length && /\s/.test(rest[i])) i++;
    if (i >= rest.length) break;

    // Read category name: a word like "one"/"other" or exact match like "=0"
    const start = i;
    if (rest[i] === '=') {
      i++;
      while (i < rest.length && /\d/.test(rest[i])) i++;
    } else {
      while (i < rest.length && /\w/.test(rest[i])) i++;
    }
    const name = rest.slice(start, i);
    if (!name) { i++; continue; }

    // Skip whitespace before the value block
    while (i < rest.length && /\s/.test(rest[i])) i++;

    if (i < rest.length && rest[i] === '{') {
      categories.push(name);
      // Advance past the value block, tracking nested braces
      let depth = 1;
      i++;
      while (i < rest.length && depth > 0) {
        if (rest[i] === '{') depth++;
        else if (rest[i] === '}') depth--;
        i++;
      }
    } else {
      i++; // Unexpected character; skip
    }
  }

  return categories;
}

/**
 * Scans a Lingui message string for top-level ICU expressions and returns
 * their parsed structure. Nested expressions inside category values are
 * intentionally NOT extracted here (they are consumed as opaque text).
 */
function parseICUExpressions(str: string): ICUExpression[] {
  const results: ICUExpression[] = [];
  let i = 0;

  while (i < str.length) {
    if (str[i] !== '{') { i++; continue; }

    // Find the matching closing brace
    const blockStart = i++;
    let depth = 1;
    while (i < str.length && depth > 0) {
      if (str[i] === '{') depth++;
      else if (str[i] === '}') depth--;
      i++;
    }

    const inner = str.slice(blockStart + 1, i - 1);

    // An ICU expression starts with:  variable , keyword , …
    const header = /^([^,{}]+),\s*([^,{}]+),\s*/.exec(inner);
    if (!header) continue;

    const variable = header[1].trim();
    const keyword = header[2].trim();

    // Only process recognised ICU keywords (case-insensitive detection,
    // but preserve original case for mismatch reporting)
    if (!ICU_KEYWORDS.has(keyword.toLowerCase())) continue;

    const categories = extractICUCategories(inner.slice(header[0].length));
    results.push({ variable, keyword, categories });
  }

  return results;
}

function checkICUExpressions(
  source: string,
  translation: string,
  problems: TranslationProblem[],
): void {
  const srcICU = parseICUExpressions(source);
  const transICU = parseICUExpressions(translation);

  if (srcICU.length === 0 && transICU.length === 0) return;

  if (srcICU.length !== transICU.length) {
    problems.push({
      type: 'ICU_COUNT_MISMATCH',
      message: `Source has ${srcICU.length} ICU expression(s) but translation has ${transICU.length}`,
    });
    return;
  }

  for (let idx = 0; idx < srcICU.length; idx++) {
    const src = srcICU[idx];
    const trans = transICU[idx];

    if (src.variable !== trans.variable) {
      problems.push({
        type: 'ICU_VARIABLE_MISMATCH',
        message: `ICU variable mismatch: source uses "${src.variable}", translation uses "${trans.variable}"`,
      });
    }

    if (src.keyword !== trans.keyword) {
      problems.push({
        type: 'ICU_KEYWORD_MISMATCH',
        message: `ICU keyword mismatch: source uses "${src.keyword}", translation uses "${trans.keyword}"`,
      });
    }

    const transSet = new Set(trans.categories);
    const srcSet = new Set(src.categories);
    const missing = src.categories.filter(c => !transSet.has(c));
    const extra = trans.categories.filter(c => !srcSet.has(c));

    if (missing.length > 0) {
      problems.push({
        type: 'ICU_CATEGORIES_MISSING',
        message: `ICU plural categories missing in translation: ${missing.map(c => `"${c}"`).join(', ')}`,
      });
    }
    if (extra.length > 0) {
      problems.push({
        type: 'ICU_CATEGORIES_EXTRA',
        message: `ICU categories in translation not present in source: ${extra.map(c => `"${c}"`).join(', ')}`,
      });
    }
  }
}
