import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, SafeAreaView } from 'react-native';
import * as Updates from 'expo-updates';
import * as Clipboard from 'expo-clipboard';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  errorText: string;
  errorStack: string;
  checking: boolean;
}

export class GlobalErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorText: '', errorStack: '', checking: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorText: error.message || '未知错误', errorStack: error.stack || '' };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("GlobalErrorBoundary caught an error", error, errorInfo);
    this.setState({
      errorStack: (error.stack || '') + '\n\n' + (errorInfo.componentStack || '')
    });
  }

  handleCopyError = async () => {
    const errorDetails = `错误信息:\n${this.state.errorText}\n\n详细堆栈:\n${this.state.errorStack}`;
    await Clipboard.setStringAsync(errorDetails);
    Alert.alert("提示", "错误信息已复制到剪贴板");
  };

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
        <SafeAreaView style={styles.safeArea}>
          <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.title}>程序遇到致命错误</Text>
            
            <View style={styles.errorContainer}>
              <Text style={styles.errorTitle}>错误信息:</Text>
              <Text style={styles.errorText} selectable>
                {this.state.errorText}
              </Text>

              <Text style={styles.errorTitle}>详细堆栈 (供开发者排查):</Text>
              <Text style={styles.errorStack} selectable>
                {this.state.errorStack}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.button, this.state.checking && styles.buttonDisabled]}
              onPress={this.handleCheckUpdate}
              disabled={this.state.checking}
            >
              <Text style={styles.buttonText}>
                {this.state.checking ? "正在检查更新..." : "检查热更新并修复"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.secondaryButton]}
              onPress={this.handleCopyError}
            >
              <Text style={styles.secondaryButtonText}>
                一键复制错误信息
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F9FAFB', // StyleSeed background.base
  },
  container: {
    flexGrow: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 24,
    color: '#EF4444', // red
  },
  errorContainer: {
    width: '100%',
    backgroundColor: '#F3F4F6', // light gray
    padding: 16,
    borderRadius: 8,
    marginBottom: 32,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#1F2937', // darker gray
    marginBottom: 16,
    lineHeight: 20,
  },
  errorStack: {
    fontSize: 12,
    color: '#4B5563', // gray
    fontFamily: 'monospace',
  },
  button: {
    backgroundColor: '#3B82F6', // blue
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#D1D5DB', // gray-300
    marginTop: 16,
  },
  secondaryButtonText: {
    color: '#374151', // gray-700
    fontSize: 16,
    fontWeight: '600',
  }
});
