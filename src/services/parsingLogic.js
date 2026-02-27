/**
 * Expense parsing logic — extracts structured data from transcribed text.
 *
 * Expected transcript pattern:
 *   "Charge $XX.YY to <card>. Date is <date>. Category is <cat>. Description is <desc>"
 *
 * Also handles structured JSON responses from transcription APIs.
 */

import { getAccountNames, getExpenseCategories } from "./configService";

// ---------------------------------------------------------------------------
// Config list cache
// ---------------------------------------------------------------------------

let cachedAccountNames = null;
let cachedExpenseCategories = null;

/** Load account names and expense categories into cache. Call at app startup. */
export async function loadConfigLists() {
  try {
    [cachedAccountNames, cachedExpenseCategories] = await Promise.all([
      getAccountNames(),
      getExpenseCategories(),
    ]);
  } catch (error) {
    console.error("Error loading config lists:", error);
    cachedAccountNames = [];
    cachedExpenseCategories = [];
  }
}

function getCachedAccountNames() {
  return cachedAccountNames || [];
}

function getCachedExpenseCategories() {
  return cachedExpenseCategories || [];
}

/** Refresh the cached lists from storage. */
export async function refreshConfigLists() {
  await loadConfigLists();
}

// ---------------------------------------------------------------------------
// JSON transcript reconstruction
// ---------------------------------------------------------------------------

/**
 * Parses a JSON-shaped transcript and reconstructs natural-language text that
 * the keyword-based parsers can process.
 *
 * Recognizes keys: amount, description, category, payment_method, card_name,
 * date, query, text, transcript, payload.
 *
 * @param {string} transcript
 * @returns {string|null} Natural-language transcript, or null if not JSON.
 */
export function tryReconstructTranscriptFromJson(transcript) {
  if (!transcript || typeof transcript !== "string") return null;
  let trimmed = transcript.trim();

  // Strip wrapping quotes that some APIs add
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    trimmed = trimmed.slice(1, -1).trim();
  }

  if (!trimmed.startsWith("{")) return null;

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const cleaned = trimmed.replace(/^[^{]*/, "").replace(/[^}]*$/, "");
    try { parsed = JSON.parse(cleaned); } catch { return null; }
  }
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  // Prefer natural-language fields directly
  for (const key of ["query", "text", "transcript", "payload"]) {
    const val = parsed[key];
    if (typeof val === "string" && val.length > 10) return val;
  }

  // Reconstruct from structured expense fields
  const amount      = parsed.amount ?? parsed.expense_amount ?? parsed.total ?? "";
  const card        = parsed.payment_method ?? parsed.card_name ?? parsed.card ?? "";
  const category    = parsed.category ?? parsed.expense_category ?? "";
  const description = parsed.description ?? "";
  const date        = parsed.date ?? "";

  if (!amount && !description && !category && !card) {
    // Fallback: return longest string value (handles unknown schemas)
    const strings = Object.values(parsed).filter((v) => typeof v === "string");
    if (strings.length === 0) return null;
    return strings.reduce((a, b) => (a.length >= b.length ? a : b));
  }

  const parts = [];
  if (amount) {
    const amtStr = typeof amount === "number" ? `$${amount.toFixed(2)}` : `$${String(amount).replace(/^\$/, "")}`;
    parts.push(`Charge ${amtStr}`);
  }
  if (card)        parts.push(`to ${card}`);
  if (date)        parts.push(`Date is ${date}`);
  if (category)    parts.push(`Category is ${category}`);
  if (description) parts.push(`Description is ${description}`);

  return parts.join('. ');
}

// ---------------------------------------------------------------------------
// Shared segment extraction
// ---------------------------------------------------------------------------

/**
 * Extracts the text segment between "charge"/"charged" and the next keyword
 * ("category" or "description"). Used by extractCardName and extractExpenseAmount.
 *
 * @param {string} transcript
 * @returns {string|null} Cleaned segment text, or null if "charge" not found.
 */
