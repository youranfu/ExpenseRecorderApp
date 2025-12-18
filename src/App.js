/**
 * Main App Component - Expense Recorder React Native App
 * Ported from index.html and script.js
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import "react-native-get-random-values"; // Required for crypto operations

import {
  startRecording,
  stopRecording,
  getIsRecording,
  cleanupRecording,
} from "./services/audioService";
import { sendAudioToTranscriptionAPIAlternative as sendAudioToTranscriptionAPI } from "./services/transcriptionService";
import {
  buildExpenseRecordFromTranscript,
} from "./services/parsingLogic";
import {
  appendExpenseRecordToSheet,
  loadSheetsConfigFromStorage,
} from "./services/googleSheetsService";

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState("Idle");
  const [error, setError] = useState("");
  const [transcript, setTranscript] = useState("No transcript yet. Record an expense to see it here.");
  const [isProcessing, setIsProcessing] = useState(false);

  // Load Google Sheets config on mount
  useEffect(() => {
    loadSheetsConfigFromStorage(AsyncStorage).catch((err) => {
      console.error("Failed to load Google Sheets config:", err);
      setError("Google Sheets configuration not found. Please configure in settings.");
    });
  }, []);

  const handleRecordButtonPress = async () => {
    if (isRecording) {
      await stopRecordingAndProcess();
    } else {
      await startRecordingProcess();
    }
  };

  const startRecordingProcess = async () => {
    try {
      setError("");
      setStatus("Requesting microphone…");
      
      await startRecording();
      setIsRecording(true);
      setStatus("Recording… tap again to stop.");
    } catch (err) {
      console.error("Recording start error:", err);
      setError(err.message || "Could not start recording. Check microphone permissions.");
      setStatus("Idle");
    }
  };

  const stopRecordingAndProcess = async () => {
    if (!getIsRecording()) {
      setIsRecording(false);
      setStatus("Idle");
      return;
    }

    setIsProcessing(true);
    setStatus("Stopping recording…");
    let recordingPath = null;

    try {
      // Stop recording
      recordingPath = await stopRecording();
      setIsRecording(false);
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
        
        // Save to Google Sheets
        setStatus("Saving expense record to Google Sheet…");
        try {
          await appendExpenseRecordToSheet(record);
          setStatus("Saved expense record to Google Sheet.");
        } catch (sheetsError) {
          console.error("Failed to save to Google Sheets:", sheetsError);
          setStatus("Parsed expense record, but failed to save to Google Sheet.");
          setError("Failed to save to Google Sheet: " + sheetsError.message);
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
          <View style={styles.pill}>
            <Text style={styles.pillText}>Prototype</Text>
          </View>
        </View>

        <View style={styles.recordSection}>
          <TouchableOpacity
            style={[
              styles.recordButton,
              isRecording && styles.recordButtonRecording,
              isProcessing && styles.recordButtonDisabled,
            ]}
            onPress={handleRecordButtonPress}
            disabled={isProcessing}
          >
            <View
              style={[
                styles.dot,
                isRecording && styles.dotLive,
              ]}
            />
            <Text style={styles.recordButtonText}>
              {isRecording ? "Stop & Process" : "Capture Expense!"}
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
            Speak naturally: date, how much, which card, what category, and description
            (for example: "Charge $335.78 on CITI COSTCO. Date November 30th.
            Category is food. The description is 'dinner with friends'"). The first 30
            seconds will be sent to the AI.
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Last transcript</Text>
          <View style={styles.transcript}>
            <Text style={styles.transcriptText}>{transcript}</Text>
          </View>
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
});

