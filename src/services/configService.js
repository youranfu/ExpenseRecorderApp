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

const DEFAULT_EXPENSE_CATEGORIES = [
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