function extractSegmentAfterCharge(transcript) {
  const lower = transcript.toLowerCase();
  const chargeKeyword = lower.includes("charged") ? "charged" : "charge";
  const chargeStartIdx = lower.indexOf(chargeKeyword);
  if (chargeStartIdx === -1) return null;

  const chargeOffset = chargeStartIdx + chargeKeyword.length;
  const afterCharge = lower.substring(chargeOffset);
  const categoryIdx = afterCharge.indexOf("category");
  const descriptionIdx = afterCharge.indexOf("description");

  let endOffset;
  if (categoryIdx !== -1 && descriptionIdx !== -1) {
    endOffset = Math.min(categoryIdx, descriptionIdx);
  } else {
    endOffset = categoryIdx !== -1 ? categoryIdx
              : descriptionIdx !== -1 ? descriptionIdx
              : afterCharge.length;
  }

  const raw = transcript.substring(chargeOffset, chargeOffset + endOffset);
  return raw.replace(/^[\s:,-]+/, "").replace(/[\s:,-.]+$/, "").trim() || null;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Builds an expense record from a transcript string.
 * Handles both natural-language transcripts and structured JSON from the API.
 */
export function buildExpenseRecordFromTranscript(transcript) {
  const text = tryReconstructTranscriptFromJson(transcript) || transcript;

  return {
    date:             extractDate(text) || "",
    card_name:        extractCardName(text) || "",
    expense_amount:   extractExpenseAmount(text) || "",
    expense_category: extractExpenseCategory(text) || "",
    description:      sanitizeDescription(extractDescription(text)),
  };
}

// ---------------------------------------------------------------------------
// Field extractors
// ---------------------------------------------------------------------------

/** Extracts date from transcript. Supports ISO, US numeric, month-name, "today", "yesterday". */
export function extractDate(transcript) {
  const text = transcript.toLowerCase();

  // ISO-like or numeric formats first
  const isoLike = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (isoLike) {
    const [, y, m, d] = isoLike;
    return toISODate(Number(y), Number(m), Number(d));
  }

  // US-style mm/dd/yyyy
  const usNumeric = text.match(/\b(\d{1,2})[-/](\d{1,2})[-/](20\d{2})\b/);
  if (usNumeric) {
    const [, m, d, y] = usNumeric;
    return toISODate(Number(y), Number(m), Number(d));
  }

  // Month name day, optional year
  const months = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  const monthRegex = new RegExp(
    `\\b(${months.join("|")})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s*(20\\d{2})?`,
    "i"
  );
  const monthMatch = text.match(monthRegex);
  if (monthMatch) {
    const monthName = monthMatch[1].toLowerCase();
    const day = Number(monthMatch[2]);
    const year = monthMatch[3] ? Number(monthMatch[3]) : new Date().getFullYear();
    const monthIndex = months.indexOf(monthName);
    return toISODate(year, monthIndex + 1, day);
  }

  // "today" or "yesterday" keywords
  const now = new Date();
  if (text.includes("today")) {
    return toISODate(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }
  if (text.includes("yesterday")) {
    const y = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return toISODate(y.getFullYear(), y.getMonth() + 1, y.getDate());
  }

  // If nothing explicit is found, default to today.
  return toISODate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function toISODate(year, month, day) {
  if (!year || !month || !day) return "";
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// Fuzzy matching helpers
// ---------------------------------------------------------------------------

function normalizeForMatch(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function textTokens(text) {
  return normalizeForMatch(text)
    .split(/\s+/)
    .filter(Boolean)
    .map(stemToken);
}

// Lightweight stemming for plural/singular ("groceries" → "grocery").
function stemToken(token) {
  if (token.length > 4 && token.endsWith("ies")) {
    return token.slice(0, -3) + "y";
  }
  if (token.length > 3 && token.endsWith("es")) {
    return token.slice(0, -2);
  }
  if (token.length > 3 && token.endsWith("s")) {
    return token.slice(0, -1);
  }
  return token;
}

/**
 * Fuzzy-matches transcript text against a list of candidates.
 *
 * Scoring strategy (in descending priority):
 *   1. Exact phrase match of candidate in transcript          → 1.0
 *   2. Transcript phrase found contiguously within candidate  → 1.0 (partial phrase)
 *   3. Compound-word splitting ("doublecash" → "double cash") → phrase boost
 *   4. Token overlap with stemming                            → overlap / candidateTokens
 *   5. Compound-word bonus on token score                     → +0.4
 *
 * Tie-breaking: longer (more specific) candidates win. Multi-word partial-phrase
 * matches beat single-word candidates at the same score.
 */
function bestMatchFromList(transcript, candidates, minScore) {
  const normalizedTranscript = normalizeForMatch(transcript);
  if (!normalizedTranscript) return "";

  const transcriptTokens = new Set(textTokens(transcript));
  const transcriptTokensArray = normalizedTranscript.split(/\s+/).filter(Boolean);
  const transcriptIsMultiWord = transcriptTokensArray.length > 1;

  let best = "";
  let bestScore = 0;

  for (const candidate of candidates) {
    const candidateNorm = normalizeForMatch(candidate);
    if (!candidateNorm) continue;

    const candidateTokens = candidateNorm.split(/\s+/).filter(Boolean);
    let phraseMatch = false;
    let partialPhraseMatch = false;

    if (candidateTokens.length > 0) {
      // Check if transcript meaningful phrase appears within the candidate
      if (transcriptIsMultiWord) {
        const commonWords = new Set(['to', 'for', 'on', 'at', 'in', 'the', 'a', 'an']);
        const meaningfulTokens = transcriptTokensArray.filter(tok =>
          !/^\d+$/.test(tok) && !commonWords.has(tok.toLowerCase())
        );

        if (meaningfulTokens.length >= 2 && meaningfulTokens.length <= candidateTokens.length) {
          const phrase = meaningfulTokens.join(' ');
          const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          partialPhraseMatch = new RegExp(`\\b${escaped}\\b`, 'i').test(candidateNorm);

          // Fallback: tokens in order within candidate
          if (!partialPhraseMatch) {
            let allInOrder = true;
            let searchStart = 0;
            for (const tok of meaningfulTokens) {
              const re = new RegExp(`\\b${tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
              const m = candidateNorm.substring(searchStart).match(re);
              if (!m) { allInOrder = false; break; }
              searchStart += m.index + m[0].length;
            }
            if (allInOrder && candidateTokens.length > 1) partialPhraseMatch = true;
          }
        }
      }

      // Check if candidate phrase appears in transcript (word-boundary)
      if (!partialPhraseMatch) {
        const escapedTokens = candidateTokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        phraseMatch = new RegExp(`\\b${escapedTokens.join('\\s+')}\\b`, 'i').test(normalizedTranscript);
        // Single-word candidates don't get perfect score for multi-word transcripts
        if (phraseMatch && candidateTokens.length === 1 && transcriptIsMultiWord) {
          phraseMatch = false;
        }
      }

      // Compound-word phrase matching (e.g. "doublecash" ↔ "double cash")
      if (!phraseMatch && !partialPhraseMatch) {
        for (const tok of candidateTokens) {
          const parts = splitCompoundWord(tok);
          if (parts.length > 1) {
            const escaped = parts.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
            if (new RegExp(`\\b${escaped.join('\\s+')}\\b`, 'i').test(normalizedTranscript)) {
              phraseMatch = true;
              break;
            }
          }
        }
      }
    }

    let score = (phraseMatch || partialPhraseMatch) ? 1 : 0;

    // Token overlap scoring with stemming and compound-word splitting
    const cTokens = textTokens(candidate);
    if (cTokens.length) {
      let overlap = 0;
      let hasCompoundMatch = false;

      for (const tok of cTokens) {
        if (transcriptTokens.has(tok)) {
          overlap += 1;
        } else {
          const parts = splitCompoundWord(tok);
          if (parts.length > 1 && parts.every(p => transcriptTokens.has(p))) {
            overlap += 1;
            hasCompoundMatch = true;
          }
        }
      }

      let tokenScore = Math.min(1.0, overlap / cTokens.length + (hasCompoundMatch ? 0.4 : 0));

      // Cap single-word candidates at 0.85 for multi-word transcripts
      if (transcriptIsMultiWord && candidateTokens.length === 1) {
        tokenScore = Math.min(0.85, tokenScore);
      }

      if (!partialPhraseMatch) {
        score = Math.max(score, tokenScore);
      }
    }

    // Prefer longer matches when tied; prefer multi-word partial-phrase over single-word
    const candidateIsMultiWord = candidateTokens.length > 1;
    const bestIsSingleWord = best && normalizeForMatch(best).split(/\s+/).filter(Boolean).length === 1;

    const preferThis =
      score > bestScore ||
      (score === bestScore && candidate.length > best.length) ||
      (score === bestScore && score === 1 && transcriptIsMultiWord && candidateIsMultiWord && partialPhraseMatch && bestIsSingleWord);

    if (preferThis) {
      bestScore = score;
      best = candidate;
    }
  }

  return bestScore >= (minScore ?? 0.3) ? best : "";
}

/** Heuristic split of compound words: "doublecash" → ["double", "cash"]. */
function splitCompoundWord(word) {
  if (word.length < 6) {
    // Too short to be a meaningful compound word
    return [word];
  }
  
  // Try to split on common patterns:
  // 1. camelCase boundaries (lowercase followed by uppercase, but we're already lowercase)
  // 2. Common word endings that might indicate a word boundary
  
  // For now, use a simple heuristic: look for common word patterns
  // This is not perfect but handles common cases like "doublecash", "activecash", etc.
  
  // Try splitting at positions where we might have word boundaries
  // Look for patterns like: word1 + word2 where word2 is a common word
  
  const commonWords = ['cash', 'card', 'bank', 'check', 'plus', 'active', 'double', 'triple'];
  
  for (const commonWord of commonWords) {
    if (word.endsWith(commonWord) && word.length > commonWord.length) {
      const prefix = word.slice(0, -commonWord.length);
      if (prefix.length >= 3) { // Ensure prefix is meaningful
        return [prefix, commonWord];
      }
    }
    if (word.startsWith(commonWord) && word.length > commonWord.length) {
      const suffix = word.slice(commonWord.length);
      if (suffix.length >= 3) { // Ensure suffix is meaningful
        return [commonWord, suffix];
      }
    }
  }
  
  // If no pattern found, return the word as-is
  return [word];
}

/**
 * Extracts the card/account name from a transcript.
 * Finds text between "charge" and the next keyword, then fuzzy-matches
 * against the configured account names list.
 * Falls back to searching the entire transcript if no "charge" keyword found.
 */
export function extractCardName(transcript) {
  if (!transcript) return "";
  const cardNames = getCachedAccountNames();
  const segment = extractSegmentAfterCharge(transcript);
  if (!segment) return bestMatchFromList(transcript, cardNames, 0.3);
  return bestMatchFromList(segment, cardNames, 0.3) || "";
}

/**
 * Extracts a monetary amount from the transcript. Searches the segment between
 * "charge" and the next keyword first; falls back to the entire transcript.
 *
 * Pattern priority (most specific first):
 *   1. "XX dollars (and YY cents)"  → verbal format
 *   2. "XX cents"                   → cents only
 *   3. "$XX,XXX.XX"                → dollar sign with commas
 *   4. "XX,XXX.XX" (no $)          → bare number with commas (>=10)
 *   5. "$XX.XX"                    → dollar sign without commas
 *
 * All amounts returned as "XX.XX" strings with 2-digit cents.
 */
export function extractExpenseAmount(transcript) {
  if (!transcript) return "";

  const segment = extractSegmentAfterCharge(transcript);
  const text = (segment || transcript).toLowerCase();

  // 1. "XX dollars (and YY cents)"
  const dollarsPattern = text.match(/\b([\d,]+)\s+dollars?(?:\s+and\s+(\d+)\s+cents?)?/);
  if (dollarsPattern) {
    const dollars = dollarsPattern[1].replace(/,/g, '');
    const cents = dollarsPattern[2] ? dollarsPattern[2].padStart(2, '0') : '00';
    return `${dollars}.${cents}`;
  }

  // 2. "XX cents" (no dollars)
  const centsOnlyPattern = text.match(/\b(\d+)\s+cents?\b/);
  if (centsOnlyPattern) {
    const cents = centsOnlyPattern[1].padStart(2, '0').substring(0, 2);
    return `0.${cents}`;
  }

  // 3. "$XX,XXX.XX" or "$XX,XXX"
  const dollarSignWithCommasPattern = text.match(/\$([\d,]+)(?:\.(\d{1,2}))?/);
  if (dollarSignWithCommasPattern) {
    const dollars = dollarSignWithCommasPattern[1].replace(/,/g, '');
    const cents = normalizeCents(dollarSignWithCommasPattern[2]);
    return `${dollars}.${cents}`;
  }

  // 4. Bare number with commas or >= 10 (no dollar sign)
  const numberWithCommasPattern = text.match(/\b([\d,]+)(?:\.(\d{1,2}))?\b/);
  if (numberWithCommasPattern) {
    const numberStr = numberWithCommasPattern[1].replace(/,/g, '');
    if (numberWithCommasPattern[1].includes(',') || parseInt(numberStr) >= 10) {
      const cents = normalizeCents(numberWithCommasPattern[2]);
      return `${numberStr}.${cents}`;
    }
  }

  // 5. "$XX.XX" or "$XX"
  const dollarSignPattern = text.match(/\$(\d+)(?:\.(\d{1,2}))?/);
  if (dollarSignPattern) {
    const dollars = dollarSignPattern[1];
    const cents = normalizeCents(dollarSignPattern[2]);
    return `${dollars}.${cents}`;
  }

  return "";
}

/** Normalizes a captured cents group to 2 digits ("5" → "50", undefined → "00"). */
function normalizeCents(raw) {
  if (!raw) return '00';
  return raw.length === 1 ? raw + '0' : raw;
}

/**
 * Extracts the expense category from the text between "category" and "description".
 * Fuzzy-matches against configured categories; returns raw extracted text if no match
 * (allows new categories not yet in the list).
 */
export function extractExpenseCategory(transcript) {
  if (!transcript) return "";
  
  const lower = transcript.toLowerCase();
  const categoryKeywordWithIs = "category is";
  const categoryKeyword = "category";
  const descriptionKeywordWithIs = "description is";
  const descriptionKeyword = "description";
  
  // STEP 1: Try to find "category is" first, then fall back to "category"
  let categoryStartIdx = lower.indexOf(categoryKeywordWithIs);
  let categoryOffset;
  
  if (categoryStartIdx !== -1) {
    categoryOffset = categoryStartIdx + categoryKeywordWithIs.length;
  } else {
    categoryStartIdx = lower.indexOf(categoryKeyword);
    if (categoryStartIdx === -1) {
      // FALLBACK: if no "category" found, search entire transcript
      const categories = getCachedExpenseCategories();
      return bestMatchFromList(transcript, categories, 0.25);
    }
    categoryOffset = categoryStartIdx + categoryKeyword.length;
  }
  
  // STEP 2: Find "description is" or "description" after the category keyword
  const afterCategoryStart = lower.substring(categoryOffset);
  let descriptionStartIdx = afterCategoryStart.indexOf(descriptionKeywordWithIs);
  let descriptionOffset;
  
  if (descriptionStartIdx !== -1) {
    descriptionOffset = descriptionStartIdx;
  } else {
    descriptionStartIdx = afterCategoryStart.indexOf(descriptionKeyword);
    if (descriptionStartIdx === -1) {
      // FALLBACK: If no "description" found, take everything after the category keyword
      let categoryText = transcript.substring(categoryOffset);
      categoryText = categoryText
        .replace(/^[\s:,-]+/i, "") // Remove leading separators
        .replace(/[\s:,-]+$/i, "") // Remove trailing separators
        .trim();
      
      if (!categoryText) {
        const categories = getCachedExpenseCategories();
        return bestMatchFromList(transcript, categories, 0.25);
      }
      
      const categories = getCachedExpenseCategories();
      const matched = bestMatchFromList(categoryText, categories, 0.25);
      return matched || categoryText;
    }
    descriptionOffset = descriptionStartIdx;
  }
  
  // STEP 3: Extract text between category keyword and description keyword
  const categoryText = transcript.substring(
    categoryOffset,
    categoryOffset + descriptionOffset
  );
  
  // STEP 4: Clean up the extracted text
  const cleanedCategoryText = categoryText
    .replace(/^[\s:,-]+/i, "") // Remove leading separators
    .replace(/[\s:,-.]+$/i, "") // Remove trailing separators and periods
    .trim();
  
  if (!cleanedCategoryText) {
    // FALLBACK: if extraction failed, search entire transcript
    const categories = getCachedExpenseCategories();
    return bestMatchFromList(transcript, categories, 0.25);
  }
  
  // STEP 5: Match the extracted text against the category list
  const categories = getCachedExpenseCategories();
  const matched = bestMatchFromList(cleanedCategoryText, categories, 0.25);
  
  // STEP 6: Return matched category or cleaned extracted text
  if (matched) {
    return matched;
  }
  
  // If no match found but we extracted text, return the cleaned extracted text
  // (in case it's a new category not in the list)
  return cleanedCategoryText;
}

// Characters that must never appear in a description.
// Uses split/join (not regex char classes) for cross-engine safety (V8, Hermes, JSC).
const DESCRIPTION_BAD_CHARS = ['"', '{', '}', '[', ']', ':', ';', '\\', '<', '>', '`', '~', '^', '|'];

/** Strips JSON/special chars from description. Result starts and ends with [a-zA-Z0-9]. */
export function sanitizeDescription(str) {
  if (str == null || typeof str !== "string") return "";
  let s = str;
  // Step 1: Remove each known-bad character by replacing with a space (no regex ambiguity)
  for (const ch of DESCRIPTION_BAD_CHARS) {
    s = s.split(ch).join(" ");
  }
  // Step 2: Collapse runs of whitespace and trim
  s = s.replace(/\s+/g, " ").trim();
  // Step 3: Trim non-alphanumeric leftovers from both ends (periods, commas, dashes, etc.)
  while (s.length > 0 && !/[a-zA-Z0-9]/.test(s.charAt(0))) s = s.slice(1);
  while (s.length > 0 && !/[a-zA-Z0-9]/.test(s.charAt(s.length - 1))) s = s.slice(0, -1);
  return s.trim();
}

/** Extracts everything after "description (is)" and sanitizes it. */
export function extractDescription(transcript) {
  if (!transcript) return "";
  const lower = transcript.toLowerCase();
  const keywordWithIs = "description is";
  const keyword = "description";

  // STEP 1: Try to find "description is" first, then fall back to "description"
  let startIdx = lower.indexOf(keywordWithIs);
  let offset;

  if (startIdx !== -1) {
    offset = startIdx + keywordWithIs.length;
  } else {
    startIdx = lower.indexOf(keyword);
    if (startIdx === -1) return ""; // No description keyword found
    offset = startIdx + keyword.length;
  }

  // STEP 2: Extract everything after the keyword (to end of transcript)
  let after = transcript.slice(offset);

  // STEP 3: Clean up - remove leading separators like ":", "-", ",", spaces, etc.
  after = after.replace(/^[\s:,-]+/i, "").trim();

  // STEP 4: Sanitize to letters, numbers, and safe punctuation only (no JSON/special chars)
  return sanitizeDescription(after);
}

