/**
 * Google Sheets service - Appends expense records to Google Sheet
 * Uses OAuth 2.0 with Google Sign-in for user authentication
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

// Storage keys for tokens
const STORAGE_KEYS = {
  ACCESS_TOKEN: 'GOOGLE_ACCESS_TOKEN',
  REFRESH_TOKEN: 'GOOGLE_REFRESH_TOKEN',
  TOKEN_EXPIRY: 'GOOGLE_TOKEN_EXPIRY',
  SPREADSHEET_ID: 'GOOGLE_SHEETS_SPREADSHEET_ID',
};

// Google Sheets API scope
const GOOGLE_SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

/**
 * Configure Google Sign-in
 * Call this once at app startup
 * @param {string} webClientId - OAuth 2.0 Web Client ID from Google Cloud Console
 */
export async function configureGoogleSignIn(webClientId) {
  try {
    // Check if GoogleSignin is available
    if (!GoogleSignin || typeof GoogleSignin.configure !== 'function') {
      throw new Error(
        'Google Sign-in native module not available. Please rebuild the app:\n' +
        'cd android && ./gradlew clean && cd .. && npm run android'
      );
    }

    await GoogleSignin.configure({
      webClientId: webClientId, // From Google Cloud Console
      scopes: [GOOGLE_SHEETS_SCOPE], // Request Google Sheets access
      offlineAccess: true, // Get refresh token
    });
    console.log('Google Sign-in configured');
  } catch (error) {
    console.error('Error configuring Google Sign-in:', error);
    throw error;
  }
}

/**
 * Sign in with Google and get access token
 * @returns {Promise<string>} Access token
 */
export async function signInWithGoogle() {
  try {
    // Verify GoogleSignin is available
    if (!GoogleSignin || typeof GoogleSignin.signIn !== 'function') {
      throw new Error('Google Sign-in native module not ready. Please rebuild the app.');
    }

    // Check if user is already signed in by trying to get current user
    try {
      const currentUser = await GoogleSignin.getCurrentUser();
      if (currentUser) {
        // Already signed in, get tokens
        const tokens = await GoogleSignin.getTokens();
        if (tokens.accessToken) {
          await storeTokens(tokens);
          return tokens.accessToken;
        }
      }
    } catch (e) {
      // Not signed in, continue to sign in flow
      console.log('Not currently signed in, proceeding with sign-in');
    }

    // Sign in
    await GoogleSignin.hasPlayServices();
    const userInfo = await GoogleSignin.signIn();

    // Debug: Log the userInfo structure to understand it
    console.log('Google Sign-in userInfo structure:', JSON.stringify(userInfo, null, 2));
    
    // Get tokens
    const tokens = await GoogleSignin.getTokens();
    await storeTokens(tokens);
    
    // Log sign-in success (handle different userInfo structures)
    const email = userInfo?.user?.email || userInfo?.data?.user?.email || userInfo?.email || 'Unknown';
    console.log('Signed in with Google:', email);
    return tokens.accessToken;
  } catch (error) {
    console.error('Error signing in with Google:', error);
    if (error.message && error.message.includes('native module not ready')) {
      throw error;
    } else if (error.code === 'SIGN_IN_CANCELLED') {
      throw new Error('Sign-in was cancelled');
    } else if (error.code === 'IN_PROGRESS') {
      throw new Error('Sign-in already in progress');
    } else if (error.code === 'PLAY_SERVICES_NOT_AVAILABLE') {
      throw new Error('Google Play Services not available');
    }
    throw error;
  }
}

/**
 * Sign out from Google
 */
export async function signOutFromGoogle() {
  try {
    await GoogleSignin.signOut();
    await clearStoredTokens();
    console.log('Signed out from Google');
  } catch (error) {
    console.error('Error signing out:', error);
    throw error;
  }
}

/**
 * Get current access token, refreshing if necessary
 * @returns {Promise<string>} Valid access token
 */
export async function getAccessToken() {
  try {
    // Check if we have a stored token that's still valid
    const storedToken = await AsyncStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    const tokenExpiry = await AsyncStorage.getItem(STORAGE_KEYS.TOKEN_EXPIRY);
    
    if (storedToken && tokenExpiry) {
      const expiryTime = parseInt(tokenExpiry, 10);
      const now = Date.now();
      
      // If token expires in more than 5 minutes, use it
      if (expiryTime > now + 5 * 60 * 1000) {
        return storedToken;
      }
    }

    // Token expired or doesn't exist, refresh it
    return await refreshAccessToken();
  } catch (error) {
    console.error('Error getting access token:', error);
    throw error;
  }
}

/**
 * Refresh the access token
 * @returns {Promise<string>} New access token
 */
async function refreshAccessToken() {
  try {
    // Verify GoogleSignin is available
    if (!GoogleSignin || typeof GoogleSignin.getTokens !== 'function') {
      throw new Error('Google Sign-in native module not ready');
    }

    // Try to get tokens from Google Sign-in
    const tokens = await GoogleSignin.getTokens();
    
    if (tokens.accessToken) {
      await storeTokens(tokens);
      return tokens.accessToken;
    }

    // If that fails, user needs to sign in again
    throw new Error('No valid token. Please sign in again.');
  } catch (error) {
    console.error('Error refreshing access token:', error);
    
    // If refresh fails, user needs to sign in again
    if (error.message && error.message.includes('SIGN_IN_REQUIRED')) {
      throw new Error('Please sign in with Google again');
    }
    throw error;
  }
}

/**
 * Store tokens securely
 */
