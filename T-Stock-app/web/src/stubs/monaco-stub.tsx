/**
 * stubs/monaco-stub.tsx
 *
 * Lightweight textarea replacement for @monaco-editor/react used in
 * the mobile WebView build (vite.config.mobile.ts).
 *
 * Monaco editor (~5–8 MB bundled) is replaced by a plain <textarea> so
 * that the single-file index.html stays small enough to ship inside an
 * IPA / APK without hitting Expo asset limits or causing OOM on device.
 *
 * The stub matches the minimal API surface that StrategyLab.tsx uses:
 *   value, defaultValue, onChange, language, theme, height, options
 */
import React from 'react';

interface EditorProps {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string | undefined) => void;
  language?: string;
  theme?: string;
  height?: string | number;
  options?: Record<string, unknown>;
  [key: string]: unknown;
}

export default function MonacoEditorStub({ value, defaultValue, onChange, height }: EditorProps) {
  return (
    <textarea
      value={value ?? defaultValue ?? ''}
      onChange={e => onChange?.(e.target.value)}
      style={{
        width: '100%',
        height: typeof height === 'number' ? `${height}px` : (height ?? '300px'),
        background: '#1e1e1e',
        color: '#d4d4d4',
        fontFamily: 'monospace',
        fontSize: '13px',
        border: '1px solid #3c3c3c',
        padding: '8px',
        resize: 'vertical',
        boxSizing: 'border-box',
      }}
    />
  );
}
