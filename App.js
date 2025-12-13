/**
 * Main App Component - Expense Recorder React Native App
 * Ported from index.html and script.js
 */

import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  Platform,
  Linking,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import "react-native-get-random-values"; // Required for crypto operations

import {
  startRecording,
  stopRecording,
  getIsRecording,
  cleanupRecording,
} from "./src/services/audioService";
import { sendAudioToTranscriptionAPIAlternative as sendAudioToTranscriptionAPI } from "./src/services/transcriptionService";
import {
  buildExpenseRecordFromTranscript,
} from "./src/services/parsingLogic";
import {
  appendExpenseRecordToSheet,
  configureGoogleSignIn,
  signInWithGoogle,
  signOutFromGoogle,
  isSignedIn,
  getCurrentUser,
  setSpreadsheetId,
  getSpreadsheetId,
} from "./src/services/googleSheetsService";
import { Config } from "./config";

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState("Idle");
  const [error, setError] = useState("");
  const [transcript, setTranscript] = useState("No transcript yet. Record an expense to see it here.");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGoogleSignedIn, setIsGoogleSignedIn] = useState(false);
  const [googleUser, setGoogleUser] = useState(null);
  const [spreadsheetId, setSpreadsheetIdState] = useState("");
  const [lastSavedRow, setLastSavedRow] = useState(null);
  const recordingTimeoutRef = useRef(null);

  // Configure Google Sign-in and check status on mount
  useEffect(() => {
    const initializeGoogleAuth = async () => {
      try {
        // Configure Google Sign-in with your OAuth 2.0 Web Client ID
        // Get this from Google Cloud Console: https://console.cloud.google.com/
        // Create OAuth 2.0 credentials -> Web application -> Copy Client ID
        const WEB_CLIENT_ID = Config.GOOGLE_WEB_CLIENT_ID;
        
        if (!WEB_CLIENT_ID || WEB_CLIENT_ID === 'YOUR_WEB_CLIENT_ID_HERE') {
          setError("Please configure OAuth 2.0 Web Client ID in config.js. See CONFIG_SETUP.md for instructions.");
          return;
        }

        await configureGoogleSignIn(WEB_CLIENT_ID);
        
        // Check if already signed in
        const signedIn = await isSignedIn();
        setIsGoogleSignedIn(signedIn);
        
        if (signedIn) {
          const user = await getCurrentUser();
          setGoogleUser(user);
        }
        
        // Load spreadsheet ID if set
        const savedSpreadsheetId = await getSpreadsheetId();
        if (savedSpreadsheetId) {
          setSpreadsheetIdState(savedSpreadsheetId);
        } else {
          // Set default spreadsheet ID from config
          const defaultSpreadsheetId = Config.DEFAULT_SPREADSHEET_ID;
          if (defaultSpreadsheetId && defaultSpreadsheetId !== 'YOUR_DEFAULT_SPREADSHEET_ID_HERE') {
            await setSpreadsheetId(defaultSpreadsheetId);
            setSpreadsheetIdState(defaultSpreadsheetId);
          }
        }
      } catch (err) {
        console.error("Failed to initialize Google Auth:", err);
        setError("Failed to initialize Google Sign-in: " + err.message);
      }
    };

    initializeGoogleAuth();
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      setError("");
      setStatus("Signing in with Google...");
      const accessToken = await signInWithGoogle();
      const user = await getCurrentUser();
      setIsGoogleSignedIn(true);
      setGoogleUser(user);
      setStatus("Signed in successfully!");
      setTimeout(() => setStatus("Idle"), 2000);
    } catch (err) {
      console.error("Sign-in error:", err);
      setError("Failed to sign in: " + err.message);
      setStatus("Sign-in failed");
    }
  };

  const handleGoogleSignOut = async () => {
    try {
      setError("");
      setStatus("Signing out...");
      await signOutFromGoogle();
      setIsGoogleSignedIn(false);
      setGoogleUser(null);
      setStatus("Signed out successfully");
      setTimeout(() => setStatus("Idle"), 2000);
    } catch (err) {
      console.error("Sign-out error:", err);
      setError("Failed to sign out: " + err.message);
    }
  };

  const handleOpenGoogleSheet = async () => {
    try {
      const sheetId = await getSpreadsheetId();
      if (!sheetId) {
        Alert.alert(
          "No Spreadsheet ID",
          "Please configure the spreadsheet ID in the app settings."
        );
        return;
      }

      const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
      
      // Open the URL directly - will open in Google Sheets app if installed, otherwise in browser
      // On Android, canOpenURL can be unreliable, so we try opening directly
      await Linking.openURL(sheetUrl);
      setStatus("Opening Google Sheet...");
    } catch (err) {
      console.error("Error opening Google Sheet:", err);
      const sheetId = await getSpreadsheetId();
      const sheetUrl = sheetId ? `https://docs.google.com/spreadsheets/d/${sheetId}/edit` : '';
      
      Alert.alert(
        "Cannot Open URL",
        sheetUrl 
          ? `Unable to open the Google Sheet. You can copy this URL and open it manually:\n\n${sheetUrl}`
          : "Failed to open Google Sheet: " + err.message
      );
    }
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
      }
    };
  }, []);

  const handleRecordButtonPressIn = async () => {
    if (isProcessing || isRecording) {
      return; // Prevent starting if already recording or processing
    }
      await startRecordingProcess();
  };

  const handleRecordButtonPressOut = async () => {
    if (!isRecording) {
      return; // Only stop if actually recording
    }
    // Clear the auto-stop timeout since user released early
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    await stopRecordingAndProcess();
  };

  const startRecordingProcess = async () => {
    try {
      setError("");
      setStatus("Requesting microphone…");
      
      await startRecording();
      setIsRecording(true);
      setStatus("Recording… release to stop (auto-stops at 30s)");
      
      // Set auto-stop timeout for 30 seconds
      recordingTimeoutRef.current = setTimeout(async () => {
        if (getIsRecording()) {
          setStatus("Auto-stopping at 30 seconds…");
          await stopRecordingAndProcess();
        }
      }, 30000); // 30 seconds in milliseconds
    } catch (err) {
      console.error("Recording start error:", err);
      setError(err.message || "Could not start recording. Check microphone permissions.");
      setStatus("Idle");
      // Clear timeout if recording failed to start
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
        recordingTimeoutRef.current = null;
      }
    }
  };

  const stopRecordingAndProcess = async () => {
    // Clear the timeout if it exists
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }

    if (!getIsRecording()) {
      setIsRecording(false);
      setStatus("Idle");
      return;
    }

    setIsProcessing(true);
    setIsRecording(false); // Set this immediately so button state updates
    setStatus("Stopping recording…");
    let recordingPath = null;

    try {
      // Stop recording
      recordingPath = await stopRecording();
      setStatus("Trimming to first 30 seconds…");

      // Note: Audio trimming may need to be handled server-side or with native module
      // For now, we'll send the full recording
      const trimmedPath = recordingPath; // Placeholder - implement trimming if needed

      setStatus("Sending audio to AI for transcription…");
      
      // Send to transcription API
      const transcription = await sendAudioToTranscriptionAPI(trimmedPath);

      if (!transcription) {
        setStatus("Transcription failed.");
        return;
      }

      console.log("Transcription raw response:", transcription);

      // Extract text from response
      const textField =
        typeof transcription.text === "string"
          ? transcription.text
          : typeof transcription.transcript === "string"
          ? transcription.transcript
          : "";

      if (textField) {
        const transcriptText = textField.trim();
        setTranscript(transcriptText || "Transcription returned empty text.");
        
        // Parse expense record
        const record = buildExpenseRecordFromTranscript(transcriptText);
        
        // Save to Google Sheets (only if signed in)
        if (isGoogleSignedIn) {
        setStatus("Saving expense record to Google Sheet…");
        try {
            const savedRow = await appendExpenseRecordToSheet(record);
            setLastSavedRow(savedRow);
            setStatus(`Saved to row ${savedRow.rowNumber || '?'} in Google Sheet.`);
        } catch (sheetsError) {
          console.error("Failed to save to Google Sheets:", sheetsError);
          setStatus("Parsed expense record, but failed to save to Google Sheet.");
          setError("Failed to save to Google Sheet: " + sheetsError.message);
            setLastSavedRow(null);
            
            // If auth error, prompt to sign in again
            if (sheetsError.message.includes('Authentication') || sheetsError.message.includes('sign in')) {
              setIsGoogleSignedIn(false);
              setGoogleUser(null);
            }
          }
        } else {
          setStatus("Expense parsed. Sign in with Google to save to Sheets.");
          setError("Please sign in with Google to save expenses to Google Sheets.");
          setLastSavedRow(null);
        }
      } else {
        setError(
          "Transcription response did not include a usable text field. Check console for raw response."
        );
        setStatus("Transcription failed.");
      }
    } catch (err) {
      console.error("Processing error:", err);
      setError("An error occurred while processing the audio: " + err.message);
      setStatus("Processing error.");
    } finally {
      setIsProcessing(false);
      
      // Cleanup recording file
      if (recordingPath) {
        await cleanupRecording(recordingPath);
      }
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      style={styles.scrollView}
    >
      <View style={styles.app}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Expense Recorder</Text>
            <Text style={styles.subtitle}>
              Capture purchases with a single tap of your voice.
            </Text>
          </View>
        </View>

        <View style={styles.recordSection}>
          <TouchableOpacity
            style={[
              styles.recordButton,
              isRecording && styles.recordButtonRecording,
              isProcessing && styles.recordButtonDisabled,
            ]}
            onPressIn={handleRecordButtonPressIn}
            onPressOut={handleRecordButtonPressOut}
            disabled={isProcessing}
            activeOpacity={0.8}
          >
            <View
              style={[
                styles.dot,
                isRecording && styles.dotLive,
              ]}
            />
            <Text style={styles.recordButtonText}>
              {isRecording ? "Recording… Release to Stop" : "Press & Hold to Record"}
            </Text>
          </TouchableOpacity>

          <View style={styles.status}>
            <Text style={styles.statusLabel}>
              Status: <Text style={styles.statusValue}>{status}</Text>
            </Text>
            <View style={styles.smallPill}>
              <Text style={styles.smallPillText}>Max used for AI: 30s audio</Text>
            </View>
          </View>

          <Text style={styles.hint}>
            Say: "charge XX dollars (and YY cents), to card, (date, optional: today), category, description."
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Last transcript</Text>
          <View style={styles.transcript}>
            <Text style={styles.transcriptText}>{transcript}</Text>
          </View>
        </View>

        {lastSavedRow && (
          <View style={styles.section}>
            <View style={styles.savedRowHeader}>
              <Text style={styles.sectionTitle}>Saved to Google Sheets</Text>
              <View style={styles.successBadge}>
                <Text style={styles.successBadgeText}>✓ Row {lastSavedRow.rowNumber || '?'}</Text>
              </View>
            </View>
            <View style={styles.savedRowContainer}>
              <View style={styles.savedRowItem}>
                <Text style={styles.savedRowLabel}>Date:</Text>
                <Text style={styles.savedRowValue}>{lastSavedRow.record.date || 'N/A'}</Text>
              </View>
              <View style={styles.savedRowItem}>
                <Text style={styles.savedRowLabel}>Card:</Text>
                <Text style={styles.savedRowValue}>{lastSavedRow.record.card_name || 'N/A'}</Text>
              </View>
              <View style={styles.savedRowItem}>
                <Text style={styles.savedRowLabel}>Amount:</Text>
                <Text style={[styles.savedRowValue, styles.amountValue]}>
                  {lastSavedRow.record.expense_amount ? `$${lastSavedRow.record.expense_amount}` : 'N/A'}
                </Text>
              </View>
              <View style={styles.savedRowItem}>
                <Text style={styles.savedRowLabel}>Category:</Text>
                <Text style={styles.savedRowValue}>{lastSavedRow.record.expense_category || 'N/A'}</Text>
              </View>
              <View style={styles.savedRowItem}>
                <Text style={styles.savedRowLabel}>Description:</Text>
                <Text style={styles.savedRowValue}>{lastSavedRow.record.description || 'N/A'}</Text>
              </View>
              <View style={[styles.savedRowItem, styles.savedRowItemLast]}>
                <Text style={styles.savedRowLabel}>Saved at:</Text>
                <Text style={styles.savedRowValue}>
                  {lastSavedRow.values[5] ? new Date(lastSavedRow.values[5]).toLocaleString() : 'N/A'}
                </Text>
              </View>
            </View>
            <Text style={styles.savedRowRange}>
              Range: {lastSavedRow.range}
            </Text>
            <TouchableOpacity
              style={styles.openSheetButton}
              onPress={handleOpenGoogleSheet}
            >
              <Text style={styles.openSheetButtonText}>Open Google Sheet</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Google Sign-in Section - Moved to bottom */}
        <View style={styles.authSection}>
          {isGoogleSignedIn ? (
            <View style={styles.signedInContainer}>
              <Text style={styles.signedInText}>
                Signed in as: {googleUser?.user?.email || googleUser?.data?.user?.email || googleUser?.email || 'Google User'}
              </Text>
              <View style={styles.signedInButtons}>
                <TouchableOpacity
                  style={styles.openSheetButtonSmall}
                  onPress={handleOpenGoogleSheet}
                >
                  <Text style={styles.openSheetButtonSmallText}>Open Sheet</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.signOutButton}
                  onPress={handleGoogleSignOut}
                >
                  <Text style={styles.signOutButtonText}>Sign Out</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.signInButton}
              onPress={handleGoogleSignIn}
            >
              <Text style={styles.signInButtonText}>Sign in with Google</Text>
            </TouchableOpacity>
          )}
        </View>

        {isProcessing && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.loadingText}>Processing...</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: "#e4ecff",
  },
  container: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    minHeight: "100%",
  },
  app: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 28,
    width: "100%",
    maxWidth: 480,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.18,
    shadowRadius: 45,
    elevation: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1f2933",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 4,
  },
  pill: {
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.25)",
  },
  pillText: {
    fontSize: 10,
    color: "#1d4ed8",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  recordSection: {
    marginTop: 16,
    alignItems: "center",
  },
  recordButton: {
    width: "100%",
    paddingVertical: 22,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: "#2563eb",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: "#3b82f6",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.28,
    shadowRadius: 40,
    elevation: 8,
  },
  recordButtonRecording: {
    backgroundColor: "#dc2626",
  },
  recordButtonDisabled: {
    opacity: 0.6,
  },
  recordButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#f97373",
  },
  dotLive: {
    backgroundColor: "#f97373",
    // Animation handled via Animated API if needed
  },
  status: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    flexWrap: "wrap",
  },
  statusLabel: {
    fontSize: 14,
    color: "#4b5563",
    fontWeight: "600",
  },
  statusValue: {
    color: "#111827",
    fontVariant: ["tabular-nums"],
  },
  smallPill: {
    backgroundColor: "#eff6ff",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.3)",
  },
  smallPillText: {
    fontSize: 12,
    color: "#1d4ed8",
  },
  hint: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 8,
    textAlign: "center",
  },
  error: {
    color: "#b91c1c",
    fontSize: 14,
    marginTop: 6,
    textAlign: "center",
  },
  section: {
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(148, 163, 184, 0.38)",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 6,
  },
  transcript: {
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    padding: 12,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: "rgba(209, 213, 219, 0.9)",
  },
  transcriptText: {
    fontSize: 13,
    lineHeight: 20,
    color: "#4b5563",
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#2563eb",
    fontWeight: "600",
  },
  authSection: {
    marginTop: 24,
    marginBottom: 8,
    width: "100%",
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: "rgba(148, 163, 184, 0.38)",
  },
  signInButton: {
    width: "100%",
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: "#4285f4",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#4285f4",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  signInButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  signedInContainer: {
    flexDirection: "column",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#f0f9ff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  signedInText: {
    fontSize: 14,
    color: "#1e40af",
    fontWeight: "500",
    marginBottom: 12,
  },
  signedInButtons: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  signOutButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: "#dc2626",
    flex: 1,
  },
  signOutButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  openSheetButtonSmall: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: "#2563eb",
    flex: 1,
  },
  openSheetButtonSmallText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  savedRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  successBadge: {
    backgroundColor: "#10b981",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  successBadgeText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "600",
  },
  savedRowContainer: {
    backgroundColor: "#f0fdf4",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#86efac",
  },
  savedRowItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(34, 197, 94, 0.2)",
  },
  savedRowItemLast: {
    borderBottomWidth: 0,
    marginBottom: 0,
    paddingBottom: 0,
  },
  savedRowLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#059669",
    flex: 1,
  },
  savedRowValue: {
    fontSize: 13,
    color: "#111827",
    flex: 2,
    textAlign: "right",
    fontWeight: "500",
  },
  amountValue: {
    color: "#dc2626",
    fontWeight: "700",
    fontSize: 14,
  },
  savedRowRange: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 8,
    fontStyle: "italic",
  },
  openSheetButton: {
    width: "100%",
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#2563eb",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  openSheetButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
});

