/**
 * Configuration Template
 * 
 * Copy this file to config.js and fill in your actual API keys and credentials.
 * The config.js file is gitignored and will not be committed to version control.
 * 
 * Instructions:
 * 1. Copy this file: cp config.example.js config.js
 * 2. Fill in your actual values below
 * 3. Never commit config.js to git
 */

export const Config = {
  // Google OAuth 2.0 Web Client ID
  // Get this from Google Cloud Console: https://console.cloud.google.com/
  // APIs & Services → Credentials → OAuth 2.0 Client IDs → Web application
  // See OAUTH_SETUP.md for detailed instructions
  GOOGLE_WEB_CLIENT_ID: 'YOUR_WEB_CLIENT_ID_HERE',
  
  // Default Google Sheets Spreadsheet ID (optional)
  // This is the default spreadsheet to use if none is configured
  // You can find this in the Google Sheets URL: 
  // https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit
  DEFAULT_SPREADSHEET_ID: 'YOUR_DEFAULT_SPREADSHEET_ID_HERE',
  
  // Transcription API Configuration
  // Get your API key from your transcription service provider
  TRANSCRIPTION_API_KEY: 'YOUR_TRANSCRIPTION_API_KEY_HERE',
  TRANSCRIPTION_API_HOST: 'space.ai-builders.com',
  TRANSCRIPTION_API_PATH: '/backend/v1/audio/transcriptions',
};

