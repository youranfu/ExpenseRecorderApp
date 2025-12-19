/**
 * Test cases for parsingLogic.js
 * 
 * All transcripts follow the pattern:
 * "Charge $xx.yy to some_account_name. Date is zz. Category is some_category_name. Description is some_random_text_that_may_contains_account_or_category_name"
 */

import {
  extractDate,
  extractCardName,
  extractExpenseAmount,
  extractExpenseCategory,
  extractDescription,
  buildExpenseRecordFromTranscript,
  loadConfigLists,
} from '../parsingLogic';

// Mock the configService to return test data
jest.mock('../configService', () => ({
  getAccountNames: jest.fn(() => Promise.resolve([
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
  ])),
  getExpenseCategories: jest.fn(() => Promise.resolve([
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
  ])),
}));

describe('parsingLogic', () => {
  // Initialize config lists before all tests
  beforeAll(async () => {
    await loadConfigLists();
  });

  describe('extractExpenseAmount', () => {
    test('extracts dollar amount with cents from standard format', () => {
      const transcript = "Charge $30.50 to Chase Unlimited. Date is December 3rd. Category is Gift purchase. Description is parents visiting groceries";
      expect(extractExpenseAmount(transcript)).toBe("30.50");
    });

    test('extracts dollar amount without cents', () => {
      const transcript = "Charge $30 to Chase Unlimited. Date is December 3rd. Category is Gift purchase. Description is parents visiting groceries";
      expect(extractExpenseAmount(transcript)).toBe("30.00");
    });

    test('extracts large amount with commas', () => {
      const transcript = "Charge $4,000.50 to CITI COSTCO. Date is November 30th. Category is Grocery. Description is regular weekend shopping";
      expect(extractExpenseAmount(transcript)).toBe("4000.50");
    });

    test('extracts amount with single digit cents (pads to 2 digits)', () => {
      const transcript = "Charge $30.5 to Chase Sapphire. Date is today. Category is Dining out. Description is dinner with friends";
      expect(extractExpenseAmount(transcript)).toBe("30.50");
    });

    test('extracts cents only format', () => {
      const transcript = "Charge 99 cents to Amazon Visa. Date is today. Category is Misc. Description is small purchase";
      expect(extractExpenseAmount(transcript)).toBe("0.99");
    });

    test('extracts verbal format with dollars and cents', () => {
      const transcript = "Charge 325 dollars and 39 cents to Chase freedom. Date is December 1st. Category is Gift purchase. Description is birthday gift";
      expect(extractExpenseAmount(transcript)).toBe("325.39");
    });

    test('extracts verbal format with dollars only', () => {
      const transcript = "Charge 325 dollars to Capital One. Date is today. Category is Grocery. Description is weekly shopping";
      expect(extractExpenseAmount(transcript)).toBe("325.00");
    });

    test('extracts amount when description contains account name', () => {
      const transcript = "Charge $50 to Wells Fargo 2%. Date is December 5th. Category is Dining out. Description is dinner at Chase restaurant";
      expect(extractExpenseAmount(transcript)).toBe("50.00");
    });

    test('extracts amount when description contains category name', () => {
      const transcript = "Charge $100 to Discover it. Date is today. Category is Gift purchase. Description is Grocery store gift card";
      expect(extractExpenseAmount(transcript)).toBe("100.00");
    });

    test('returns empty string when no amount found', () => {
      const transcript = "Charge to Chase Unlimited. Date is today. Category is Misc. Description is no amount mentioned";
      expect(extractExpenseAmount(transcript)).toBe("");
    });
  });

  describe('extractCardName', () => {
    test('extracts account name from standard format', () => {
      const transcript = "Charge $30.50 to Chase Unlimited. Date is December 3rd. Category is Gift purchase. Description is parents visiting groceries";
      expect(extractCardName(transcript)).toBe("Chase unlimited");
    });

    test('extracts account name with special characters', () => {
      const transcript = "Charge $4,000.50 to CITI COSTCO. Date is November 30th. Category is Grocery. Description is regular weekend shopping";
      expect(extractCardName(transcript)).toBe("CITI COSTCO");
    });

    test('extracts account name when description contains account name', () => {
      const transcript = "Charge $50 to Wells Fargo 2%. Date is December 5th. Category is Dining out. Description is dinner at Chase restaurant";
      expect(extractCardName(transcript)).toBe("Wells Fargo 2%");
    });

    test('extracts account name with dash', () => {
      const transcript = "Charge $200 to USBank Cashplus - YF. Date is today. Category is Utilities. Description is electricity bill";
      expect(extractCardName(transcript)).toBe("USBank Cashplus - YF");
    });

    test('extracts account name when description contains category name', () => {
      const transcript = "Charge $100 to Discover it. Date is today. Category is Gift purchase. Description is Grocery store gift card";
      expect(extractCardName(transcript)).toBe("Discover it");
    });

    test('extracts account name with "to" keyword', () => {
      const transcript = "Charge $75 to Amazon Visa. Date is December 1st. Category is Household essentials. Description is online purchase";
      expect(extractCardName(transcript)).toBe("Amazon Visa");
    });

    test('returns empty string when account name not in list', () => {
      const transcript = "Charge $50 to Unknown Card. Date is today. Category is Misc. Description is test";
      expect(extractCardName(transcript)).toBe("");
    });

    test('handles case-insensitive matching', () => {
      const transcript = "Charge $30 to chase unlimited. Date is today. Category is Misc. Description is test";
      expect(extractCardName(transcript)).toBe("Chase unlimited");
    });
  });

  describe('extractExpenseCategory', () => {
    test('extracts category from standard format', () => {
      const transcript = "Charge $30.50 to Chase Unlimited. Date is December 3rd. Category is Gift purchase. Description is parents visiting groceries";
      expect(extractExpenseCategory(transcript)).toBe("Gift purchase");
    });

    test('extracts category when description contains category name', () => {
      const transcript = "Charge $100 to Discover it. Date is today. Category is Gift purchase. Description is Grocery store gift card";
      expect(extractExpenseCategory(transcript)).toBe("Gift purchase");
    });

    test('extracts category when description contains account name', () => {
      const transcript = "Charge $50 to Wells Fargo 2%. Date is December 5th. Category is Dining out. Description is dinner at Chase restaurant";
      expect(extractExpenseCategory(transcript)).toBe("Dining out");
    });

    test('handles "category" without "is"', () => {
      const transcript = "Charge $75 to Amazon Visa. Date is December 1st. Category Grocery. Description is weekly shopping";
      expect(extractExpenseCategory(transcript)).toBe("Grocery");
    });

    test('handles "category is" format', () => {
      const transcript = "Charge $200 to USBank Cashplus. Date is today. Category is Utilities. Description is electricity bill";
      expect(extractExpenseCategory(transcript)).toBe("Utilities");
    });

    test('handles category with multiple words', () => {
      const transcript = "Charge $150 to Chase Sapphire. Date is today. Category is Subscription or membership. Description is Netflix subscription";
      expect(extractExpenseCategory(transcript)).toBe("Subscription or membership");
    });

    test('handles category with special characters', () => {
      const transcript = "Charge $1,200 to BOA checking. Date is December 1st. Category is Rent/Mortgage. Description is monthly rent";
      expect(extractExpenseCategory(transcript)).toBe("Rent/Mortgage");
    });

    test('returns extracted text when category not in list', () => {
      const transcript = "Charge $50 to Chase Unlimited. Date is today. Category is New Category. Description is test";
      expect(extractExpenseCategory(transcript)).toBe("New Category");
    });

    test('handles case-insensitive matching', () => {
      const transcript = "Charge $30 to Chase Unlimited. Date is today. Category is gift purchase. Description is test";
      expect(extractExpenseCategory(transcript)).toBe("Gift purchase");
    });
  });

  describe('extractDescription', () => {
    test('extracts description from standard format', () => {
      const transcript = "Charge $30.50 to Chase Unlimited. Date is December 3rd. Category is Gift purchase. Description is parents visiting groceries";
      expect(extractDescription(transcript)).toBe("parents visiting groceries");
    });

    test('extracts description when it contains account name', () => {
      const transcript = "Charge $50 to Wells Fargo 2%. Date is December 5th. Category is Dining out. Description is dinner at Chase restaurant";
      expect(extractDescription(transcript)).toBe("dinner at Chase restaurant");
    });

    test('extracts description when it contains category name', () => {
      const transcript = "Charge $100 to Discover it. Date is today. Category is Gift purchase. Description is Grocery store gift card";
      expect(extractDescription(transcript)).toBe("Grocery store gift card");
    });

    test('handles "description" without "is"', () => {
      const transcript = "Charge $75 to Amazon Visa. Date is December 1st. Category is Grocery. Description weekly shopping";
      expect(extractDescription(transcript)).toBe("weekly shopping");
    });

    test('handles "description is" format', () => {
      const transcript = "Charge $200 to USBank Cashplus. Date is today. Category is Utilities. Description is electricity bill";
      expect(extractDescription(transcript)).toBe("electricity bill");
    });

    test('extracts long description with multiple sentences', () => {
      const transcript = "Charge $150 to Chase Sapphire. Date is today. Category is Subscription or membership. Description is Netflix subscription. Monthly fee";
      expect(extractDescription(transcript)).toBe("Netflix subscription. Monthly fee");
    });

    test('handles description with special characters', () => {
      const transcript = "Charge $25 to Capital One. Date is today. Category is Misc. Description is coffee & donuts";
      expect(extractDescription(transcript)).toBe("coffee & donuts");
    });

    test('handles description with numbers', () => {
      const transcript = "Charge $50 to BOA checking. Date is today. Category is Misc. Description is item #12345";
      expect(extractDescription(transcript)).toBe("item #12345");
    });

    test('returns empty string when no description keyword found', () => {
      const transcript = "Charge $30 to Chase Unlimited. Date is today. Category is Misc";
      expect(extractDescription(transcript)).toBe("");
    });
  });

  describe('extractDate', () => {
    test('extracts date from "Date is" format with month name', () => {
      const transcript = "Charge $30.50 to Chase Unlimited. Date is December 3rd. Category is Gift purchase. Description is parents visiting groceries";
      const today = new Date();
      const expectedYear = today.getFullYear();
      expect(extractDate(transcript)).toBe(`${expectedYear}-12-03`);
    });

    test('extracts date with "today" keyword', () => {
      const transcript = "Charge $50 to Wells Fargo 2%. Date is today. Category is Dining out. Description is dinner";
      const today = new Date();
      const expectedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      expect(extractDate(transcript)).toBe(expectedDate);
    });

    test('extracts date with "yesterday" keyword', () => {
      const transcript = "Charge $100 to Discover it. Date is yesterday. Category is Gift purchase. Description is gift";
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const expectedDate = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
      expect(extractDate(transcript)).toBe(expectedDate);
    });

    test('extracts ISO format date', () => {
      const transcript = "Charge $200 to USBank Cashplus. Date is 2024-12-05. Category is Utilities. Description is bill";
      expect(extractDate(transcript)).toBe("2024-12-05");
    });

    test('defaults to today when no date found', () => {
      const transcript = "Charge $75 to Amazon Visa. Category is Grocery. Description is shopping";
      const today = new Date();
      const expectedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      expect(extractDate(transcript)).toBe(expectedDate);
    });
  });

  describe('buildExpenseRecordFromTranscript', () => {
    test('builds complete expense record from standard format', () => {
      const transcript = "Charge $30.50 to Chase Unlimited. Date is December 3rd. Category is Gift purchase. Description is parents visiting groceries";
      const result = buildExpenseRecordFromTranscript(transcript);
      const today = new Date();
      const expectedYear = today.getFullYear();
      
      expect(result).toEqual({
        date: `${expectedYear}-12-03`,
        card_name: "Chase unlimited",
        expense_amount: "30.50",
        expense_category: "Gift purchase",
        description: "parents visiting groceries",
      });
    });

    test('builds expense record with large amount', () => {
      const transcript = "Charge $4,000.50 to CITI COSTCO. Date is November 30th. Category is Grocery. Description is regular weekend shopping";
      const result = buildExpenseRecordFromTranscript(transcript);
      const today = new Date();
      const expectedYear = today.getFullYear();
      
      expect(result).toEqual({
        date: `${expectedYear}-11-30`,
        card_name: "CITI COSTCO",
        expense_amount: "4000.50",
        expense_category: "Grocery",
        description: "regular weekend shopping",
      });
    });

    test('builds expense record when description contains account name', () => {
      const transcript = "Charge $50 to Wells Fargo 2%. Date is December 5th. Category is Dining out. Description is dinner at Chase restaurant";
      const result = buildExpenseRecordFromTranscript(transcript);
      const today = new Date();
      const expectedYear = today.getFullYear();
      
      expect(result).toEqual({
        date: `${expectedYear}-12-05`,
        card_name: "Wells Fargo 2%",
        expense_amount: "50.00",
        expense_category: "Dining out",
        description: "dinner at Chase restaurant",
      });
    });

    test('builds expense record when description contains category name', () => {
      const transcript = "Charge $100 to Discover it. Date is today. Category is Gift purchase. Description is Grocery store gift card";
      const result = buildExpenseRecordFromTranscript(transcript);
      const today = new Date();
      const expectedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      
      expect(result).toEqual({
        date: expectedDate,
        card_name: "Discover it",
        expense_amount: "100.00",
        expense_category: "Gift purchase",
        description: "Grocery store gift card",
      });
    });

    test('builds expense record with verbal amount format', () => {
      const transcript = "Charge 325 dollars and 39 cents to Chase freedom. Date is December 1st. Category is Gift purchase. Description is birthday gift";
      const result = buildExpenseRecordFromTranscript(transcript);
      const today = new Date();
      const expectedYear = today.getFullYear();
      
      expect(result).toEqual({
        date: `${expectedYear}-12-01`,
        card_name: "Chase freedom",
        expense_amount: "325.39",
        expense_category: "Gift purchase",
        description: "birthday gift",
      });
    });

    test('builds expense record with cents only', () => {
      const transcript = "Charge 99 cents to Amazon Visa. Date is today. Category is Misc. Description is small purchase";
      const result = buildExpenseRecordFromTranscript(transcript);
      const today = new Date();
      const expectedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      
      expect(result).toEqual({
        date: expectedDate,
        card_name: "Amazon Visa",
        expense_amount: "0.99",
        expense_category: "Misc",
        description: "small purchase",
      });
    });

    test('handles missing optional fields gracefully', () => {
      const transcript = "Charge $30 to Chase Unlimited. Category is Misc. Description is test";
      const result = buildExpenseRecordFromTranscript(transcript);
      const today = new Date();
      const expectedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      
      expect(result.date).toBe(expectedDate); // Defaults to today
      expect(result.card_name).toBe("Chase unlimited");
      expect(result.expense_amount).toBe("30.00");
      expect(result.expense_category).toBe("Misc");
      expect(result.description).toBe("test");
    });
  });
});

