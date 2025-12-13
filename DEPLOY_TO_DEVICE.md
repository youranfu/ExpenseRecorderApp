# Deploy Expense Recorder App to Real Android Device

## Quick Method: Direct Install (Recommended for Testing)

### Prerequisites
1. **Enable USB Debugging on your Android device:**
   - Go to **Settings** → **About Phone**
   - Tap **Build Number** 7 times to enable Developer Options
   - Go back to **Settings** → **Developer Options**
   - Enable **USB Debugging**
   - Enable **Install via USB** (if available)

2. **Connect your device:**
   - Connect Android device to your Mac via USB cable
   - Allow USB debugging when prompted on your device
   - Verify connection: `adb devices` (should show your device)

### Deploy Steps

1. **Make sure Metro bundler is running:**
   ```bash
   cd ExpenseRecorderApp
   npm start
   ```

2. **In a new terminal, run:**
   ```bash
   cd ExpenseRecorderApp
   npm run android
   ```
   
   This will:
   - Build the app
   - Install it on your connected device
   - Launch it automatically

3. **Grant permissions when prompted:**
   - Allow microphone access when the app requests it
   - Allow any other permissions as needed

---

## Alternative Method: Build APK and Install Manually

### Build Debug APK (for testing)

```bash
cd ExpenseRecorderApp/android
./gradlew assembleDebug
```

The APK will be at: `android/app/build/outputs/apk/debug/app-debug.apk`

### Install APK on Device

**Option A: Via ADB (if device is connected)**
```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

**Option B: Manual Install**
1. Copy `app-debug.apk` to your device (via USB, email, or cloud)
2. On your device, open the APK file
3. Allow "Install from Unknown Sources" if prompted
4. Install the app

---

## Build Release APK (for distribution)

### 1. Generate Signing Key (first time only)

```bash
cd ExpenseRecorderApp/android
keytool -genkeypair -v -storetype PKCS12 \
  -keystore expense-recorder-key.keystore \
  -alias expense-recorder \
  -keyalg RSA -keysize 2048 -validity 10000
