# ExpenseRecorderApp — Architecture Guide

## Overview

ExpenseRecorderApp is a React Native mobile application that lets users record expenses by voice. The user speaks a structured sentence describing an expense, and the app:

1. Records audio via the device microphone
2. Sends it to a transcription API
3. Parses the transcript into structured fields (date, card, amount, category, description)
4. Saves the record to a Google Sheet via the Sheets API

## Project Structure

```
ExpenseRecorderApp/
├── App.js                          # Main React component (UI + app logic)
├── index.js                        # React Native entry point
├── config.js                       # API keys and config (gitignored)
├── config.example.js               # Config template
├── package.json
│
├── src/services/
│   ├── audioService.js             # Microphone recording (start/stop/cleanup)
│   ├── transcriptionService.js     # Sends audio to API, normalizes responses
│   ├── parsingLogic.js             # Extracts expense fields from transcript text
│   ├── googleSheetsService.js      # OAuth sign-in + append rows to Google Sheets
│   ├── configService.js            # AsyncStorage for account names, categories, settings
│   └── __tests__/
│       ├── parsingLogic.test.js    # Unit tests for all parsing functions
│       └── transcriptionService.test.js  # Normalization + end-to-end tests
│
├── android/                        # Android native project
├── ios/                            # iOS native project
└── recordings/                     # Sample audio + transcription files for development
```

## Data Flow

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────────┐
│  User speaks │────>│  audioService    │────>│ transcriptionService │
│  expense     │     │  (record audio)  │     │ (API call + normalize)│
└─────────────┘     └──────────────────┘     └──────────┬───────────┘
                                                         │
                                                         v
                                              ┌──────────────────────┐
                                              │  parsingLogic        │
                                              │  (extract fields)    │
                                              └──────────┬───────────┘
                                                         │
                                                         v
                                              ┌──────────────────────┐
                                              │ googleSheetsService  │
                                              │ (append to Sheet)    │
                                              └──────────────────────┘
