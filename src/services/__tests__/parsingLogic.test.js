/**
 * Test cases for parsingLogic.js
 *
 * Transcript pattern:
 *   "Charge $xx.yy to <account>. Date is <date>. Category is <category>. Description is <text>"
 */

import {
  extractDate,
  extractCardName,
  extractExpenseAmount,
  extractExpenseCategory,
  extractDescription,
  sanitizeDescription,
  tryReconstructTranscriptFromJson,
  buildExpenseRecordFromTranscript,
  loadConfigLists,
} from '../parsingLogic';

jest.mock('../configService', () => ({
  getAccountNames: jest.fn(() => Promise.resolve([
    "Chase checking", "BOA checking", "Amazon Visa", "Chase unlimited",
    "Chase Sapphire", "Chase freedom rotate", "Amex blue cash preferred",
    "BOA cash reward", "Discover it", "Capital One Quicksilver",
    "YF USBank Cashplus", "LL USBank Cashplus", "CITI Costco",
    "Wells Fargo Active Cash", "Wayfair", "IKEA", "Walmart OnePay",
    "Citi DoubleCash", "Cash", "Business Checking", "Ink Business",
  ])),
  getExpenseCategories: jest.fn(() => Promise.resolve([
    "Business", "Car fuel", "Car insurance", "Car maintenance", "Clothing",
    "Commute", "Dining", "Donna related", "Education", "Entertainment",
    "Gift purchase", "Grocery", "Home improvement", "Home insurance and tax",
    "Home maintenance", "Household items", "Medical", "Misc", "Mortgage",
    "Rental expenses", "Subscription or membership", "Tax related",
    "Travel-business", "Travel-personal", "Utility Electricity",
    "Utility Gas", "Utility Phone", "Utility Internet", "Utility Water",
  ])),
}));