```

You'll be prompted to enter:
- Password (remember this!)
- Your name, organization, etc.

### 2. Create `android/keystore.properties`

**⚠️ SECURITY WARNING:** This file contains sensitive passwords and is gitignored. Never commit it to version control!

1. Copy the example file:
   ```bash
   cd ExpenseRecorderApp/android
   cp keystore.properties.example keystore.properties
   ```

2. Edit `keystore.properties` and fill in your actual passwords:
   ```properties
   MYAPP_RELEASE_STORE_FILE=expense-recorder-key.keystore
   MYAPP_RELEASE_STORE_PASSWORD=your-actual-password-here
   MYAPP_RELEASE_KEY_ALIAS=expense-recorder
   MYAPP_RELEASE_KEY_PASSWORD=your-actual-password-here
   ```

**Note:** The `keystore.properties` file is automatically excluded from Git via `.gitignore`.

### 3. Update `android/app/build.gradle`

You need to make two changes:

**Step 3a: Load keystore properties** (add this at the top of the file, before the `android` block):

```gradle
// Load keystore properties
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
```

**Step 3b: Add release signing config** (add the `release` block inside the existing `signingConfigs` block):

Find the existing `signingConfigs` block (around line 85) and add the `release` config:

```gradle
signingConfigs {
    debug {
        storeFile file('debug.keystore')
        storePassword 'android'
        keyAlias 'androiddebugkey'
        keyPassword 'android'
    }
    release {
        if (keystorePropertiesFile.exists()) {
            storeFile file(keystoreProperties['MYAPP_RELEASE_STORE_FILE'])
            storePassword keystoreProperties['MYAPP_RELEASE_STORE_PASSWORD']
            keyAlias keystoreProperties['MYAPP_RELEASE_KEY_ALIAS']
            keyPassword keystoreProperties['MYAPP_RELEASE_KEY_PASSWORD']
        }
    }
}
```

**Step 3c: Update the release buildType** (change line 100 from `signingConfig signingConfigs.debug` to `signingConfig signingConfigs.release`):

```gradle
buildTypes {
    debug {
        signingConfig signingConfigs.debug
    }
    release {
        signingConfig signingConfigs.release  // Changed from debug
        minifyEnabled enableProguardInReleaseBuilds
        proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
    }
}
```

### 4. Build Release APK

```bash
cd ExpenseRecorderApp/android
./gradlew assembleRelease
```

The signed APK will be at: `android/app/build/outputs/apk/release/app-release.apk`

### 5. Install Release APK on Your Android Phone

You have several options to install the APK on your device:

#### Option A: Install via ADB (Easiest - Recommended) ⚡

**Prerequisites:**
- USB debugging enabled on your phone (see Step 1 in "Quick Method" above)
- Phone connected via USB
- ADB installed on your computer

**Steps:**
1. Connect your phone to your computer via USB
2. Verify connection:
   ```bash
   adb devices
   ```
   (Should show your device)

3. Install the APK:
   ```bash
   cd ExpenseRecorderApp/android
   adb install app/build/outputs/apk/release/app-release.apk
   ```

4. The app will install automatically and appear on your phone!

**If you get "INSTALL_FAILED_UPDATE_INCOMPATIBLE":**
- Uninstall any existing debug version first:
  ```bash
  adb uninstall com.expenserecorderapp
  ```
- Then install the release APK again

---

#### Option B: Transfer via USB and Install Manually 📱

**Steps:**
1. **Transfer APK to your phone:**
   - Connect phone to computer via USB
   - On your phone, when prompted, select "File Transfer" or "MTP" mode
   - On your computer, open the phone's storage
   - Copy `app-release.apk` to your phone's Downloads folder (or any folder)

2. **Enable "Install from Unknown Sources":**
   - On your phone, go to **Settings** → **Security** (or **Apps** → **Special access**)
   - Enable **"Install unknown apps"** or **"Install from Unknown Sources"**
   - Select the app you'll use to open the APK (Files app, Chrome, etc.)

3. **Install the APK:**
   - On your phone, open **Files** app (or any file manager)
   - Navigate to **Downloads** folder
   - Tap on `app-release.apk`
   - Tap **"Install"**
   - Wait for installation to complete
   - Tap **"Open"** to launch the app

---

#### Option C: Transfer via Cloud Storage ☁️

**Steps:**
1. **Upload APK to cloud storage:**
   - Upload `app-release.apk` to Google Drive, Dropbox, or any cloud service
   - Or email it to yourself

2. **Download on your phone:**
   - Open the cloud storage app (Google Drive, etc.) on your phone
   - Download the APK file

3. **Enable "Install from Unknown Sources":**
   - Same as Option B, Step 2 above

4. **Install the APK:**
   - Open your Downloads folder
   - Tap on `app-release.apk`
   - Tap **"Install"**

---

#### Option D: Transfer via Email 📧

**Steps:**
1. **Email the APK to yourself:**
   - Attach `app-release.apk` to an email
   - Send it to your Gmail (or any email accessible on your phone)

2. **Download on your phone:**
   - Open Gmail app on your phone
   - Open the email with the attachment
   - Download the APK file

3. **Enable "Install from Unknown Sources":**
   - Same as Option B, Step 2 above

4. **Install the APK:**
   - Open Downloads folder
   - Tap on `app-release.apk`
   - Tap **"Install"**

---

#### Troubleshooting Installation

**"Install blocked" or "Can't install app":**
- Make sure "Install from Unknown Sources" is enabled for the app you're using (Files, Chrome, Gmail, etc.)
- On newer Android versions, you need to enable it per-app, not globally

**"App not installed" error:**
- Uninstall any existing version of the app first
- Make sure you're installing the release APK, not a corrupted file
- Try rebooting your phone

**"Package appears to be invalid":**
- Rebuild the APK: `./gradlew clean assembleRelease`
- Make sure the build completed successfully

**Can't find the APK file:**
- Check the exact path: `android/app/build/outputs/apk/release/app-release.apk`
- Make sure you ran `assembleRelease` successfully

---

## Troubleshooting

### Device Not Detected
- Make sure USB debugging is enabled
- Try a different USB cable
- Try a different USB port
- On your device, revoke USB debugging authorizations and reconnect
- Run `adb kill-server && adb start-server`

### Build Errors
- Make sure you're in the `ExpenseRecorderApp` directory
- Run `cd android && ./gradlew clean` then rebuild
- Check that `ANDROID_HOME` is set correctly

### App Crashes on Device
- Check logs: `adb logcat | grep -i expenserecorder`
- Make sure Metro bundler is running
- Try rebuilding: `npm run android`

### Metro Bundler Connection Issues
- Make sure your device and computer are on the same WiFi network
- Or use USB connection with port forwarding: `adb reverse tcp:8081 tcp:8081`
- Shake device → Dev Settings → Debug server host → Enter your computer's IP:8081

---

## Testing Checklist

- [ ] App installs successfully
- [ ] App launches without crashes
- [ ] Microphone permission is requested and granted
- [ ] Can record audio
- [ ] Can stop recording
- [ ] Transcription works
- [ ] Google Sheets integration works
- [ ] Expense records appear in Google Sheet

---

## Notes

- **Debug builds** are easier to test but larger in size
- **Release builds** are optimized and smaller, but require signing
- Keep your keystore file safe - you'll need it for app updates!
- For production, consider using Google Play App Signing

## What Can You Do With a Release APK?

✅ **Install directly** on Android devices (side-loading)  
✅ **Distribute manually** via email, cloud storage, or USB  
✅ **Test on multiple devices** without going through an app store  

❌ **NOT automatically published** to Google Play Store  
❌ **NOT available** in Google Play Store for others to download  

**For Google Play Store publishing**, you need additional steps:
- Google Play Developer Account ($25)
- Android App Bundle (AAB) instead of APK
- App listing (screenshots, description, privacy policy)
- Google Play review process

See [GOOGLE_PLAY_PUBLISHING.md](./GOOGLE_PLAY_PUBLISHING.md) for detailed instructions.

- Make sure you're in the `ExpenseRecorderApp` directory
- Run `cd android && ./gradlew clean` then rebuild
- Run `cd .. && npm start`
- A new terminal, run `npm run android`

