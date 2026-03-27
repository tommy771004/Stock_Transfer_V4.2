import React, { useState } from 'react';
import Decimal from 'decimal.js';
import { AlertTriangle, Send, ShieldCheck, CheckCircle, XCircle, Loader2 } from 'lucide-react-native';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, SafeAreaView, ScrollView } from 'react-native';

export default function LiveTradingConsole() {
  const settings = { compactMode: false };
  const compact = settings.compactMode;
  const [symbol, setSymbol] = useState('2330.TW');
  const [qty, setQty] = useState(1000);
  const [price, setPrice] = useState(680);
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [status, setStatus] = useState<'idle' | 'executing' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [validationErr, setValidationErr] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  // Rest of the logic remains the same...

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container}>
        <View style={styles.content}>
          <View style={styles.header}>
            <ShieldCheck color="#f43f5e" size={compact ? 16 : 20} />
            <Text style={styles.title}>實盤交易控制台</Text>
            <View style={styles.liveBadge}>
              <Text style={styles.liveBadgeText}>LIVE</Text>
            </View>
          </View>

          <View style={styles.warningBox}>
            <AlertTriangle color="#f43f5e" size={compact ? 14 : 16} />
            <Text style={styles.warningText}>
              <Text style={styles.bold}>風險提示：</Text> 
              此操作將使用真實資金。請確保策略已在模擬環境充分測試。
            </Text>
          </View>

          <View style={styles.sideSelector}>
            {(['BUY', 'SELL'] as const).map(s => (
              <TouchableOpacity
                key={s}
                onPress={() => setSide(s)}
                style={[
                  styles.sideButton,
                  side === s && (s === 'BUY' ? styles.buyActive : styles.sellActive)
                ]}
              >
                <Text style={[
                  styles.sideButtonText,
                  side === s && styles.sideButtonActiveText
                ]}>
                  {s === 'BUY' ? '買入' : '賣出'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.inputContainer}>
              <Text style={styles.label}>標的代碼</Text>
              <TextInput
                value={symbol}
                onChangeText={text => {
                  setSymbol(text.toUpperCase());
                  setValidationErr('');
                }}
                style={styles.input}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>數量 (股)</Text>
              <TextInput
                value={String(qty)}
                onChangeText={text => {
                  setQty(Number(text));
                  setValidationErr('');
                }}
                keyboardType="numeric"
                style={styles.input}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>價格</Text>
              <TextInput
                value={String(price)}
                onChangeText={text => {
                  setPrice(Number(text));
                  setValidationErr('');
                }}
                keyboardType="decimal-pad"
                style={styles.input}
              />
            </View>
          </View>

          <View style={styles.preview}>
            <Text style={styles.previewLabel}>預估金額</Text>
            <Text style={[
              styles.previewValue,
              side === 'BUY' ? styles.buyText : styles.sellText
            ]}>
              {side === 'BUY' ? '買' : '賣'} {symbol} × {qty.toLocaleString()} = ${totalCost.toLocaleString()}
            </Text>
          </View>

          {validationErr ? (
            <View style={styles.validationError}>
              <AlertTriangle size={12} color="#fbbf24" />
              <Text style={styles.validationErrorText}>{validationErr}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={status === 'executing'}
            style={[
              styles.submitButton,
              side === 'BUY' ? styles.buyButton : styles.sellButton,
              status === 'executing' && styles.submitButtonDisabled
            ]}
          >
            {status === 'executing' ? (
              <Loader2 size={16} color="#fff" />
            ) : (
              <Send size={compact ? 14 : 16} color="#fff" />
            )}
            <Text style={styles.submitButtonText}>
              {status === 'executing' ? '執行中...' : side === 'BUY' ? '執行買入' : '執行賣出'}
            </Text>
          </TouchableOpacity>

          <Modal
            visible={showConfirm}
            transparent={true}
            animationType="fade"
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                {/* Modal content implementation */}
              </View>
            </View>
          </Modal>

          {status === 'error' && (
            <View style={styles.errorMessage}>
              <XCircle size={14} color="#ef4444" />
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          )}

          {status === 'success' && (
            <View style={styles.successMessage}>
              <CheckCircle size={14} color="#10b981" />
              <Text style={styles.successText}>交易執行成功！</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000'
  },
  container: {
    flex: 1
  },
  content: {
    padding: 16,
    gap: 16
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  title: {
    color: '#fff',
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1
  },
  liveBadge: {
    backgroundColor: 'rgba(244,63,94,0.1)',
    borderColor: 'rgba(244,63,94,0.2)',
    borderWidth: 1,
    borderRadius: 8,
    padding: 4,
    marginLeft: 'auto'
  },
  liveBadgeText: {
    color: '#f43f5e',
    fontSize: 10,
    fontWeight: '900'
  },
  warningBox: {
    backgroundColor: 'rgba(244,63,94,0.1)',
    borderColor: 'rgba(244,63,94,0.2)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start'
  },
  warningText: {
    color: '#fda4af',
    fontSize: 12,
    flex: 1
  },
  bold: {
    fontWeight: '700'
  },
  sideSelector: {
    flexDirection: 'row',
    gap: 8
  },
  sideButton: {
    flex: 1,
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#27272a'
  },
  buyActive: {
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderColor: 'rgba(16,185,129,0.2)'
  },
  sellActive: {
    backgroundColor: 'rgba(244,63,94,0.1)',
    borderColor: 'rgba(244,63,94,0.2)'
  },
  sideButtonText: {
    color: '#71717a',
    textAlign: 'center',
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1
  },
  sideButtonActiveText: {
    color: '#fff'
  },
  inputGroup: {
    gap: 12
  },
  inputContainer: {
    gap: 6
  },
  label: {
    color: '#71717a',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1
  },
  input: {
    backgroundColor: '#18181b',
    borderColor: '#27272a',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    color: '#fff',
    fontWeight: '700'
  },
  preview: {
    backgroundColor: '#18181b',
    borderColor: '#27272a',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  previewLabel: {
    color: '#71717a',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1
  },
  previewValue: {
    fontSize: 14,
    fontWeight: '900',
    fontFamily: 'monospace'
  },
  buyText: {
    color: '#34d399'
  },
  sellText: {
    color: '#f43f5e'
  },
  validationError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(251,191,36,0.1)',
    borderColor: 'rgba(251,191,36,0.2)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12
  },
  validationErrorText: {
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: '700'
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1
  },
  buyButton: {
    backgroundColor: '#059669',
    borderColor: 'rgba(16,185,129,0.3)'
  },
  sellButton: {
    backgroundColor: '#dc2626',
    borderColor: 'rgba(244,63,94,0.3)'
  },
  submitButtonDisabled: {
    opacity: 0.5
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16
  },
  modalContent: {
    backgroundColor: '#18181b',
    borderRadius: 16,
    padding: 16,
    width: '100%',
    maxWidth: 400
  },
  errorMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderColor: 'rgba(239,68,68,0.2)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '700'
  },
  successMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(16,185,129,0.1)', 
    borderColor: 'rgba(16,185,129,0.2)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12
  },
  successText: {
    color: '#10b981',
    fontSize: 12,
    fontWeight: '700'
  }
});
