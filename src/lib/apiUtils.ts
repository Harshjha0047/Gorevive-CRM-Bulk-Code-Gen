import { api } from './api';

// ---------------------------------------------------------------------------
// Full page -> JSON cache. Fetched ONCE per session, then reused everywhere.
// ---------------------------------------------------------------------------
export type MasterData = Record<string, Record<string, string>>;

let cachedMasterData: MasterData | null = null;

/**
 * Converts a raw HTML string into JSON, keyed by each <select>'s `name`
 * attribute. Values are { "Display Text": "value" }.
 *
 * NOTE: .trim() here only strips whitespace that HTML/JSX indentation adds
 * around tag content (e.g. "\n  Acer\n" -> "Acer"). It does NOT touch
 * meaningful internal spacing within real option text, so exact-match
 * validation downstream stays reliable.
 */
export function htmlToJson(htmlString: string): MasterData {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');

  const result: MasterData = {};

  doc.querySelectorAll('select').forEach((select) => {
    const name = select.getAttribute('name');
    if (!name) return;

    const options: Record<string, string> = {};
    select.querySelectorAll('option').forEach((option) => {
      const value = option.value.trim();
      const text = option.textContent?.trim();
      if (value && text && text !== 'Please Select') {
        options[text] = value;
      }
    });

    result[name] = options;
  });

  return result;
}

/**
 * Fetches the Add Model page once, converts it to JSON, and caches it.
 * Includes ALL static dropdowns: make, hsn_code, ram_cap, strg1, strg2,
 * cpu_core, cpu_gen, cpu_speed, color, gpu_type, gpu_cap, display_type,
 * display_size, keyboard, model_typenew.
 * NOTE: "model", "product_name", "sub_producd" come back EMPTY here —
 * those are brand/category-dependent and fetched via fetchDynamicMap().
 */
export async function fetchMasterData(): Promise<MasterData> {
  if (cachedMasterData) return cachedMasterData;

  try {
    const response = await api.get('/master/addmodel_new_all.php');
    cachedMasterData = htmlToJson(response.data);
    return cachedMasterData;
  } catch (error) {
    console.error('Failed to fetch/parse master data page:', error);
    cachedMasterData = {};
    return cachedMasterData;
  }
}

// ---------------------------------------------------------------------------
// Dynamic (AJAX) lookups: category / model / sub-category, which depend
// on which brand (and category) was selected.
// ---------------------------------------------------------------------------

/**
 * Parses a getField.php option-list HTML fragment into an EXACT
 * { "Display Text": "id" } map — original casing and spacing preserved
 * (only the meaningless whitespace around the <option> tag is trimmed).
 */
function parseHtmlOptionsExact(htmlString: string): Record<string, string> {
  const map: Record<string, string> = {};
  const regex = /<option\s+value=["']([^"']*)["'][^>]*>([^<]*)<\/option>/gi;

  let match;
  while ((match = regex.exec(htmlString)) !== null) {
    const id = match[1].trim();
    const text = match[2].trim();
    if (id && text && text !== 'Please Select') {
      map[text] = id;
    }
  }
  return map;
}

const dynamicMapCache = new Map<string, Record<string, string>>();

export async function fetchDynamicMap(action: string, value: string): Promise<Record<string, string>> {
  const cacheKey = `${action}:${value}`;
  if (dynamicMapCache.has(cacheKey)) {
    return dynamicMapCache.get(cacheKey)!;
  }

  try {
    const params = new URLSearchParams();
    params.append('action', action);
    params.append('value', value);

    const response = await api.post('/includes/getField.php', params);
    const htmlPart = response.data.split('~')[0];
    const map = parseHtmlOptionsExact(htmlPart);

    dynamicMapCache.set(cacheKey, map);
    return map;
  } catch (error) {
    console.error(`Failed to fetch map for ${action} with value ${value}`, error);
    return {};
  }
}

// ---------------------------------------------------------------------------
// Exact-match validation helpers
// ---------------------------------------------------------------------------

/**
 * Strict lookup: returns the id ONLY if `rawValue` matches a key in `map`
 * character-for-character (case AND whitespace sensitive). No fallback.
 */