```

### Step-by-step

1. **Recording** (`audioService.js`): Uses `react-native-audio-recorder-player` to record WAV audio. Handles Android permissions. Auto-stops at 30 seconds.

2. **Transcription** (`transcriptionService.js`): Sends the WAV file to a remote transcription API via `multipart/form-data`. The response is normalized — if the API returns JSON-wrapped text (e.g. `{"query": "..."}` or structured `{"amount": 35, "category": "..."}`) it is unwrapped or reconstructed into natural-language text.

3. **Parsing** (`parsingLogic.js`): The core logic. Extracts five fields from transcript text:
   - **Date**: ISO dates, US dates, month names, "today", "yesterday" — defaults to today
   - **Card/Account**: Text between "charge" and "category"/"description", fuzzy-matched against user's account list
   - **Amount**: Dollar sign, verbal ("325 dollars and 39 cents"), cents-only formats
   - **Category**: Text between "category" and "description", fuzzy-matched against category list
   - **Description**: Everything after "description", sanitized to remove JSON artifacts

4. **Saving** (`googleSheetsService.js`): Authenticates via Google Sign-In (OAuth 2.0), then appends a row to the configured Google Sheet using the Sheets API v4.

## Expected Transcript Pattern

The app expects voice input roughly matching this structure:

```
"Charge $30.50 to Chase Unlimited. Date is December 3rd. Category is Grocery. Description is weekly shopping"
```

All fields except "charge" are optional. The parser uses keyword boundaries ("charge", "category", "description") to segment the transcript, so the exact wording is flexible.

## Parsing Architecture

### Segment Extraction

Both `extractCardName` and `extractExpenseAmount` share a helper (`extractSegmentAfterCharge`) that:
1. Finds the "charge" / "charged" keyword
2. Finds the next keyword ("category" or "description", whichever comes first)
3. Returns the cleaned text between them

### Fuzzy Matching (`bestMatchFromList`)

The fuzzy matcher scores candidates against the transcript using multiple strategies:

| Priority | Strategy | Score |
|----------|----------|-------|
| 1 | Exact phrase match (candidate found as contiguous phrase in transcript) | 1.0 |
| 2 | Partial phrase (transcript phrase found within candidate name) | 1.0 |
| 3 | Compound-word splitting ("doublecash" ↔ "double cash") | phrase boost |
| 4 | Token overlap with lightweight stemming | overlap / total tokens |
| 5 | Compound-word bonus on token score | +0.4 |

Tie-breaking rules:
- Longer (more specific) candidates win at equal scores
- Multi-word partial-phrase matches beat single-word candidates
- Single-word candidates are capped at 0.85 for multi-word transcripts

### JSON Handling

The transcription API sometimes returns structured JSON instead of plain text. `tryReconstructTranscriptFromJson` handles this by:
1. Checking for natural-language fields (`query`, `text`, `transcript`, `payload`)
2. Reconstructing from structured fields (`amount`, `payment_method`, `category`, `description`)
3. Falling back to the longest string value in the object

This function is used by both `parsingLogic.js` (inside `buildExpenseRecordFromTranscript`) and `transcriptionService.js` (inside `unwrapJsonTranscript`) to avoid duplicating reconstruction logic.

### Description Sanitization

`sanitizeDescription` strips JSON artifacts that may leak through from API responses. It uses `split/join` (not regex character classes) for cross-engine safety across V8, Hermes, and JSC. The result always starts and ends with `[a-zA-Z0-9]`.

## Configuration

### User-Editable Lists (`configService.js`)

Account names and expense categories are stored in AsyncStorage and editable via the Settings modal. Changes are synced to the parsing logic cache via `refreshConfigLists()`.

### App Config (`config.js`)

| Key | Purpose |
|-----|---------|
| `GOOGLE_WEB_CLIENT_ID` | OAuth 2.0 Web Client ID for Google Sign-in |
| `DEFAULT_SPREADSHEET_ID` | Default Google Sheet to write expenses to |
| `TRANSCRIPTION_API_KEY` | API key for the transcription service |
| `TRANSCRIPTION_API_HOST` | Hostname of the transcription API |
| `TRANSCRIPTION_API_PATH` | Endpoint path for audio transcription |

## UI Architecture

The entire UI lives in `App.js` as a single React component using hooks (`useState`, `useEffect`, `useRef`). Key sections:

- **Header**: App title + settings gear button
- **Record Section**: Record button (supports "press & hold" and "tap" modes), status display, hint text
- **Last Transcript**: Scrollable box showing the most recent transcript text
- **Debug Pipeline**: Collapsible section showing raw API response → cleaned transcript → parsed fields
- **Saved Row**: Displays the last successfully saved expense record
- **Google Auth**: Sign-in/sign-out + "Open Sheet" link
- **Settings Modal**: Edit account names, expense categories, and recording mode

## Testing

Tests use Jest with mocked `configService` (providing test account names and categories).

- `parsingLogic.test.js`: Unit tests for each extractor function, fuzzy matching edge cases, JSON reconstruction, and end-to-end `buildExpenseRecordFromTranscript` flows.
- `transcriptionService.test.js`: API response normalization, transcript cleaning, and end-to-end flow from raw API response through to parsed expense record.

Run tests:
```bash
npx jest
```

## Check-for-Updates Workflow

When verifying that the end-to-end pipeline still works (e.g. after an API change or a parsing refactor):

1. **Run the transcription pipeline against sample recordings:**
   ```bash
   node recordings/transcribe-recordings.js
   ```
   This sends every `.wav` file in `recordings/` to the transcription API and writes the raw response to `recordings/<basename>.transcription.json`.

2. **Inspect the raw responses.** Open the generated `.transcription.json` files and check the API response shape — for example, `text` may be a stringified JSON like `'{"query": "..."}'`.

3. **Verify service logic against real data:**
   - `normalizeTranscriptionResponse()` correctly unwraps JSON-in-string responses to a plain transcript string.
   - `buildExpenseRecordFromTranscript()` produces the expected date, card_name, expense_amount, expense_category, and description.
   - The App.js flow passes the normalized transcript through parsing and into Google Sheets.

4. **Update tests** in `parsingLogic.test.js` and `transcriptionService.test.js` whenever the API response shape or business rules change.

## Key Design Decisions

1. **Keyword-based parsing over NLP**: The parser uses simple keyword boundaries ("charge", "category", "description") rather than ML-based NER. This is deterministic, fast, and works offline once the transcript is available.

2. **Fuzzy matching with compound-word support**: Account names like "Citi DoubleCash" need to match "double cash" spoken as two words. The matcher splits compound words and applies stemming to handle these cases.

3. **Single-file UI**: All UI is in `App.js` for simplicity. For a larger app, consider extracting components (RecordButton, TranscriptDisplay, SettingsModal, etc.).

4. **Canonical JSON reconstruction**: `tryReconstructTranscriptFromJson` in `parsingLogic.js` is the single source of truth for converting structured JSON API responses to natural language. `transcriptionService.js` delegates to it rather than duplicating the logic.

5. **Cross-engine safety**: Description sanitization uses `split/join` rather than regex character classes to work consistently across V8 (Node/Chrome), Hermes (React Native Android), and JSC (React Native iOS).
