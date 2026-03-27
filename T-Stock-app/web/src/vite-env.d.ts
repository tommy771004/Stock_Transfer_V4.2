/// <reference types="vite/client" />

/**
 * React Native WebView bridge — injected by react-native-webview into the
 * global scope when the page runs inside an Expo/RN WebView shell.
 * Provides postMessage() so the web app can communicate with native code.
 */
interface Window {
  ReactNativeWebView?: {
    postMessage: (message: string) => void;
  };
}
