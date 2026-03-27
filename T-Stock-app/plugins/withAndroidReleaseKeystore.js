/**
 * plugins/withAndroidReleaseKeystore.js
 *
 * Expo Config Plugin: configures release signing via environment variables,
 * so the release APK is NOT signed with the debug keystore.
 *
 * Required env vars (set in CI / EAS secrets, NEVER commit values):
 *   TSTOCK_STORE_FILE      — path to the keystore file relative to android/app/
 *   TSTOCK_KEY_ALIAS       — key alias inside the keystore
 *   TSTOCK_STORE_PASSWORD  — keystore password
 *   TSTOCK_KEY_PASSWORD    — key password
 *
 * Behaviour:
 *   - When env vars are set  → release build uses the provided keystore
 *   - When env vars are absent → falls back to debug keystore (local dev only)
 *
 * This plugin survives `expo prebuild --clean`.
 *
 * EAS Build alternative (recommended for CI/CD):
 *   eas credentials --platform android   # EAS manages the keystore automatically
 *   eas build --platform android --profile production
 */
const { withAppBuildGradle } = require('@expo/config-plugins');

const RELEASE_SIGNING_BLOCK = [
  '        release {',
  "            storeFile System.getenv('TSTOCK_STORE_FILE') ? file(System.getenv('TSTOCK_STORE_FILE')) : file('debug.keystore')",
  "            storePassword System.getenv('TSTOCK_STORE_PASSWORD') ?: 'android'",
  "            keyAlias System.getenv('TSTOCK_KEY_ALIAS') ?: 'androiddebugkey'",
  "            keyPassword System.getenv('TSTOCK_KEY_PASSWORD') ?: 'android'",
  '        }',
].join('\n');

const withAndroidReleaseKeystore = (config) => {
  return withAppBuildGradle(config, (mod) => {
    let contents = mod.modResults.contents;

    // Idempotent — skip if already patched
    if (contents.includes('TSTOCK_STORE_FILE')) return mod;

    // 1. Insert release signingConfig after the debug {} closing brace
    //    Matches the exact pattern Expo prebuild generates:
    //      "        }\n    }\n    buildTypes {"
    contents = contents.replace(
      "            keyPassword 'android'\n        }\n    }\n    buildTypes {",
      `            keyPassword 'android'\n        }\n${RELEASE_SIGNING_BLOCK}\n    }\n    buildTypes {`,
    );

    // 2. In the release buildType only: swap debug → release signingConfig.
    //    The release block starts with "        release {" and contains the
    //    first signingConfig after that point.
    const releaseBlockStart = contents.indexOf('        release {');
    if (releaseBlockStart !== -1) {
      const afterRelease = contents.slice(releaseBlockStart);
      const patched = afterRelease.replace(
        'signingConfig signingConfigs.debug',
        'signingConfig signingConfigs.release',
      );
      contents = contents.slice(0, releaseBlockStart) + patched;
    }

    mod.modResults.contents = contents;
    return mod;
  });
};

module.exports = withAndroidReleaseKeystore;