async function storeTokens(tokens) {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, tokens.accessToken);
    
    if (tokens.refreshToken) {
      await AsyncStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, tokens.refreshToken);
    }
    
    // Store expiry time (tokens typically expire in 1 hour)
    const expiryTime = Date.now() + (tokens.expiryDate || 3600000);
    await AsyncStorage.setItem(STORAGE_KEYS.TOKEN_EXPIRY, expiryTime.toString());
  } catch (error) {
    console.error('Error storing tokens:', error);
  }
}

/**
 * Clear stored tokens
 */
async function clearStoredTokens() {
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.ACCESS_TOKEN,
      STORAGE_KEYS.REFRESH_TOKEN,
      STORAGE_KEYS.TOKEN_EXPIRY,
    ]);
  } catch (error) {
    console.error('Error clearing tokens:', error);
  }
}

/**
 * Check if user is signed in
 * @returns {Promise<boolean>}
 */
export async function isSignedIn() {
  try {
    // Check if GoogleSignin is available
    if (!GoogleSignin || typeof GoogleSignin.getCurrentUser !== 'function') {
      console.warn('GoogleSignin native module not ready');
      return false;
    }
    
    // Use getCurrentUser instead of isSignedIn (more reliable)
    const currentUser = await GoogleSignin.getCurrentUser();
    return currentUser !== null;
  } catch (error) {
    console.error('Error checking sign-in status:', error);
    return false;
  }
}

/**
 * Get current user info
 * @returns {Promise<Object>} User info
 */
export async function getCurrentUser() {
  try {
    // Check if GoogleSignin is available
    if (!GoogleSignin || typeof GoogleSignin.getCurrentUser !== 'function') {
      return null;
    }
    
    // Use getCurrentUser directly (returns null if not signed in)
    const currentUser = await GoogleSignin.getCurrentUser();
    return currentUser;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

/**
 * Set the Google Sheets spreadsheet ID
 * @param {string} spreadsheetId - The spreadsheet ID
 */
export async function setSpreadsheetId(spreadsheetId) {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.SPREADSHEET_ID, spreadsheetId);
  } catch (error) {
    console.error('Error setting spreadsheet ID:', error);
    throw error;
  }
}

/**
 * Get the Google Sheets spreadsheet ID
 * @returns {Promise<string|null>} The spreadsheet ID
 */
export async function getSpreadsheetId() {
  try {
    return await AsyncStorage.getItem(STORAGE_KEYS.SPREADSHEET_ID);
  } catch (error) {
    console.error('Error getting spreadsheet ID:', error);
    return null;
  }
}

/**
 * Appends an expense record to Google Sheet
 * @param {Object} record - Expense record with date, card_name, expense_amount, expense_category, description
 * @returns {Promise<Object>} Returns the saved row data including the range where it was saved
 */
export async function appendExpenseRecordToSheet(record) {
  try {
    // Get spreadsheet ID
    const spreadsheetId = await getSpreadsheetId();
    if (!spreadsheetId) {
    throw new Error(
        'Google Sheets spreadsheet ID not configured. Please set it in settings.'
    );
  }

    // Get access token
    const accessToken = await getAccessToken();
    if (!accessToken) {
      throw new Error('Not signed in. Please sign in with Google first.');
    }

    // Prepare the data
    const values = [
      [
        record.date || "",
        record.card_name || "",
        record.expense_amount || "",
        record.expense_category || "",
        record.description || "",
        new Date().toISOString(),
      ],
    ];

    // Make the API call
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A:F:append?valueInputOption=USER_ENTERED`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: values,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage;
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error?.message || errorText;
      } catch {
        errorMessage = errorText;
      }

      // Handle specific error cases
      if (response.status === 401) {
        // Token expired or invalid, try to refresh
        try {
          const newToken = await refreshAccessToken();
          // Retry the request with new token
          return appendExpenseRecordToSheet(record);
        } catch (refreshError) {
          throw new Error('Authentication failed. Please sign in again.');
        }
      } else if (response.status === 403) {
        throw new Error('Permission denied. Make sure you have access to the spreadsheet.');
      } else if (response.status === 404) {
        throw new Error('Spreadsheet not found. Please check the spreadsheet ID.');
      }

      throw new Error(`Failed to append to Google Sheet: ${errorMessage}`);
    }

    const result = await response.json();
    console.log('Successfully appended to Google Sheet:', result);
    
    // Return the saved row data for display
    return {
      success: true,
      range: result.updates?.updatedRange || 'Unknown',
      rowNumber: result.updates?.updatedRange ? 
        parseInt(result.updates.updatedRange.match(/\d+/)?.[0]) || null : null,
      values: values[0], // The actual row data that was saved
      record: record, // The original record object
    };
  } catch (error) {
    console.error("Failed to append expense record to Google Sheet:", error);
    throw error;
  }
}

/**
 * Load configuration from AsyncStorage (for compatibility)
 * Note: With OAuth, we only need to store the spreadsheet ID
 */
export async function loadSheetsConfigFromStorage(AsyncStorage) {
  const spreadsheetId = await getSpreadsheetId();
  return !!spreadsheetId;
}

/**
 * Initialize Google Sheets configuration (for compatibility)
 * Note: With OAuth, this is not needed, but kept for compatibility
 */
export function initializeSheetsConfig(config) {
  // With OAuth, we don't need service account config
  // But we can store the spreadsheet ID if provided
  if (config && config.spreadsheetId) {
    setSpreadsheetId(config.spreadsheetId);
}
}
