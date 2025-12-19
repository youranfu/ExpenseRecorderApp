/**
 * Expense parsing logic - Ported from script.js
 * These functions extract structured data from transcribed text.
 */

import { getAccountNames, getExpenseCategories } from "./configService";

// Cached lists (loaded from AsyncStorage)
let cachedAccountNames = null;
let cachedExpenseCategories = null;

/**
 * Load account names and expense categories from storage
 * Call this at app startup to cache the lists
 */
export async function loadConfigLists() {
  try {
    [cachedAccountNames, cachedExpenseCategories] = await Promise.all([
      getAccountNames(),
      getExpenseCategories(),
    ]);
  } catch (error) {
    console.error("Error loading config lists:", error);
    // Fallback to empty arrays if loading fails
    cachedAccountNames = [];
    cachedExpenseCategories = [];
  }
}

/**
 * Get cached account names (synchronous)
 * Returns empty array if not loaded yet
 */
function getCachedAccountNames() {
  return cachedAccountNames || [];
}

/**
 * Get cached expense categories (synchronous)
 * Returns empty array if not loaded yet
 */
function getCachedExpenseCategories() {
  return cachedExpenseCategories || [];
}

/**
 * Refresh the cached lists from storage
 */
export async function refreshConfigLists() {
  await loadConfigLists();
}

/**
 * Builds an expense record object from a transcript string.
 */
export function buildExpenseRecordFromTranscript(transcript) {
  const date = extractDate(transcript) || "";
  const cardName = extractCardName(transcript) || "";
  const expenseAmount = extractExpenseAmount(transcript) || "";
  const expenseCategory = extractExpenseCategory(transcript) || "";
  const description = extractDescription(transcript) || "";

  return {
    date,
    card_name: cardName,
    expense_amount: expenseAmount,
    expense_category: expenseCategory,
    description,
  };
}

/**
 * Extracts date from transcript.
 * Supports various formats: ISO dates, US dates, month names, "today", "yesterday".
 */
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

// ----------------------------------------
// Fuzzy helpers for matching against lists
// ----------------------------------------

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

// Very lightweight stemming so that simple plural/singular
// differences (e.g. "groceries" vs "grocery") still match.
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

