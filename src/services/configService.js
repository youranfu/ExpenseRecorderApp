/**
 * Configuration Service
 * Manages user-editable lists (account names and expense categories) in AsyncStorage
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEYS = {
  ACCOUNT_NAMES: "@expense_recorder:account_names",
  EXPENSE_CATEGORIES: "@expense_recorder:expense_categories",
  RECORDING_MODE: "@expense_recorder:recording_mode", // 'hold' or 'tap'
};

// Default values (used on first launch)
const DEFAULT_ACCOUNT_NAMES = [
  "Chase checking",
  "BOA checking",
  "Amazon Visa",
  "Chase unlimited",
  "Chase Sapphire",
  "Chase freedom rotate",
  "Amex blue cash preferred",
  "BOA cash reward",
  "Discover it",
  "Capital One Quicksilver",
  "YF USBank Cashplus",
  "LL USBank Cashplus",
  "CITI Costco",
  "Wells Fargo Active Cash",
  "Wayfair",
  "IKEA",
  "Walmart OnePay",
  "Citi DoubleCash",
  "Cash",
  "Business Checking",
  "Ink Business",
  "Kraken (Crypto)",
  "Trezor Wallet",
  "Joint Schwab",
  "Joint Fidelity",
  "Joint Fidelity - Holdings",
  "YF Individual",
  "YF pre-tax 401K",
  "YF Roth 401K",
  "YF Roth IRA",
  "LL pre-tax solo 401K",
  "LL pre-tax IRA",
  "LL Roth IRA",
  "FL Mortgage",
  "PHL Mortgage",
  "HSA",
];

const DEFAULT_EXPENSE_CATEGORIES = [
  "Business",
  "Car fuel",
  "Car insurance",
  "Car maintenance",
  "Clothing",
  "Commute",
  "Dining",
  "Donna related",
  "Education",
  "Entertainment",
  "Gift purchase",
  "Grocery",
  "Home improvement",
  "Home insurance and tax",
  "Home maintenance",
  "Household items",
  "Medical",
  "Misc",
  "Mortgage",
  "Rental expenses",
  "Subscription or membership",
  "Tax related",
  "Travel-business",
  "Travel-personal",
  "Utility Electricity",
  "Utility Gas",
  "Utility Phone",
  "Utility Internet",
  "Utility Water",
];

/**
 * Initialize default values if they don't exist
 */
export async function initializeDefaults() {
  try {
    const [hasAccounts, hasCategories] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.ACCOUNT_NAMES),
      AsyncStorage.getItem(STORAGE_KEYS.EXPENSE_CATEGORIES),
    ]);

    if (!hasAccounts) {
      await saveAccountNames(DEFAULT_ACCOUNT_NAMES);
    }

    if (!hasCategories) {
      await saveExpenseCategories(DEFAULT_EXPENSE_CATEGORIES);
    }
  } catch (error) {
    console.error("Error initializing defaults:", error);
  }
}

/**
 * Get account names from storage
 * @returns {Promise<string[]>}
 */
export async function getAccountNames() {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.ACCOUNT_NAMES);
    if (stored) {
      return JSON.parse(stored);
    }
    // Return defaults if nothing stored
    return DEFAULT_ACCOUNT_NAMES;
  } catch (error) {
    console.error("Error getting account names:", error);
    return DEFAULT_ACCOUNT_NAMES;
  }
}

/**
 * Save account names to storage
 * @param {string[]} names
 */
export async function saveAccountNames(names) {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.ACCOUNT_NAMES, JSON.stringify(names));
  } catch (error) {
    console.error("Error saving account names:", error);
    throw error;
  }
}

/**
 * Get expense categories from storage
 * @returns {Promise<string[]>}
 */
export async function getExpenseCategories() {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.EXPENSE_CATEGORIES);
    if (stored) {
      return JSON.parse(stored);
    }
    // Return defaults if nothing stored
    return DEFAULT_EXPENSE_CATEGORIES;
  } catch (error) {
    console.error("Error getting expense categories:", error);
    return DEFAULT_EXPENSE_CATEGORIES;
  }
}

/**
 * Save expense categories to storage
 * @param {string[]} categories
 */
export async function saveExpenseCategories(categories) {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.EXPENSE_CATEGORIES, JSON.stringify(categories));
  } catch (error) {
    console.error("Error saving expense categories:", error);
    throw error;
  }
}

/**
 * Get recording mode from storage
 * @returns {Promise<'hold'|'tap'>}
 */
export async function getRecordingMode() {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.RECORDING_MODE);
    return stored === 'tap' ? 'tap' : 'hold'; // Default to 'hold'
  } catch (error) {
    console.error("Error getting recording mode:", error);
    return 'hold';
  }
}

/**
 * Save recording mode to storage
 * @param {'hold'|'tap'} mode
 */
export async function saveRecordingMode(mode) {
  try {
    if (mode !== 'hold' && mode !== 'tap') {
      throw new Error("Recording mode must be 'hold' or 'tap'");
    }
    await AsyncStorage.setItem(STORAGE_KEYS.RECORDING_MODE, mode);
  } catch (error) {
    console.error("Error saving recording mode:", error);
    throw error;
  }
}

/**
 * Reset to default values (only resets lists, not recording mode)
 */
export async function resetToDefaults() {
  try {
    await Promise.all([
      saveAccountNames(DEFAULT_ACCOUNT_NAMES),
      saveExpenseCategories(DEFAULT_EXPENSE_CATEGORIES),
      // Note: Recording mode is NOT reset - user preference is preserved
    ]);
  } catch (error) {
    console.error("Error resetting to defaults:", error);
    throw error;
  }
}

