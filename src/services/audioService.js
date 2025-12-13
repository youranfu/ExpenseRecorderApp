/**
 * Audio recording service for React Native
 * Uses react-native-audio-recorder-player for recording
 */

import AudioRecorderPlayer from "react-native-audio-recorder-player";
import RNFS from "react-native-fs";
import { PermissionsAndroid, Platform } from "react-native";

// Import RNFS properly
const RNFSModule = require("react-native-fs");

const audioRecorderPlayer = new AudioRecorderPlayer();

let recordingPath = null;
let isRecording = false;

/**
 * Request audio recording permissions (Android)
 */
export async function requestAudioPermissions() {
  if (Platform.OS === "android") {
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: "Microphone Permission",
          message: "Expense Recorder needs access to your microphone to record expenses.",
          buttonNeutral: "Ask Me Later",
          buttonNegative: "Cancel",
          buttonPositive: "OK",
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      console.warn("Permission request error:", err);
      return false;
    }
  }
  // iOS permissions are handled via Info.plist
  return true;
}

/**
 * Start recording audio
 * @returns {Promise<string>} Path to the recording file
 */
export async function startRecording() {
  if (isRecording) {
    throw new Error("Recording already in progress");
  }

  const hasPermission = await requestAudioPermissions();
  if (!hasPermission) {
    throw new Error("Microphone permission denied");
  }

  try {
    // Generate file path
    const timestamp = new Date().getTime();
    const path = Platform.select({
      ios: `${RNFSModule.DocumentDirectoryPath}/expense_recording_${timestamp}.wav`,
      android: `${RNFSModule.DocumentDirectoryPath}/expense_recording_${timestamp}.wav`,
    });

    recordingPath = path;

    // Start recording
    const result = await audioRecorderPlayer.startRecorder(path, {
      SampleRate: 44100,
      Channels: 1,
      AudioQuality: "High",
      AudioEncoding: "wav",
    });

    isRecording = true;
    return result;
  } catch (error) {
    console.error("Failed to start recording:", error);
    throw error;
  }
}

/**
 * Stop recording and return the file path
 * @returns {Promise<string>} Path to the recorded audio file
 */
export async function stopRecording() {
  if (!isRecording) {
    throw new Error("No recording in progress");
  }

  try {
    const result = await audioRecorderPlayer.stopRecorder();
    audioRecorderPlayer.removeRecordBackListener();
    isRecording = false;

    if (!recordingPath) {
      throw new Error("Recording path not found");
    }

    return recordingPath;
  } catch (error) {
    console.error("Failed to stop recording:", error);
    isRecording = false;
    throw error;
  }
}

/**
 * Trim audio to first 30 seconds
 * Note: This is a simplified version. For production, you may want to use
 * a native audio processing library or do this on the server side.
 * 
 * @param {string} audioFilePath - Path to the audio file
 * @returns {Promise<string>} Path to the trimmed audio file
 */
export async function trimAudioTo30Seconds(audioFilePath) {
  try {
    // Get audio duration
    const duration = await audioRecorderPlayer.getDuration(audioFilePath);
    
    // If duration is less than 30 seconds, return original file
    if (duration <= 30) {
      return audioFilePath;
    }

    // For React Native, trimming audio requires native modules or server-side processing
    // For now, we'll return the original file and let the server handle trimming
    // OR use a library like react-native-audio-trimmer if available
    
    // Alternative: Use ffmpeg via react-native-ffmpeg (if installed)
    // const FFmpeg = require('react-native-ffmpeg');
    // const trimmedPath = audioFilePath.replace('.wav', '_trimmed.wav');
    // await FFmpeg.execute(`-i ${audioFilePath} -t 30 -c copy ${trimmedPath}`);
    // return trimmedPath;

    // For MVP, we'll just return the original and note that server should handle it
    // Or record with a 30-second limit from the start
    console.warn("Audio trimming not implemented. Using full recording.");
    return audioFilePath;
  } catch (error) {
    console.error("Failed to trim audio:", error);
    // Return original file if trimming fails
    return audioFilePath;
  }
}

/**
 * Check if currently recording
 */
export function getIsRecording() {
  return isRecording;
}

/**
 * Clean up recording file
 */
export async function cleanupRecording(filePath) {
  try {
    if (filePath && (await RNFSModule.exists(filePath))) {
      await RNFSModule.unlink(filePath);
    }
  } catch (error) {
    console.error("Failed to cleanup recording:", error);
  }
}