function bestMatchFromList(transcript, candidates, minScore) {
  const normalizedTranscript = normalizeForMatch(transcript);
  if (!normalizedTranscript) return "";

  const transcriptTokens = new Set(textTokens(transcript));

  let best = "";
  let bestScore = 0;

  for (const candidate of candidates) {
    const candidateNorm = normalizeForMatch(candidate);
    if (!candidateNorm) continue;

    // If candidate string (normalized) appears as a phrase, give it a strong boost.
    let score = normalizedTranscript.includes(candidateNorm) ? 1 : 0;

    const cTokens = candidateNorm.split(" ").filter(Boolean);
    if (cTokens.length) {
      let overlap = 0;
      for (const tok of cTokens) {
        if (transcriptTokens.has(tok)) overlap += 1;
      }
      const tokenScore = overlap / cTokens.length;
      score = Math.max(score, tokenScore);
    }

    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return bestScore >= (minScore ?? 0.3) ? best : "";
}

/**
 * Extracts the card/account name from a transcript.
 * 
 * LOGIC OVERVIEW:
 * The card name is the text between "charge" and the next keyword (either "category" or "description").
 * This function extracts that text, cleans it, and matches it against the known account names list.
 * 
 * SUPPORTED PATTERNS:
 * - "Charge $30 to Chase Unlimited. Category is gift purchase. Description is groceries"
 *   → Extracts: "$30 to Chase Unlimited" → Matches: "Chase Unlimited"
 * - "Charge $30 to CITI COSTCO. Description is groceries"
 *   → Extracts: "$30 to CITI COSTCO" → Matches: "CITI COSTCO"
 * - "Charge to Chase Sapphire. Category is dining"
 *   → Extracts: "to Chase Sapphire" → Matches: "Chase Sapphire"
 * 
 * STEP-BY-STEP PROCESS:
 * 1. Find "charge" keyword in the transcript (case-insensitive)
 * 2. Find the next keyword: Try "category" first, then "description" (whichever comes first)
 * 3. Extract text between "charge" and the found keyword
 * 4. Clean extracted text: Remove leading/trailing separators (spaces, colons, commas, dashes)
 * 5. Match against account names list: Use fuzzy matching to find best match
 * 6. Return matched account name OR empty string if no match found
 * 
 * FALLBACK BEHAVIOR:
 * - If no "charge" keyword found: Search entire transcript for account name matches
 * - If no "category" or "description" found: Take everything after "charge"
 * - If extraction fails: Search entire transcript for account name matches
 * - If no match found: Return empty string (unlike category, we don't return raw text)
 * 
 * NOTE: The extracted text may contain the amount (e.g., "$30 to Chase"), but the fuzzy
 * matching will still find the account name correctly.
 * 
 * @param {string} transcript - The full transcript text
 * @returns {string} - The matched account name, or empty string if not found
 * 
 * @example
 * extractCardName("Charge $30 to Chase Unlimited. Category is gift purchase")
 * // Returns: "Chase Unlimited" (matched from account names list)
 * 
 * @example
 * extractCardName("Charge to CITI COSTCO. Description is groceries")
 * // Returns: "CITI COSTCO" (matched from account names list)
 * 
 * @example
 * extractCardName("Charge $4,000 to Amazon Visa")
 * // Returns: "Amazon Visa" (matched from account names list)
 * 
 * @example
 * extractCardName("No charge keyword here")
 * // Returns: "" (empty string, falls back to searching entire transcript)
 */
export function extractCardName(transcript) {
  if (!transcript) return "";
  
  const lower = transcript.toLowerCase();
  const chargeKeyword = "charge";
  const categoryKeyword = "category";
  const descriptionKeyword = "description";
  
  // STEP 1: Find "charge" keyword in the transcript
  const chargeStartIdx = lower.indexOf(chargeKeyword);
  if (chargeStartIdx === -1) {
    // FALLBACK: if no "charge" found, search entire transcript
    const cardNames = getCachedAccountNames();
    return bestMatchFromList(transcript, cardNames, 0.3);
  }
  
  const chargeOffset = chargeStartIdx + chargeKeyword.length;
  
  // STEP 2: Find the next keyword ("category" or "description") after "charge"
  const afterCharge = lower.substring(chargeOffset);
  const categoryIdx = afterCharge.indexOf(categoryKeyword);
  const descriptionIdx = afterCharge.indexOf(descriptionKeyword);
  
  let nextKeywordOffset;
  if (categoryIdx !== -1 && descriptionIdx !== -1) {
    // Both found - use whichever comes first
    nextKeywordOffset = Math.min(categoryIdx, descriptionIdx);
  } else if (categoryIdx !== -1) {
    nextKeywordOffset = categoryIdx;
  } else if (descriptionIdx !== -1) {
    nextKeywordOffset = descriptionIdx;
  } else {
    // FALLBACK: If no "category" or "description" found, take everything after "charge"
    let cardText = transcript.substring(chargeOffset);
    cardText = cardText
      .replace(/^[\s:,-]+/i, "") // Remove leading separators
      .replace(/[\s:,-]+$/i, "") // Remove trailing separators
      .trim();
    
    if (!cardText) {
      const cardNames = getCachedAccountNames();
      return bestMatchFromList(transcript, cardNames, 0.3);
    }
    
    const cardNames = getCachedAccountNames();
    return bestMatchFromList(cardText, cardNames, 0.3);
  }
  
  // STEP 3: Extract text between "charge" and the next keyword
  const cardText = transcript.substring(
    chargeOffset,
    chargeOffset + nextKeywordOffset
  );
  
  // STEP 4: Clean up the extracted text
  const cleanedCardText = cardText
    .replace(/^[\s:,-]+/i, "") // Remove leading separators
    .replace(/[\s:,-]+$/i, "") // Remove trailing separators
    .trim();
  
  if (!cleanedCardText) {
    // FALLBACK: if extraction failed, search entire transcript
    const cardNames = getCachedAccountNames();
    return bestMatchFromList(transcript, cardNames, 0.3);
  }
  
  // STEP 5: Match the extracted text against the account names list
  const cardNames = getCachedAccountNames();
  const matched = bestMatchFromList(cleanedCardText, cardNames, 0.3);
  
  // STEP 6: Return matched account name or empty string
  return matched || "";
}

/**
 * Extracts the expense amount from a transcript.
 * 
 * LOGIC OVERVIEW:
 * The amount is the text between "charge" and the next keyword (either "category" or "description").
 * This function first extracts that text segment, then searches for monetary amounts in various
 * formats within that segment, and normalizes them to a standard format: "XX.XX" (dollars.cents as a string).
 * 
 * The function tries patterns in order of specificity (most specific first) to avoid false matches.
 * For example, "cents only" is checked before general dollar patterns to correctly handle "99 cents" vs "$99".
 * 
 * SUPPORTED PATTERNS (in order of matching):
 * 
 * 1. VERBAL FORMAT: "XX dollars (and YY cents)" where cents is optional
 *    - "325 dollars" → "325.00"
 *    - "325 dollars and 39 cents" → "325.39"
 *    - "4,000 dollars" → "4000.00"
 *    - "4,000 dollars and 50 cents" → "4000.50"
 *    - Checked FIRST to avoid matching just "39 cents" from "325 dollars and 39 cents"
 * 
 * 2. CENTS ONLY: "XX cents" (without dollars)
 *    - "99 cents" → "0.99"
 *    - "5 cents" → "0.05"
 *    - "1 cent" → "0.01"
 * 
 * 3. DOLLAR SIGN WITH COMMAS: "$XX,XXX.XX" or "$XX,XXX"
 *    - "$4,000" → "4000.00"
 *    - "$4,000.50" → "4000.50"
 *    - "$1,234,567.89" → "1234567.89"
 *    - "$30.5" → "30.50" (single digit cents padded)
 * 
 * 4. NUMBER WITH COMMAS (no dollar sign): "XX,XXX.XX" or "XX,XXX"
 *    - "4,000" → "4000.00"
 *    - "4,000.50" → "4000.50"
 *    - Only matches if number has commas OR is >= 10 (to avoid false matches)
 * 
 * 5. DOLLAR SIGN WITHOUT COMMAS: "$XX.XX" or "$XX"
 *    - "$30" → "30.00"
 *    - "$30.5" → "30.50"
 *    - "$30.50" → "30.50"
 * 
 * STEP-BY-STEP PROCESS:
 * 1. Find "charge" keyword in the transcript (case-insensitive)
 * 2. Find the next keyword: Try "category" first, then "description" (whichever comes first)
 * 3. Extract text segment between "charge" and the found keyword
 * 4. Clean extracted text: Remove leading/trailing separators
 * 5. Search for amount patterns in the extracted segment (in order of specificity)
 * 6. Normalize found amount to "XX.XX" format
 * 7. Return normalized amount OR empty string if no pattern matches
 * 
 * FALLBACK BEHAVIOR:
 * - If no "charge" keyword found: Search entire transcript for amount patterns
 * - If no "category" or "description" found: Search everything after "charge" for amount patterns
 * - If extraction fails: Search entire transcript for amount patterns
 * 
 * NORMALIZATION RULES:
 * - All amounts are returned as strings in "XX.XX" format
 * - Cents are always 2 digits (padded with 0 if needed)
 * - Commas are removed from numbers
 * - Single-digit cents are padded (e.g., "$30.5" → "30.50")
 * 
 * EDGE CASES HANDLED:
 * - Single digit cents: "$30.5" → "30.50" (padded to 2 digits)
 * - Cents without dollars: "99 cents" → "0.99"
 * - Large numbers with commas: "$1,234,567.89" → "1234567.89"
 * - Verbal format: "325 dollars and 39 cents" → "325.39"
 * - Numbers without dollar sign: "4,000" → "4000.00" (only if >= 10 or has commas)
 * 
 * @param {string} transcript - The full transcript text
 * @returns {string} - The extracted amount in "XX.XX" format, or empty string if not found
 * 
 * @example
 * extractExpenseAmount("Charge $30 to Chase Unlimited. Category is gift purchase")
 * // Extracts segment: "$30 to Chase Unlimited" → Finds: "$30" → Returns: "30.00"
 * 
 * @example
 * extractExpenseAmount("Charge $4,000.50 to CITI COSTCO. Description is groceries")
 * // Extracts segment: "$4,000.50 to CITI COSTCO" → Finds: "$4,000.50" → Returns: "4000.50"
 * 
 * @example
 * extractExpenseAmount("Charge 325 dollars and 39 cents to card")
 * // Extracts segment: "325 dollars and 39 cents to card" → Finds: "325 dollars and 39 cents" → Returns: "325.39"
 * 
 * @example
 * extractExpenseAmount("Charge 99 cents to card")
 * // Extracts segment: "99 cents to card" → Finds: "99 cents" → Returns: "0.99"
 * 
 * @example
 * extractExpenseAmount("No charge keyword here")
 * // Falls back to searching entire transcript → Returns: "" (empty string)
 */
export function extractExpenseAmount(transcript) {
  if (!transcript) return "";
  
  const lower = transcript.toLowerCase();
  const chargeKeyword = "charge";
  const categoryKeyword = "category";
  const descriptionKeyword = "description";
  
  // STEP 1: Find "charge" keyword in the transcript
  const chargeStartIdx = lower.indexOf(chargeKeyword);
  let searchText = transcript;
  let searchTextLower = lower;
  
  if (chargeStartIdx !== -1) {
    const chargeOffset = chargeStartIdx + chargeKeyword.length;
    
    // STEP 2: Find the next keyword ("category" or "description") after "charge"
    const afterCharge = lower.substring(chargeOffset);
    const categoryIdx = afterCharge.indexOf(categoryKeyword);
    const descriptionIdx = afterCharge.indexOf(descriptionKeyword);
    
    let nextKeywordOffset;
    if (categoryIdx !== -1 && descriptionIdx !== -1) {
      // Both found - use whichever comes first
      nextKeywordOffset = Math.min(categoryIdx, descriptionIdx);
    } else if (categoryIdx !== -1) {
      nextKeywordOffset = categoryIdx;
    } else if (descriptionIdx !== -1) {
      nextKeywordOffset = descriptionIdx;
    } else {
      // FALLBACK: If no "category" or "description" found, take everything after "charge"
      nextKeywordOffset = afterCharge.length;
    }
    
    // STEP 3: Extract text segment between "charge" and the next keyword
    const amountText = transcript.substring(
      chargeOffset,
      chargeOffset + nextKeywordOffset
    );
    
    // STEP 4: Clean extracted text
    const cleanedAmountText = amountText
      .replace(/^[\s:,-]+/i, "") // Remove leading separators
      .replace(/[\s:,-]+$/i, "") // Remove trailing separators
      .trim();
    
    if (cleanedAmountText) {
      // Use the extracted segment for pattern matching
      searchText = cleanedAmountText;
      searchTextLower = cleanedAmountText.toLowerCase();
    }
    // If extraction failed, fall back to searching entire transcript
  }
  // If no "charge" found, searchText remains as entire transcript (fallback)
  
  // STEP 5: Search for amount patterns in the extracted segment (or entire transcript)
  const text = searchTextLower;

  // PATTERN 1: "XX dollars (and YY cents)" where cents part is optional
  // Matches: "325 dollars" -> 325.00
  // Matches: "325 dollars and 39 cents" -> 325.39
  // Matches: "4,000 dollars" -> 4000.00
  // Checked FIRST because it's more specific than "cents only" pattern
  // This prevents "325 dollars and 39 cents" from matching just "39 cents"
  const dollarsPattern = text.match(/\b([\d,]+)\s+dollars?(?:\s+and\s+(\d+)\s+cents?)?/);
  if (dollarsPattern) {
    const dollars = dollarsPattern[1].replace(/,/g, '');
    const cents = dollarsPattern[2] ? dollarsPattern[2].padStart(2, '0') : '00';
    return `${dollars}.${cents}`;
  }

  // PATTERN 2: "XX cents" (without dollars) -> 0.XX
  // Matches: "99 cents" -> 0.99
  // Matches: "5 cents" -> 0.05
  // Checked after dollars pattern to avoid false matches
  const centsOnlyPattern = text.match(/\b(\d+)\s+cents?\b/);
  if (centsOnlyPattern) {
    const cents = centsOnlyPattern[1].padStart(2, '0').substring(0, 2);
    return `0.${cents}`;
  }

  // PATTERN 3: "$XX,XXX.XX" or "$XX,XXX" format (with commas)
  // Matches: "$4,000" -> 4000.00
  // Matches: "$4,000.50" -> 4000.50
  // Matches: "$1,234,567.89" -> 1234567.89
  // Handles large amounts with comma separators
  const dollarSignWithCommasPattern = text.match(/\$([\d,]+)(?:\.(\d{1,2}))?/);
  if (dollarSignWithCommasPattern) {
    const dollars = dollarSignWithCommasPattern[1].replace(/,/g, '');
    let cents = '00';
    if (dollarSignWithCommasPattern[2]) {
      cents = dollarSignWithCommasPattern[2].length === 1 
        ? dollarSignWithCommasPattern[2] + '0' 
        : dollarSignWithCommasPattern[2];
    }
    return `${dollars}.${cents}`;
  }

  // PATTERN 4: "XX,XXX.XX" or "XX,XXX" format (without dollar sign, with commas)
  // Matches: "4,000" -> 4000.00
  // Matches: "4,000.50" -> 4000.50
  // Matches: "1,234,567.89" -> 1234567.89
  // Only processes if number has commas OR is >= 10 (to avoid false matches with small numbers)
  const numberWithCommasPattern = text.match(/\b([\d,]+)(?:\.(\d{1,2}))?\b/);
  if (numberWithCommasPattern) {
    const numberStr = numberWithCommasPattern[1].replace(/,/g, '');
    // Only process if it looks like a dollar amount (has commas or is reasonably large)
    // Skip single/double digit numbers that might be part of other text
    if (numberWithCommasPattern[1].includes(',') || parseInt(numberStr) >= 10) {
      let cents = '00';
      if (numberWithCommasPattern[2]) {
        cents = numberWithCommasPattern[2].length === 1 
          ? numberWithCommasPattern[2] + '0' 
          : numberWithCommasPattern[2];
      }
      return `${numberStr}.${cents}`;
    }
  }

  // PATTERN 5: "$XX.XX" or "$XX" format (without commas)
  // Matches: "$30" -> 30.00
  // Matches: "$30.5" -> 30.50
  // Matches: "$30.50" -> 30.50
  // Handles standard dollar amounts without comma separators
  const dollarSignPattern = text.match(/\$(\d+)(?:\.(\d{1,2}))?/);
  if (dollarSignPattern) {
    const dollars = dollarSignPattern[1];
    let cents = '00';
    if (dollarSignPattern[2]) {
      cents = dollarSignPattern[2].length === 1 
        ? dollarSignPattern[2] + '0' 
        : dollarSignPattern[2];
    }
    return `${dollars}.${cents}`;
  }


  // No pattern matched - return empty string
  return "";
}

/**
 * Extracts the expense category from a transcript.
 * 
 * LOGIC OVERVIEW:
 * The category is always the text between the category keyword and the description keyword.
 * This function extracts that text, cleans it, and matches it against the known category list.
 * 
 * SUPPORTED PATTERNS:
 * - "Category is gift purchase. Description is parents visiting groceries"
 *   → Extracts: "gift purchase"
 * - "Category gift purchase. Description is parents visiting groceries"
 *   → Extracts: "gift purchase"
 * - "Category is gift purchase. Description parents visiting groceries"
 *   → Extracts: "gift purchase"
 * - "Category gift purchase. Description parents visiting groceries"
 *   → Extracts: "gift purchase"
 * 
 * STEP-BY-STEP PROCESS:
 * 1. Find category keyword: Try "category is" first, fall back to "category"
 * 2. Find description keyword: Try "description is" first, fall back to "description"
 *    (must appear AFTER the category keyword)
 * 3. Extract text between the two keywords
 * 4. Clean extracted text: Remove leading/trailing separators (spaces, colons, commas, dashes)
 * 5. Match against category list: Use fuzzy matching to find best match
 * 6. Return matched category OR cleaned extracted text if no match found
 * 
 * FALLBACK BEHAVIOR:
 * - If no category keyword found: Search entire transcript for category matches
 * - If no description keyword found: Take everything after category keyword
 * - If extraction fails: Search entire transcript for category matches
 * - If no match found but text extracted: Return cleaned extracted text (for new categories)
 * 
 * @param {string} transcript - The full transcript text
 * @returns {string} - The matched category name or the extracted category text
 * 
 * @example
 * extractExpenseCategory("Category is gift purchase. Description is groceries")
 * // Returns: "Gift purchase" (matched from category list)
 * 
 * @example
 * extractExpenseCategory("Category gift purchase. Description groceries")
 * // Returns: "Gift purchase" (matched from category list)
 * 
 * @example
 * extractExpenseCategory("Category is new category. Description is something")
 * // Returns: "new category" (no match found, returns extracted text)
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

/**
 * Extracts the expense description from a transcript.
 * 
 * LOGIC OVERVIEW:
 * The description is everything after the description keyword until the end of the transcript.
 * This function finds the description keyword, extracts everything after it, and cleans it up.
 * 
 * SUPPORTED PATTERNS:
 * - "Description is parents visiting groceries"
 *   → Extracts: "parents visiting groceries"
 * - "Description parents visiting groceries"
 *   → Extracts: "parents visiting groceries"
 * - "Category is gift purchase. Description is parents visiting groceries"
 *   → Extracts: "parents visiting groceries"
 * - "Description: parents visiting groceries"
 *   → Extracts: "parents visiting groceries" (colon removed)
 * - "Description - parents visiting groceries"
 *   → Extracts: "parents visiting groceries" (dash removed)
 * 
 * STEP-BY-STEP PROCESS:
 * 1. Find description keyword: Try "description is" first, fall back to "description"
 * 2. Extract everything after the keyword (to end of transcript)
 * 3. Clean extracted text: Remove leading separators (spaces, colons, commas, dashes)
 * 4. Return cleaned text
 * 
 * NOTE: This function extracts everything after the description keyword, even if there's
 * more text after it. It assumes the description is the last meaningful part of the transcript.
 * 
 * @param {string} transcript - The full transcript text
 * @returns {string} - The extracted description text, or empty string if not found
 * 
 * @example
 * extractDescription("Category is gift purchase. Description is parents visiting groceries")
 * // Returns: "parents visiting groceries"
 * 
 * @example
 * extractDescription("Description is dinner with friends")
 * // Returns: "dinner with friends"
 * 
 * @example
 * extractDescription("Description: monthly subscription fee")
 * // Returns: "monthly subscription fee"
 * 
 * @example
 * extractDescription("No description keyword here")
 * // Returns: "" (empty string)
 */
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
  // Use original transcript to preserve casing/punctuation
  let after = transcript.slice(offset);

  // STEP 3: Clean up - remove leading separators like ":", "-", ",", spaces, etc.
  after = after.replace(/^[\s:,-]+/i, "").trim();

  return after;
}

