/**
 * Transcription service — sends audio to AI transcription API and normalizes responses.
 */

import { Config } from "../../config";
import { tryReconstructTranscriptFromJson } from "./parsingLogic";

const API_KEY = Config.TRANSCRIPTION_API_KEY;
const REMOTE_HOST = Config.TRANSCRIPTION_API_HOST;
const REMOTE_PATH = Config.TRANSCRIPTION_API_PATH;

// Characters that are always trailing junk at the end of a transcript.
const TRAILING_JUNK = new Set(['"', "'", '}', '{', ']', '[', '.', ',', ':', ';', ' ', '\n', '\r', '\t']);

/**
 * Strips leading/trailing whitespace and trailing JSON/quote artifacts character by
 * character until a letter or digit is reached.
 */
export function cleanTranscriptText(str) {
  if (str == null || typeof str !== "string") return "";
  let s = str.trim();
  while (s.length > 0 && TRAILING_JUNK.has(s.charAt(s.length - 1))) {
    s = s.slice(0, -1);
  }
  return s.trim();
}

/**
 * Unwraps a JSON-encoded transcript string. Delegates structured-expense reconstruction
 * to the canonical tryReconstructTranscriptFromJson from parsingLogic.
 */
function unwrapJsonTranscript(val) {
  if (typeof val !== "string") return val;

  // Try the canonical JSON reconstruction (handles quote stripping, structured fields, etc.)
  const reconstructed = tryReconstructTranscriptFromJson(val);
  if (reconstructed) return cleanTranscriptText(reconstructed);

  return val;
}

/** Extracts the longest string value from an object, or returns the original value. */
function extractTranscriptFromObject(obj) {
  if (obj == null || typeof obj !== "object" || Array.isArray(obj)) return obj;
  const strings = Object.values(obj).filter((v) => typeof v === "string");
  if (strings.length === 0) return obj;
  return strings.reduce((a, b) => (a.length >= b.length ? a : b));
}

/**
 * Normalizes an API response by unwrapping JSON in .text / .transcript fields.
 */
export function normalizeTranscriptionResponse(data) {
  if (!data || typeof data !== "object") return data;
  const out = { ...data };
  for (const key of ["text", "transcript"]) {
    const val = out[key];
    if (typeof val === "string") {
      out[key] = unwrapJsonTranscript(val);
    } else if (typeof val === "object" && val !== null) {
      const extracted = extractTranscriptFromObject(val);
      out[key] = typeof extracted === "string" ? cleanTranscriptText(extracted) : extracted;
    }
  }
  return out;
}

/**
 * Returns a plain transcript string from a value that may be JSON-wrapped.
 * Use for display and downstream parsing.
 */
export function toPlainTranscriptString(raw) {
  if (raw == null) return "";
  const s = typeof raw === "string" ? raw.trim() : String(raw).trim();
  if (!s) return "";
  const normalized = normalizeTranscriptionResponse({ text: s });
  const out = normalized.text || normalized.transcript || "";
  const str = typeof out === "string" ? out : "";
  return cleanTranscriptText(str);
}

/**
 * Sends audio file to transcription API
 * @param {string} audioFilePath - Path to the audio file (WAV format)
 * @returns {Promise<Object>} Transcription response with text field
 */
export async function sendAudioToTranscriptionAPI(audioFilePath) {
  try {
    const RNFS = require("react-native-fs");
    
    // Read audio file as base64
    const audioBase64 = await RNFS.readFile(audioFilePath, "base64");
    const audioBuffer = Buffer.from(audioBase64, "base64");

    // Create FormData equivalent using multipart/form-data
    const FormData = require("form-data");
    const form = new FormData();
    form.append("audio_file", audioBuffer, {
      filename: "expense_recording.wav",
      contentType: "audio/wav",
    });

    const formHeaders = form.getHeaders();

    // Convert FormData to blob for fetch
    const formDataBlob = await formToBlob(form);

    const response = await fetch(`https://${REMOTE_HOST}${REMOTE_PATH}`, {
      method: "POST",
      headers: {
        ...formHeaders,
        Authorization: `Bearer ${API_KEY}`,
      },
      body: formDataBlob,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Transcription API error: ${response.status} - ${errorText}`
      );
    }

    const data = await response.json();
    return normalizeTranscriptionResponse(data);
  } catch (error) {
    console.error("Transcription service error:", error);
    throw error;
  }
}

/**
 * Helper to convert FormData to Blob (for React Native compatibility)
 * Note: In React Native, you may need to use a library like react-native-form-data
 * or construct the multipart form data manually
 */
async function formToBlob(form) {
  // For React Native, we'll need to use a library or construct manually
  // This is a simplified version - you may need to adjust based on your setup
  const RNFS = require("react-native-fs");
  
  // Alternative: Use react-native-fs to read and send directly
  // Or use a library like react-native-form-data
  
  // For now, return the form as-is (may need adjustment)
  return form;
}

/**
 * Alternative implementation using React Native's FormData
 * This is the recommended approach for React Native
 */
export async function sendAudioToTranscriptionAPIAlternative(audioFilePath) {
  try {
    const RNFS = require("react-native-fs");
    const { Platform } = require("react-native");
    
    // Verify file exists
    const fileExists = await RNFS.exists(audioFilePath);
    if (!fileExists) {
      throw new Error(`Audio file not found at path: ${audioFilePath}`);
    }
    
    // Format file URI correctly for React Native FormData
    // React Native FormData expects file:// URI for both platforms
    let fileUri = audioFilePath;
    
    // Ensure file:// prefix is present
    if (!fileUri.startsWith("file://")) {
      fileUri = `file://${fileUri}`;
    }
    
    // Create FormData with proper React Native format
    const formData = new FormData();
    formData.append("audio_file", {
      uri: fileUri,
      type: "audio/wav",
      name: "expense_recording.wav",
    });
    
    console.log("Sending audio to transcription API:", {
      filePath: audioFilePath,
      fileUri: fileUri,
      fileExists: fileExists,
      apiUrl: `https://${REMOTE_HOST}${REMOTE_PATH}`,
    });
    
    const response = await fetch(`https://${REMOTE_HOST}${REMOTE_PATH}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        // Don't set Content-Type - let fetch set it with boundary for multipart/form-data
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Transcription API error response:", {
        status: response.status,
        statusText: response.statusText,
        errorText: errorText,
      });
      throw new Error(
        `Transcription API error: ${response.status} - ${errorText}`
      );
    }

    const data = await response.json();
    console.log("Transcription API success:", data);
    return normalizeTranscriptionResponse(data);
  } catch (error) {
    console.error("Transcription service error:", error);
    // Provide more detailed error information
    if (error.message.includes("Network request failed")) {
      throw new Error(
        `Network error: Unable to reach transcription API. Check your internet connection and ensure the API endpoint is accessible. Original error: ${error.message}`
      );
    }
    throw error;
  }
}

