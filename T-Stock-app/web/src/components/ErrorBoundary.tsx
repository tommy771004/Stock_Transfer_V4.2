import React, { Component, ReactNode, ErrorInfo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { AlertTriangle, RefreshCw } from 'lucide-react-native';

interface Props { children: ReactNode; name?: string; }
interface State { error: Error | null; info: string; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.name ?? 'unknown'}]`, error, info);
    this.setState({ info: info.componentStack ?? '' });
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.iconWrapper}>
              <AlertTriangle size={18} color="#fb7185" />
            </View>
            <View>
              <Text style={styles.title}>
                {this.props.name ?? '元件'} 發生錯誤
              </Text>
              <Text style={styles.subtitle}>
                頁面已停止渲染以防止應用程式崩潰
              </Text>
            </View>
          </View>

          <View style={styles.codeBlock}>
            <ScrollView style={styles.scroll}>
              <Text style={styles.codeText}>
                {this.state.error.message}
              </Text>
            </ScrollView>
          </View>

          <TouchableOpacity
            onPress={() => this.setState({ error: null, info: '' })}
            style={styles.button}
          >
            <RefreshCw size={12} color="#a5b4fc" />
            <Text style={styles.buttonText}>重試</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    height: '100%',
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  card: {
    maxWidth: 512,
    width: '100%',
    backgroundColor: '#18181b',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(244, 63, 94, 0.2)',
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(244, 63, 94, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  subtitle: {
    fontSize: 12,
    color: '#71717a',
    marginTop: 2,
  },
  codeBlock: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    maxHeight: 128,
  },
  scroll: {
    flexGrow: 0,
  },
  codeText: {
    fontSize: 12,
    color: '#fda4af',
    fontFamily: 'System',
    lineHeight: 18,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
    alignSelf: 'flex-start',
  },
  buttonText: {
    color: '#a5b4fc',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 8,
  },
});