/** Returns today's date in YYYY-MM-DD format. */
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('parsingLogic', () => {
  beforeAll(async () => {
    await loadConfigLists();
  });

  // -----------------------------------------------------------------------
  // extractExpenseAmount
  // -----------------------------------------------------------------------
  describe('extractExpenseAmount', () => {
    test('dollar amount with cents', () => {
      expect(extractExpenseAmount("Charge $30.50 to Chase. Category is Misc. Description is test")).toBe("30.50");
    });

    test('dollar amount without cents', () => {
      expect(extractExpenseAmount("Charge $30 to Chase. Category is Misc. Description is test")).toBe("30.00");
    });

    test('large amount with commas', () => {
      expect(extractExpenseAmount("Charge $4,000.50 to CITI COSTCO. Category is Grocery. Description is shopping")).toBe("4000.50");
    });

    test('single digit cents padded to 2 digits', () => {
      expect(extractExpenseAmount("Charge $30.5 to Chase Sapphire. Category is Dining. Description is dinner")).toBe("30.50");
    });

    test('cents only format', () => {
      expect(extractExpenseAmount("Charge 99 cents to Amazon Visa. Category is Misc. Description is small purchase")).toBe("0.99");
    });

    test('verbal format with dollars and cents', () => {
      expect(extractExpenseAmount("Charge 325 dollars and 39 cents to Chase freedom. Category is Gift purchase. Description is gift")).toBe("325.39");
    });

    test('verbal format with dollars only', () => {
      expect(extractExpenseAmount("Charge 325 dollars to Capital One. Category is Grocery. Description is shopping")).toBe("325.00");
    });

    test('returns empty string when no amount found', () => {
      expect(extractExpenseAmount("Charge to Chase Unlimited. Category is Misc. Description is no amount")).toBe("");
    });
  });

  // -----------------------------------------------------------------------
  // extractCardName
  // -----------------------------------------------------------------------
  describe('extractCardName', () => {
    test('standard format', () => {
      expect(extractCardName("Charge $30.50 to Chase Unlimited. Category is Gift purchase. Description is groceries")).toBe("Chase unlimited");
    });

    test('special characters in card name', () => {
      expect(extractCardName("Charge $4,000.50 to CITI COSTCO. Category is Grocery. Description is shopping")).toBe("CITI Costco");
    });

    test('card name not in description confusion', () => {
      expect(extractCardName("Charge $50 to Wells Fargo 2%. Category is Dining. Description is dinner at Chase restaurant")).toBe("Wells Fargo Active Cash");
    });

    test('card name with "to" keyword', () => {
      expect(extractCardName("Charge $75 to Amazon Visa. Category is Household essentials. Description is online purchase")).toBe("Amazon Visa");
    });

    test('returns empty string when card not in list', () => {
      expect(extractCardName("Charge $50 to Unknown Card. Category is Misc. Description is test")).toBe("");
    });

    test('case-insensitive matching', () => {
      expect(extractCardName("Charge $30 to chase unlimited. Category is Misc. Description is test")).toBe("Chase unlimited");
    });

    test('disambiguates "Cash" from cards containing "cash"', () => {
      // Exact "Cash" → "Cash"
      expect(extractCardName("Charge $50 to Cash. Category is Misc. Description is payment")).toBe("Cash");
      // "Citi DoubleCash" → "Citi DoubleCash"
      expect(extractCardName("Charge $100 to Citi DoubleCash. Category is Misc. Description is payment")).toBe("Citi DoubleCash");
      // "Wells Fargo Active Cash" → "Wells Fargo Active Cash"
      expect(extractCardName("Charge $100 to Wells Fargo Active Cash. Category is Misc. Description is payment")).toBe("Wells Fargo Active Cash");
      // "YF USBank Cashplus" → "YF USBank Cashplus"
      expect(extractCardName("Charge $100 to YF USBank Cashplus. Category is Misc. Description is payment")).toBe("YF USBank Cashplus");
      // "double cash" (spoken as two words) → "Citi DoubleCash"
      expect(extractCardName("charge $26.65 to double cash. Category is entertainment. Description is dance fee")).toBe("Citi DoubleCash");
    });

    test('partial matches prefer longer/more-specific candidates', () => {
      expect(extractCardName("charge $25 to YF cash plus. Category is Misc. Description is test")).toBe("YF USBank Cashplus");
      expect(extractCardName("charge $25 to blue cash. Category is Misc. Description is test")).toBe("Amex blue cash preferred");
      expect(extractCardName("charge $25 to cash preferred. Category is Misc. Description is test")).toBe("Amex blue cash preferred");
      expect(extractCardName("charge $25 to cash reward. Category is Misc. Description is test")).toBe("BOA cash reward");
      expect(extractCardName("charge $25 to Active Cash. Category is Misc. Description is test")).toBe("Wells Fargo Active Cash");
      expect(extractCardName("charge $25 to double Cash. Category is Misc. Description is test")).toBe("Citi DoubleCash");
      expect(extractCardName("charge $25 to Cash. Category is Misc. Description is test")).toBe("Cash");
    });
  });

  // -----------------------------------------------------------------------
  // extractExpenseCategory
  // -----------------------------------------------------------------------
  describe('extractExpenseCategory', () => {
    test('standard "Category is" format', () => {
      expect(extractExpenseCategory("Charge $30 to Chase. Category is Gift purchase. Description is groceries")).toBe("Gift purchase");
    });

    test('"Category" without "is"', () => {
      expect(extractExpenseCategory("Charge $75 to Amazon Visa. Category Grocery. Description is shopping")).toBe("Grocery");
    });

    test('multi-word category', () => {
      expect(extractExpenseCategory("Charge $150 to Chase. Category is Subscription or membership. Description is Netflix")).toBe("Subscription or membership");
    });

    test('returns extracted text when category not in list', () => {
      expect(extractExpenseCategory("Charge $50 to Chase. Category is New Category. Description is test")).toBe("New Category");
    });

    test('case-insensitive matching', () => {
      expect(extractExpenseCategory("Charge $30 to Chase. Category is gift purchase. Description is test")).toBe("Gift purchase");
    });
  });

  // -----------------------------------------------------------------------
  // extractDescription
  // -----------------------------------------------------------------------
  describe('extractDescription', () => {
    test('standard format', () => {
      expect(extractDescription("Charge $30 to Chase. Category is Gift purchase. Description is parents visiting groceries")).toBe("parents visiting groceries");
    });

    test('"Description" without "is"', () => {
      expect(extractDescription("Charge $75 to Amazon Visa. Category is Grocery. Description weekly shopping")).toBe("weekly shopping");
    });

    test('multi-sentence description', () => {
      expect(extractDescription("Charge $150 to Chase. Category is Subscription. Description is Netflix subscription. Monthly fee")).toBe("Netflix subscription. Monthly fee");
    });

    test('description with special characters (& #)', () => {
      expect(extractDescription("Charge $25 to Capital One. Category is Misc. Description is coffee & donuts")).toBe("coffee & donuts");
      expect(extractDescription("Charge $50 to BOA. Category is Misc. Description is item #12345")).toBe("item #12345");
    });

    test('returns empty string when no description keyword', () => {
      expect(extractDescription("Charge $30 to Chase. Category is Misc")).toBe("");
    });

    test('strips JSON artifacts from API responses', () => {
      expect(extractDescription('{"category": "grocery", "amount": 25.25, "description": "Friday groceries"}')).toBe("Friday groceries");
      const payload = '{"payload": "25.25 to Amex, category Grocery, description Friday groceries"}';
      expect(extractDescription(payload)).toBe("Friday groceries");
    });

    test('strips trailing ."} artifacts from non-JSON fragments', () => {
      const bodu = '","transcript bodu":"Charge $25.25 to Amex Blue Cash preferred, category Grocery, Description is Friday groceries."}';
      expect(extractDescription(bodu)).toBe("Friday groceries");

      const textPrefix = '"text": "Charge $25.25 to Amex Blue Cash preferred, category Grocery, Description is Friday groceries shopping."}';
      const got = extractDescription(textPrefix);
      expect(got).toBe("Friday groceries shopping");
      expect(got).not.toMatch(/[^a-zA-Z0-9]$/);
    });
  });

  // -----------------------------------------------------------------------
  // sanitizeDescription
  // -----------------------------------------------------------------------
  describe('sanitizeDescription', () => {
    test('strips JSON artifacts (quotes, braces, colons)', () => {
      expect(sanitizeDescription('": "Friday groceries"}')).toBe("Friday groceries");
      expect(sanitizeDescription('Friday groceries"}')).toBe("Friday groceries");
      expect(sanitizeDescription('Friday groceries"}\'')).toBe("Friday groceries");
    });

    test('strips ."} trailing combo', () => {
      expect(sanitizeDescription('Friday groceries."}')).toBe("Friday groceries");
      expect(sanitizeDescription("Friday groceries.'}")).toBe("Friday groceries");
      expect(sanitizeDescription('Friday groceries shopping."}')).toBe("Friday groceries shopping");
      expect(sanitizeDescription('Friday groceries shopping."\'')).toBe("Friday groceries shopping");
      expect(sanitizeDescription('Friday groceries shopping."}\n')).toBe("Friday groceries shopping");
    });

    test('result always starts and ends with a letter or digit', () => {
      expect(sanitizeDescription('...Friday groceries...')).toBe("Friday groceries");
      expect(sanitizeDescription('  ": Friday groceries."} ')).toBe("Friday groceries");
      expect(sanitizeDescription('"}')).toBe("");
    });

    test('preserves safe mid-text punctuation', () => {
      expect(sanitizeDescription("Netflix subscription. Monthly fee")).toBe("Netflix subscription. Monthly fee");
      expect(sanitizeDescription("coffee & donuts")).toBe("coffee & donuts");
      expect(sanitizeDescription("item #12345")).toBe("item #12345");
    });
  });

  // -----------------------------------------------------------------------
  // tryReconstructTranscriptFromJson
  // -----------------------------------------------------------------------
  describe('tryReconstructTranscriptFromJson', () => {
    test('reconstructs from structured expense JSON', () => {
      const json = '{"amount": 35.25, "payment_method": "Amex Blue Cash Preferred", "category": "groceries", "description": "Friday grocery"}';
      expect(tryReconstructTranscriptFromJson(json)).toBe(
        'Charge $35.25. to Amex Blue Cash Preferred. Category is groceries. Description is Friday grocery'
      );
    });

    test('extracts natural-language fields (query, payload)', () => {
      expect(tryReconstructTranscriptFromJson('{"query": "Charge $25 to Chase unlimited, category Grocery, description weekly shopping"}'))
        .toBe('Charge $25 to Chase unlimited, category Grocery, description weekly shopping');
      expect(tryReconstructTranscriptFromJson('{"payload": "25.25 to Amex, category Grocery, description Friday groceries"}'))
        .toBe('25.25 to Amex, category Grocery, description Friday groceries');
    });

    test('returns null for non-JSON and empty/null', () => {
      expect(tryReconstructTranscriptFromJson('just plain text')).toBe(null);
      expect(tryReconstructTranscriptFromJson('')).toBe(null);
      expect(tryReconstructTranscriptFromJson(null)).toBe(null);
    });
  });

  // -----------------------------------------------------------------------
  // buildExpenseRecordFromTranscript — JSON API responses
  // -----------------------------------------------------------------------
  describe('buildExpenseRecordFromTranscript (JSON formats)', () => {
    function expectCleanDescription(record) {
      expect(record.description).not.toMatch(/[^a-zA-Z0-9]$/);
      expect(record.description).not.toContain('"}');
      expect(record.description).not.toContain("'}");
      expect(record.description).not.toContain('{');
      expect(record.description).not.toContain('"');
    }

    test('structured JSON with payment_method', () => {
      const record = buildExpenseRecordFromTranscript('{"amount": 35.25, "payment_method": "Amex Blue Cash Preferred", "category": "groceries", "description": "Friday grocery"}');
      expect(record.expense_amount).toBe("35.25");
      expect(record.expense_category).toBe("Grocery");
      expect(record.description).toBe("Friday grocery");
      expectCleanDescription(record);
    });

    test('structured JSON with card_name', () => {
      const record = buildExpenseRecordFromTranscript('{"amount": "25.25", "card_name": "Chase unlimited", "expense_category": "Dining", "description": "dinner with friends"}');
      expect(record.expense_amount).toBe("25.25");
      expect(record.expense_category).toBe("Dining");
      expect(record.description).toBe("dinner with friends");
      expectCleanDescription(record);
    });

    test('JSON with query field', () => {
      const record = buildExpenseRecordFromTranscript('{"query": "Charge $25 to Chase unlimited, category Grocery, description weekly shopping"}');
      expect(record.expense_amount).toBe("25.00");
      expect(record.description).toBe("weekly shopping");
      expectCleanDescription(record);
    });

    test('non-JSON with trailing ."} artifacts', () => {
      const record = buildExpenseRecordFromTranscript('"text": "Charge $25.25 to Amex Blue Cash preferred, category Grocery, Description is Friday groceries shopping."}');
      expect(record.description).toBe("Friday groceries shopping");
      expect(record.expense_amount).toBe("25.25");
      expect(record.expense_category).toBe("Grocery");
      expectCleanDescription(record);
    });
  });

  // -----------------------------------------------------------------------
  // extractDate
  // -----------------------------------------------------------------------
  describe('extractDate', () => {
    test('month name format', () => {
      const year = new Date().getFullYear();
      expect(extractDate("Charge $30 to Chase. Date is December 3rd. Category is Misc. Description is test")).toBe(`${year}-12-03`);
    });

    test('"today" keyword', () => {
      expect(extractDate("Charge $50 to Chase. Date is today. Category is Dining. Description is dinner")).toBe(todayISO());
    });

    test('"yesterday" keyword', () => {
      const y = new Date(); y.setDate(y.getDate() - 1);
      const expected = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
      expect(extractDate("Charge $100 to Discover. Date is yesterday. Category is Gift purchase. Description is gift")).toBe(expected);
    });

    test('ISO format', () => {
      expect(extractDate("Charge $200 to USBank. Date is 2024-12-05. Category is Utilities. Description is bill")).toBe("2024-12-05");
    });

    test('defaults to today when no date found', () => {
      expect(extractDate("Charge $75 to Amazon Visa. Category is Grocery. Description is shopping")).toBe(todayISO());
    });
  });

  // -----------------------------------------------------------------------
  // buildExpenseRecordFromTranscript — natural language
  // -----------------------------------------------------------------------
  describe('buildExpenseRecordFromTranscript (natural language)', () => {
    test('complete standard transcript', () => {
      const result = buildExpenseRecordFromTranscript(
        "Charge $30.50 to Chase Unlimited. Date is December 3rd. Category is Gift purchase. Description is parents visiting groceries"
      );
      expect(result).toEqual({
        date: `${new Date().getFullYear()}-12-03`,
        card_name: "Chase unlimited",
        expense_amount: "30.50",
        expense_category: "Gift purchase",
        description: "parents visiting groceries",
      });
    });

    test('verbal amount format (dollars and cents)', () => {
      const result = buildExpenseRecordFromTranscript(
        "Charge 325 dollars and 39 cents to Chase freedom. Date is December 1st. Category is Gift purchase. Description is birthday gift"
      );
      expect(result.expense_amount).toBe("325.39");
      expect(result.card_name).toBe("Chase freedom rotate");
      expect(result.description).toBe("birthday gift");
    });

    test('handles missing optional fields gracefully', () => {
      const result = buildExpenseRecordFromTranscript("Charge $30 to Chase Unlimited. Category is Misc. Description is test");
      expect(result.date).toBe(todayISO());
      expect(result.card_name).toBe("Chase unlimited");
      expect(result.expense_amount).toBe("30.00");
      expect(result.expense_category).toBe("Misc");
      expect(result.description).toBe("test");
    });

    test('fuzzy matching ("Inc Business" → "Business Checking")', () => {
      const result = buildExpenseRecordFromTranscript("Charge $20 to Inc Business. Category is Dining Out. Description is Lunch");
      expect(result.card_name).toBe("Business Checking");
      expect(result.expense_amount).toBe("20.00");
      expect(result.expense_category).toBe("Dining");
      expect(result.description).toBe("Lunch");
    });
  });
});
