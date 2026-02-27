/**
 * Tests for transcriptionService: normalization and e2e flow.
 */

jest.mock('../../../config', () => ({
  Config: {
    TRANSCRIPTION_API_KEY: 'test-key',
    TRANSCRIPTION_API_HOST: 'test.example.com',
    TRANSCRIPTION_API_PATH: '/v1/audio/transcriptions',
  },
}));

import {
  normalizeTranscriptionResponse,
  toPlainTranscriptString,
  cleanTranscriptText,
} from '../transcriptionService';
import { buildExpenseRecordFromTranscript, loadConfigLists } from '../parsingLogic';

/** Asserts transcript string has no common API/JSON artifacts (for display and parsing). */
function expectNoTranscriptArtifacts(transcript) {
  expect(transcript).not.toMatch(/^\s/);
  expect(transcript).not.toMatch(/\s$/);
  expect(transcript).not.toMatch(/\n/);
  expect(transcript).not.toMatch(/"\s*}\s*$/);
  expect(transcript).not.toMatch(/'?\s*}\s*$/);
  expect(transcript).not.toContain('"}');
  expect(transcript).not.toContain("'}");
}

/** Asserts parsed expense record fields have no JSON/quote artifacts. */
function expectParsedFieldsSanity(record) {
  const fields = [
    record.expense_amount,
    record.card_name,
    record.expense_category,
    record.description,
    record.date,
  ].filter(Boolean);
  for (const value of fields) {
    expect(value).not.toMatch(/"\s*}\s*$/);
    expect(value).not.toContain('"}');
    expect(value).not.toContain("'}");
    expect(value).not.toMatch(/\n/);
  }
}

jest.mock('../configService', () => ({
  getAccountNames: jest.fn(() => Promise.resolve([
    "Chase checking", "BOA checking", "Amazon Visa", "Chase unlimited",
    "Chase Sapphire", "Wayfair", "IKEA", "Cash", "Business Checking", "Ink Business",
  ])),
  getExpenseCategories: jest.fn(() => Promise.resolve([
    "Business", "Grocery", "Home improvement", "Dining", "Misc", "Gift purchase",
  ])),
}));

describe('transcriptionService', () => {
  describe('normalizeTranscriptionResponse', () => {
    test('unwraps JSON with "query" field to plain transcript string', () => {
      const raw = {
        request_id: 'abc',
        text: '{"query": "charge 335.78 to Wayfair category is home improvement description new sofa for the living room"}',
      };
      const out = normalizeTranscriptionResponse(raw);
      expect(out.text).toBe('charge 335.78 to Wayfair category is home improvement description new sofa for the living room');
    });

    test('unwraps JSON with "text" field', () => {
      const raw = { text: '{"text": "hello world"}' };
      const out = normalizeTranscriptionResponse(raw);
      expect(out.text).toBe('hello world');
    });

    test('uses longest string when object has multiple string values', () => {
      const raw = { text: '{"short": "x", "transcript": "the actual long transcript here"}' };
      const out = normalizeTranscriptionResponse(raw);
      expect(out.text).toBe('the actual long transcript here');
    });

    test('leaves non-JSON string as-is', () => {
      const raw = { text: 'plain transcript' };
      const out = normalizeTranscriptionResponse(raw);
      expect(out.text).toBe('plain transcript');
    });

    test('leaves invalid JSON string as-is', () => {
      const raw = { text: '{ not valid json' };
      const out = normalizeTranscriptionResponse(raw);
      expect(out.text).toBe('{ not valid json');
    });

    test('normalizes "transcript" key when present', () => {
      const raw = { transcript: '{"query": "only transcript"}' };
      const out = normalizeTranscriptionResponse(raw);
      expect(out.transcript).toBe('only transcript');
    });

    test('unwraps JSON when text is wrapped in single quotes (e.g. from some APIs)', () => {
      const raw = { text: '\'{"query": "Charge $25.25 to Amex Blue Cash preferred, category is Grocery, description Grocery."}\'' };
      const out = normalizeTranscriptionResponse(raw);
      expect(out.text).toBe('Charge $25.25 to Amex Blue Cash preferred, category is Grocery, description Grocery');
    });

    test('reconstructs natural language from structured JSON response (amount, payment_method, category, description)', () => {
      const raw = {
        text: '{"amount": 35.25, "payment_method": "Amex Blue Cash Preferred", "category": "groceries", "description": "Friday grocery"}',
      };
      const out = normalizeTranscriptionResponse(raw);
      expect(out.text).toContain('Charge $35.25');
      expect(out.text).toContain('Amex Blue Cash Preferred');
      expect(out.text).toContain('Category is groceries');
      expect(out.text).toContain('Description is Friday grocery');
      expect(out.text).not.toContain('"}');
      expect(out.text).not.toContain('{');
    });
  });

  describe('cleanTranscriptText', () => {
    test('strips leading/trailing whitespace and newlines', () => {
      expect(cleanTranscriptText('\n\nCharge $25.25 to Amex.\n')).toBe('Charge $25.25 to Amex');
      expect(cleanTranscriptText('  plain  ')).toBe('plain');
    });

    test('strips trailing JSON/quote artifacts', () => {
      expect(cleanTranscriptText('Charge $25.25 to Amex Blue Cash preferred, category is Grocery, description Grocery."}'))
        .toBe('Charge $25.25 to Amex Blue Cash preferred, category is Grocery, description Grocery');
      expect(cleanTranscriptText('description Friday groceries."}\'')).toBe('description Friday groceries');
      expect(cleanTranscriptText('hello\'}')).toBe('hello');
      expect(cleanTranscriptText('world"}')).toBe('world');
    });

    test('leaves normal transcript with no trailing junk unchanged', () => {
      expect(cleanTranscriptText('Charge $25 to Amex')).toBe('Charge $25 to Amex');
      expect(cleanTranscriptText('description Friday groceries')).toBe('description Friday groceries');
    });
  });

  describe('toPlainTranscriptString', () => {
    test('returns plain text from JSON-wrapped string for display', () => {
      expect(toPlainTranscriptString('{"query": "Charge $25.25 to Amex."}')).toBe('Charge $25.25 to Amex');
      expect(toPlainTranscriptString('plain text')).toBe('plain text');
      expect(toPlainTranscriptString('')).toBe('');
    });

    test('cleans messy API response: leading newlines and trailing "}', () => {
      const messy = '\n\nCharge $25.25 to Amex Blue Cash preferred, category is Grocery, description Grocery."}';
      expect(toPlainTranscriptString(messy)).toBe('Charge $25.25 to Amex Blue Cash preferred, category is Grocery, description Grocery');
    });
  });

  describe('e2e: raw API response -> normalized text -> parsed expense record', () => {
    beforeAll(async () => {
      await loadConfigLists();
    });

    test('full flow from API response with query-wrapped text to expense record', () => {
      const rawApiResponse = {
        request_id: '690bb0b4-eb4b-43d6-a6f5-ba5f5e770988',
        text: '{"query": "charge 335.78 to Wayfair category is home improvement description new sofa for the living room"}',
        segments: null,
      };
      const normalized = normalizeTranscriptionResponse(rawApiResponse);
      const transcriptText = toPlainTranscriptString(normalized.text || normalized.transcript || '');
      expect(transcriptText).toBe('charge 335.78 to Wayfair category is home improvement description new sofa for the living room');
      expectNoTranscriptArtifacts(transcriptText);

      const record = buildExpenseRecordFromTranscript(transcriptText);
      expectParsedFieldsSanity(record);

      const today = new Date();
      const expectedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      expect(record.expense_amount).toBe('335.78');
      expect(record.card_name).toBe('Wayfair');
      expect(record.expense_category).toBe('Home improvement');
      expect(record.description).toBe('new sofa for the living room');
      expect(record.date).toBe(expectedDate);
    });

    test('messy API response: leading newlines and trailing "} produces clean transcript and sane parsed fields', () => {
      const rawApiResponse = {
        text: '\n\nCharge $25.25 to Amex Blue Cash preferred, category is Grocery, description Friday groceries."}',
      };
      const normalized = normalizeTranscriptionResponse(rawApiResponse);
      const transcriptText = toPlainTranscriptString(normalized.text || '');
      expectNoTranscriptArtifacts(transcriptText);
      expect(transcriptText).toBe('Charge $25.25 to Amex Blue Cash preferred, category is Grocery, description Friday groceries');
      expect(transcriptText).not.toContain('"}');
      expect(transcriptText).not.toMatch(/^\n/);

      const record = buildExpenseRecordFromTranscript(transcriptText);
      expectParsedFieldsSanity(record);
      expect(record.description).toBe('Friday groceries');
      expect(record.description).not.toContain('"}');
      expect(record.description).not.toContain("'}");
      expect(record.expense_amount).toBe('25.25');
      expect(record.expense_category).toBe('Grocery');
    });

    test('messy JSON-wrapped response: newlines and trailing quote/brace in inner string', () => {
      const rawApiResponse = {
        text: '{"query": "\\n\\nCharge $25.25 to Amex Blue Cash preferred, category is Grocery, description Friday groceries.\\""}',
      };
      const transcriptText = toPlainTranscriptString(rawApiResponse.text);
      expectNoTranscriptArtifacts(transcriptText);
      const record = buildExpenseRecordFromTranscript(transcriptText);
      expectParsedFieldsSanity(record);
      expect(record.description).not.toMatch(/"\s*}\s*$/);
    });
  });
});