export function findExactMatch(map: Record<string, string>, rawValue: string): string | null {
  if (Object.prototype.hasOwnProperty.call(map, rawValue)) {
    return map[rawValue];
  }
  return null;
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

/**
 * For error messages only: finds the closest match so we can tell the user
 * *what they probably meant*, without ever treating it as a valid match.
 * Two passes:
 *  1. Loose exact match (case-insensitive, whitespace collapsed) — catches
 *     ordinary capitalization/space differences.
 *  2. Edit-distance fallback — catches everything else: invisible/unicode
 *     characters (non-breaking spaces, smart quotes, different dash types),
 *     typos, missing letters, etc.
 */
export function suggestClosest(map: Record<string, string>, rawValue: string): string | null {
  const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const target = normalize(rawValue);
  if (!target) return null;

  for (const key of Object.keys(map)) {
    if (normalize(key) === target) {
      return key;
    }
  }

  let best: string | null = null;
  let bestDist = Infinity;
  for (const key of Object.keys(map)) {
    const dist = levenshtein(normalize(key), target);
    if (dist < bestDist) {
      bestDist = dist;
      best = key;
    }
  }

  // Only suggest if genuinely close — avoids nonsense suggestions when the
  // value is just wrong, not merely mistyped/mis-encoded.
  const threshold = Math.max(3, Math.ceil(target.length * 0.2));
  return best && bestDist <= threshold ? best : null;
}

/**
 * Pinpoints the FIRST character where two strings diverge, printing each
 * character's Unicode code point. This is what actually catches invisible
 * culprits like a non-breaking space (U+00A0) standing in for a normal
 * space (U+0020), or an en-dash (U+2013) standing in for a hyphen (U+002D)
 * — differences that look 100% identical on screen.
 */
export function describeCharDiff(raw: string, expected: string): string | null {
  const len = Math.max(raw.length, expected.length);
  const describe = (c: string | undefined) =>
    c === undefined
      ? '(nothing — string ends here)'
      : `"${c}" (U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')})`;

  for (let i = 0; i < len; i++) {
    if (raw[i] !== expected[i]) {
      return `First difference at character ${i + 1}: your file has ${describe(raw[i])}, system expects ${describe(expected[i])}.`;
    }
  }
  if (raw.length !== expected.length) {
    return `Your value has ${raw.length} characters vs ${expected.length} expected — extra/missing character(s) at the end.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Legacy submit-response parsing
// ---------------------------------------------------------------------------

/**
 * addmodel_new_all.php was built for popup-window submission — it replies
 * with a raw HTML fragment like:
 *   <script>alert('Model Already Available...');</script>
 *   <BODY onLoad='window.close(); window.opener.location.reload(true);'></BODY>
 * None of that JS runs when called via axios/fetch (no window.opener here),
 * so we just get the string back. This pulls the alert() text out and
 * classifies it as success or failure — DO NOT assume "no HTTP error" means
 * "row was actually saved".
 */
export interface LegacyFormResult {
  success: boolean;
  message: string;
}

const FAILURE_KEYWORDS = ['already available', 'already exist', 'error', 'fail', 'invalid', 'duplicate'];
const SUCCESS_KEYWORDS = ['added successfully', 'success', 'record added', 'saved'];

export function parseLegacyFormResponse(html: string): LegacyFormResult {
  if (typeof html !== 'string') {
    return { success: false, message: 'Unexpected response from server (not text).' };
  }

  const match = html.match(/alert\((['"])(.*?)\1\)/i);
  const message = match ? match[2].trim() : '';

  if (!message) {
    // No alert() found at all — treat unknown/empty responses as failures
    // rather than silently assuming success.
    return { success: false, message: 'No confirmation message received from server.' };
  }

  const lower = message.toLowerCase();
  const isFailure = FAILURE_KEYWORDS.some((k) => lower.includes(k));
  const isSuccess = SUCCESS_KEYWORDS.some((k) => lower.includes(k));

  // Explicit failure keyword wins even if a success keyword also appears.
  const success = isFailure ? false : isSuccess ? true : false;

  return { success, message };
}