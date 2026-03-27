import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Bell, Plus, X, AlertCircle } from 'lucide-react-native';
import * as api from '../services/api';
import { useSettings } from '../contexts/SettingsContext';
import { Alert } from '../types';

interface AlertsProps {
  symbol: string;
}

export const Alerts: React.FC<AlertsProps> = React.memo(({ symbol }) => {
  const { settings } = useSettings();
  const compact = settings.compactMode;
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [target, setTarget] = useState('');
  const [condition, setCondition] = useState<'above' | 'below'>('above');
  const [adding, setAdding] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getAlerts().then((data) => {
      if (Array.isArray(data)) setAlerts(data);
    }).catch(e => { console.warn('[Alerts] getAlerts:', e); });
  }, [symbol]);

  const addAlert = async () => {
    if (!target) return;
    const numTarget = Number(target);
    if (isNaN(numTarget) || numTarget <= 0) { setError('請輸入有效的正數價格'); return; }
    setError('');
    try {
      const newAlert = await api.addAlert({ symbol, condition, target: numTarget });
      setAlerts(prev => [...prev, newAlert]);
      setAdding(false);
      setTarget('');
    } catch (e: unknown) { 
      const msg = e instanceof Error ? e.message : '新增警示失敗';
      setError(msg); 
    }
  };

  const deleteAlert = async (id: number) => {
    try {
      await api.deleteAlert(id);
      setAlerts(prev => prev.filter(a => a.id !== id));
    } catch (e: unknown) { 
      const msg = e instanceof Error ? e.message : '刪除警示失敗';
      setError(msg); 
    }
    finally { setDeleteConfirmId(null); }
  };

  return (
    <View style={[styles.container, compact ? styles.p2 : styles.p3]}>
      <View style={[styles.header, compact ? styles.mb1 : styles.mb2]}>
        <View style={styles.titleRow}>
          <Bell size={compact ? 10 : 12} color="#71717a" />
          <Text style={[styles.titleText, compact ? styles.textXs : styles.textSm]}>
            警示設定
          </Text>
        </View>
        <TouchableOpacity onPress={() => setAdding(!adding)}>
          {adding ? <X size={compact ? 12 : 14} color="#34d399" /> : <Plus size={compact ? 12 : 14} color="#34d399" />}
        </TouchableOpacity>
      </View>

      {!!error && (
        <View style={[styles.errorBox, compact ? styles.p1_5 : styles.p2, compact ? styles.mb1 : styles.mb2]}>
          <AlertCircle size={compact ? 10 : 12} color="#fb7185" />
          <Text style={[styles.errorText, compact ? styles.textXs : styles.textSm]}>{error}</Text>
          <TouchableOpacity onPress={() => setError('')} style={styles.mlAuto}>
            <X size={compact ? 10 : 12} color="#fb7185" />
          </TouchableOpacity>
        </View>
      )}

      {adding && (
        <View style={[styles.addForm, compact ? styles.mb2 : styles.mb3]}>
          <View style={styles.inputRow}>
            <TouchableOpacity 
              style={[styles.inputBase, styles.conditionBtn]} 
              onPress={() => setCondition(prev => prev === 'above' ? 'below' : 'above')}
            >
              <Text style={[styles.inputText, compact ? styles.textXs : styles.textSm]}>
                {condition === 'above' ? '高於' : '低於'}
              </Text>
            </TouchableOpacity>
            <TextInput
              value={target}
              onChangeText={setTarget}
              keyboardType="numeric"
              placeholder="價格"
              placeholderTextColor="#71717a"
              style={[styles.inputBase, styles.flex1, styles.inputText, compact ? styles.textXs : styles.textSm]}
            />
          </View>
          <TouchableOpacity style={[styles.submitBtn, compact ? styles.py1_5 : styles.py2]} onPress={addAlert}>
            <Text style={[styles.submitText, compact ? styles.textXs : styles.textSm]}>新增警示</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={compact ? styles.spaceY1 : styles.spaceY2}>
        {alerts.filter(a => a.symbol === symbol).map(a => (
          <View key={a.id} style={[styles.alertItem, compact ? styles.p2 : styles.p3]}>
            <Text style={[styles.alertText, compact ? styles.textXs : styles.textSm]}>
              {a.condition === 'above' ? '↑' : '↓'} {a.target}
            </Text>
            {deleteConfirmId === a.id ? (
              <View style={styles.actionRow}>
                <TouchableOpacity onPress={() => deleteAlert(a.id)}>
                  <AlertCircle size={compact ? 12 : 14} color="#fb7185" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setDeleteConfirmId(null)}>
                  <X size={compact ? 12 : 14} color="#71717a" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => setDeleteConfirmId(a.id)}>
                <X size={compact ? 12 : 14} color="#71717a" />
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1c1c1e',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2c2c2e',
    flexShrink: 0,
  },
  p2: { padding: 8 },
  p3: { padding: 12 },
  mb1: { marginBottom: 4 },
  mb2: { marginBottom: 8 },
  mb3: { marginBottom: 12 },
  p1_5: { padding: 6 },
  py1_5: { paddingVertical: 6 },
  py2: { paddingVertical: 8 },
  textXs: { fontSize: 12 },
  textSm: { fontSize: 14 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  titleText: {
    fontWeight: 'bold',
    color: '#71717a',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(244, 63, 94, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(244, 63, 94, 0.2)',
    borderRadius: 8,
  },
  errorText: {
    color: '#fb7185',
  },
  mlAuto: {
    marginLeft: 'auto',
  },
  addForm: {
    gap: 8,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  inputBase: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  conditionBtn: {
    justifyContent: 'center',
  },
  flex1: {
    flex: 1,
  },
  inputText: {
    color: '#ffffff',
  },
  submitBtn: {
    width: '100%',
    borderRadius: 8,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: {
    color: '#000000',
    fontWeight: 'bold',
  },
  spaceY1: {
    gap: 4,
  },
  spaceY2: {
    gap: 8,
  },
  alertItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 8,
    backgroundColor: '#1c1c1e',
  },
  alertText: {
    color: '#ffffff',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
