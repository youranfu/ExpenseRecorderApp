/**
 * Expense parsing logic - Ported from script.js
 * These functions extract structured data from transcribed text.
 */

// Configurable lists for card nicknames and expense categories
// Edit these arrays to control the allowed card names and categories.

export const CREDIT_CARD_NAMES = [
  "Chase checking",
  "BOA checking",
  "Amazon Visa",
  "Chase unlimited",
  "Chase Sapphire",
  "Chase freedom",
  "Amex blue cash preferred",
  "BOA cash reward",
  "Discover it",
  "Capital One",
  "USBank Cashplus - YF",
  "USBank Cashplus",
  "CITI COSTCO",
  "Wells Fargo 2%",
  "Wayfair",
  "IKEA",
  "Walmart OnePay",
  "Citi DoubleCash",
];

export const EXPENSE_CATEGORIES = [
  "Dining out",
  "Grocery",
  "Travel-personal",
  "Travel-business",
  "Rent/Mortgage",
  "Utilities",
  "Gaming or Entertainment",
  "Household essentials",
  "Donna related",
  "Health related",
  "Clothing or shoes",
  "Gift purchase",
  "Home maintenance",
  "Home improvement",
  "Subscription or membership",
  "Misc",
  "Car related",
  "Commute",
  "Tax related",
  "Rental related",
];

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

export function extractCardName(transcript) {
  return bestMatchFromList(transcript, CREDIT_CARD_NAMES, 0.3);
}

export function extractExpenseAmount(transcript) {
  const text = transcript.toLowerCase();

  // Pattern 1: "XX cents" (without dollars) -> 0.XX
  // Matches: "99 cents" -> 0.99
  // Matches: "5 cents" -> 0.05
  const centsOnlyPattern = text.match(/\b(\d+)\s+cents?\b/);
  if (centsOnlyPattern) {
    const cents = centsOnlyPattern[1].padStart(2, '0').substring(0, 2);
    return `0.${cents}`;
  }

  // Pattern 2: "$XX,XXX.XX" or "$XX,XXX" format (with commas)
  // Matches: "$4,000" -> 4000.00
  // Matches: "$4,000.50" -> 4000.50
  // Matches: "$1,234,567.89" -> 1234567.89
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

  // Pattern 3: "XX,XXX.XX" or "XX,XXX" format (without dollar sign, with commas)
  // Matches: "4,000" -> 4000.00
  // Matches: "4,000.50" -> 4000.50
  // Matches: "1,234,567.89" -> 1234567.89
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

  // Pattern 4: "$XX.XX" or "$XX" format (without commas)
  // Matches: "$30" -> 30.00
  // Matches: "$30.5" -> 30.50
  // Matches: "$30.50" -> 30.50
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

  // Pattern 5: "XX dollars (and YY cents)" where cents part is optional
  // Matches: "325 dollars" -> 325.00
  // Matches: "325 dollars and 39 cents" -> 325.39
  // Matches: "4,000 dollars" -> 4000.00
  const dollarsPattern = text.match(/\b([\d,]+)\s+dollars?(?:\s+and\s+(\d+)\s+cents?)?/);
  if (dollarsPattern) {
    const dollars = dollarsPattern[1].replace(/,/g, '');
    const cents = dollarsPattern[2] ? dollarsPattern[2].padStart(2, '0') : '00';
    return `${dollars}.${cents}`;
  }

  return "";
}

export function extractExpenseCategory(transcript) {
  return bestMatchFromList(transcript, EXPENSE_CATEGORIES, 0.25);
}

export function extractDescription(transcript) {
  if (!transcript) return "";
  const lower = transcript.toLowerCase();
  const keywordWithIs = "description is";
  const keyword = "description";

  let startIdx = lower.indexOf(keywordWithIs);
  let offset;

  if (startIdx !== -1) {
    offset = startIdx + keywordWithIs.length;
  } else {
    startIdx = lower.indexOf(keyword);
    if (startIdx === -1) return "";
    offset = startIdx + keyword.length;
  }

  // Slice from the original transcript to preserve casing/punctuation.
  let after = transcript.slice(offset);

  // Trim leading separators like ":", "-", ",", "is", etc.
  after = after.replace(/^[\s:,-]+/i, "").trim();

  return after;
}

