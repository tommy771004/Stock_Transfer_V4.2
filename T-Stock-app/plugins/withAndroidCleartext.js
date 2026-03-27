/**
 * plugins/withAndroidCleartext.js
 *
 * Expo Config Plugin: sets android:usesCleartextTraffic="true" on the
 * <application> tag in AndroidManifest.xml.
 *
 * Required for Android API 28+ when DEV_SERVER_URL points to an http://
 * dev server (Android 9+ blocks cleartext HTTP by default).
 *
 * This plugin ensures the setting survives `expo prebuild --clean`.
 */
const { withAndroidManifest } = require('@expo/config-plugins');

const withAndroidCleartext = (config) => {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults;
    const application = manifest.manifest.application?.[0];
    if (application) {
      application.$['android:usesCleartextTraffic'] = 'true';
    }
    return mod;
  });
};

module.exports = withAndroidCleartext;
