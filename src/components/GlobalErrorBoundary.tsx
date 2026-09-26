import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import * as Updates from 'expo-updates';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  errorText: string;
  checking: boolean;
}

export class GlobalErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorText: '', checking: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorText: error.message || '未知错误' };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("GlobalErrorBoundary caught an error", error, errorInfo);
  }

  handleCheckUpdate = async () => {
    this.setState({ checking: true });
    try {
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        await Updates.fetchUpdateAsync();
        await Updates.reloadAsync();
      } else {
        Alert.alert("提示", "当前已经是最新版本，没有可用的修复更新。");
      }
    } catch (e: any) {
      Alert.alert("更新检查失败", e.message || String(e));
    } finally {
      this.setState({ checking: false });
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>程序遇到致命错误</Text>
          <Text style={styles.errorText} selectable>
            {this.state.errorText}
          </Text>
          <TouchableOpacity
            style={[styles.button, this.state.checking && styles.buttonDisabled]}
            onPress={this.handleCheckUpdate}
            disabled={this.state.checking}
          >
            <Text style={styles.buttonText}>
              {this.state.checking ? "正在检查更新..." : "检查热更新并修复"}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
    backgroundColor: '#F9FAFB', // StyleSeed background.base
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#EF4444', // red
  },
  errorText: {
    fontSize: 14,
    color: '#4B5563', // gray
    marginBottom: 32,
    textAlign: 'center',
    lineHeight: 20,
  },
  button: {
    backgroundColor: '#3B82F6', // blue
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  }
});
