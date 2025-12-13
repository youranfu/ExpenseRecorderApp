# Configuration Setup Guide

This guide explains how to configure API keys and credentials for the Expense Recorder App.

## ⚠️ Security Warning

**Never commit `config.js` to version control!** This file contains sensitive API keys and credentials. The `config.js` file is already added to `.gitignore` to prevent accidental commits.

## Quick Setup

1. **Copy the example config file:**
   ```bash
   cd ExpenseRecorderApp
   cp config.example.js config.js
   ```

2. **Edit `config.js` and fill in your actual API keys:**
   ```javascript
   export const Config = {
     GOOGLE_WEB_CLIENT_ID: 'your-actual-web-client-id',
     DEFAULT_SPREADSHEET_ID: 'your-default-spreadsheet-id',
     TRANSCRIPTION_API_KEY: 'your-transcription-api-key',
     TRANSCRIPTION_API_HOST: 'space.ai-builders.com',
     TRANSCRIPTION_API_PATH: '/backend/v1/audio/transcriptions',
   };
   ```

3. **Verify `config.js` is in `.gitignore`:**
   ```bash
   grep config.js .gitignore
   ```
   Should output: `config.js`

## Configuration Details

### 1. Google OAuth 2.0 Web Client ID

**What it is:** OAuth 2.0 credentials for Google Sign-in integration.

**How to get it:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create a new one)
3. Navigate to **APIs & Services** → **Credentials**
4. Click **+ CREATE CREDENTIALS** → **OAuth client ID**
5. Select **Web application** as the application type
6. Copy the **Client ID** (it looks like: `123456789-abcdefghijklmnop.apps.googleusercontent.com`)

**Where to use:** Replace `YOUR_WEB_CLIENT_ID_HERE` in `config.js` with your actual Client ID.

**More details:** See `OAUTH_SETUP.md` for complete OAuth setup instructions.

### 2. Default Google Sheets Spreadsheet ID

**What it is:** The default Google Sheet where expense records will be saved.

**How to get it:**
1. Open your Google Sheet
2. Look at the URL: `https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit`
3. Copy the `SPREADSHEET_ID` part (the long string between `/d/` and `/edit`)

**Where to use:** Replace `YOUR_DEFAULT_SPREADSHEET_ID_HERE` in `config.js` with your actual Spreadsheet ID.

**Note:** This is optional. Users can configure a different spreadsheet ID in the app settings. This is just the default used when the app first starts.

### 3. Transcription API Key

**What it is:** API key for the transcription service that converts audio to text.

**How to get it:**
1. Contact your transcription service provider
2. Sign up for an account if needed
3. Generate an API key from your account dashboard
4. Copy the API key

**Where to use:** Replace `YOUR_TRANSCRIPTION_API_KEY_HERE` in `config.js` with your actual API key.

**Security:** Keep this key secret! Never share it or commit it to version control.

### 4. Transcription API Host and Path

**What it is:** The API endpoint URL for the transcription service.

**Default values:**
- Host: `space.ai-builders.com`
- Path: `/backend/v1/audio/transcriptions`

**Where to use:** Update these in `config.js` if your transcription service uses a different endpoint.

## Verification

After setting up `config.js`, verify the configuration:

1. **Check that config.js exists:**
   ```bash
   ls -la config.js
   ```

2. **Verify it's gitignored:**
   ```bash
   git status
   ```
   `config.js` should NOT appear in the list of untracked files.

3. **Test the app:**
   ```bash
   npm start
   npm run android
   ```

   The app should start without configuration errors.

## Troubleshooting

### Error: "Please configure OAuth 2.0 Web Client ID in config.js"

**Solution:** Make sure you've:
1. Created `config.js` from `config.example.js`
2. Replaced `YOUR_WEB_CLIENT_ID_HERE` with your actual Google OAuth Web Client ID
3. Restarted the Metro bundler (`npm start`)

### Error: "Cannot find module './config'"

**Solution:** Make sure `config.js` exists in the `ExpenseRecorderApp` directory:
```bash
ls config.js
```

If it doesn't exist, create it:
```bash
cp config.example.js config.js
```

### Error: "Transcription API error: 401"

**Solution:** Check that your `TRANSCRIPTION_API_KEY` in `config.js` is correct and valid.

### Accidentally committed config.js to git

**If you haven't pushed yet:**
```bash
git rm --cached config.js
git commit -m "Remove config.js from version control"
```

**If you've already pushed:**
1. Remove the file from git (as above)
2. **Immediately rotate/regenerate all API keys** that were exposed
3. Update `config.js` with new keys
4. Commit the removal

## Best Practices

1. ✅ **DO:** Keep `config.js` local and never commit it
2. ✅ **DO:** Use `config.example.js` as a template for other developers
3. ✅ **DO:** Rotate API keys if they're accidentally exposed
4. ✅ **DO:** Use different API keys for development and production
5. ❌ **DON'T:** Commit `config.js` to version control
6. ❌ **DON'T:** Share API keys in screenshots or documentation
7. ❌ **DON'T:** Hardcode API keys directly in source code

## For Team Members

When cloning the repository:

1. Copy `config.example.js` to `config.js`
2. Fill in your own API keys (or get them from your team lead)
3. Never commit `config.js` to git

## Production Deployment

For production builds, consider:

1. **Environment-specific configs:** Use different config files for dev/staging/prod
2. **CI/CD secrets:** Store API keys in your CI/CD platform's secret management
3. **Runtime configuration:** Use environment variables or secure key management services

For React Native, you may want to use libraries like:
- `react-native-config` for environment variables
- Secure storage solutions for production apps

