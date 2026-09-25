import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppScreen } from "../components/AppScreen";
import {
  DESCRIPTION_MAX_LENGTH,
  IP_NAME_MAX_LENGTH,
} from "../constants/limits";
import {
  ipRepository,
  runWithDatabaseSpace,
  type IpRecord,
  type PixorySpace,
} from "../database";
import { useScreenLoad } from "../hooks/useScreenLoad";
import { useSubmitState } from "../hooks/useSubmitState";

interface EditIpScreenProps {
  ipId: number;
  space?: PixorySpace;
  onBack: () => void;
  onSaved: () => void;
  onSelectCover?: () => void;
}

export function EditIpScreen({
  ipId,
  space = "normal",
  onBack,
  onSaved,
  onSelectCover,
}: EditIpScreenProps) {
  const { data: ip, isLoading, errorMessage, reload } = useScreenLoad<IpRecord>(
    async () => {
      const record = await runWithDatabaseSpace(space, (db) => ipRepository.findById(db, ipId));
      if (!record) {
        throw new Error('没有找到这个 IP。');
      }

      return record;
    },
    ['EditIpScreen', ipId, space],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return message === '没有找到这个 IP。' ? message : `读取 IP 失败：${message}`;
      },
    }
  );
  
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isFavorite, setIsFavorite] = useState(false);
  const { isSubmitting, submitError, clearSubmitError, runSubmit } =
    useSubmitState();
  const insets = useSafeAreaInsets();

  const trimmedName = useMemo(() => name.trim(), [name]);

  useEffect(() => {
    if (ip) {
      setName(ip.name);
      setDescription(ip.description ?? '');
      setIsFavorite(ip.isFavorite);
    }
  }, [ip]);

  function handleSave() {
    void runSubmit(
      async () => {
        const updated = await runWithDatabaseSpace(space, (db) => ipRepository.update(db, ipId, {
          name: trimmedName,
          description,
          isFavorite,
        }));

        if (!updated) {
          throw new Error('保存失败，当前 IP 不存在。');
        }

        onSaved();
      },
      {
        formatError: (error) => {
          const message = error instanceof Error ? error.message : "未知错误";
          return message === '保存失败，当前 IP 不存在。' ? message : `保存失败：${message}`;
        },
        validate: () => (!trimmedName ? "请输入 IP 名称。" : null),
      },
    );
  }

  return (
    <View style={styles.screenWrapper}>
      <AppScreen
        scrollable
        backgroundColor="#ffffff"
        contentStyle={styles.appScreenContent}
      >
        <View
          style={[
            styles.main,
            { paddingTop: insets.top + 56, paddingBottom: insets.bottom + 32 },
          ]}
        >
          {isLoading && !ip ? (
            <Text style={styles.hint}>正在读取当前 IP 数据…</Text>
          ) : null}

          {errorMessage && !ip ? (
            <View>
              <Text style={styles.errorText}>{errorMessage}</Text>
              <Text style={styles.reloadLink} onPress={reload}>
                重新加载
              </Text>
            </View>
          ) : null}

          {submitError ? (
            <Text style={styles.errorText}>{submitError}</Text>
          ) : null}

          {ip ? (
            <View style={styles.formStack}>
              {/* Field 1: 名称 */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>名称</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    autoCapitalize="none"
                    editable={!isSubmitting}
                    enablesReturnKeyAutomatically
                    maxLength={IP_NAME_MAX_LENGTH}
                    onChangeText={(value) => {
                      setName(value);
                      if (submitError) clearSubmitError();
                    }}
                    onSubmitEditing={handleSave}
                    placeholder="例如：小夏、海边系列、品牌KV"
                    placeholderTextColor="#747878"
                    returnKeyType="done"
                    style={styles.input}
                    value={name}
                  />
                </View>
              </View>

              {/* Field 2: 简介 */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>简介</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    editable={!isSubmitting}
                    maxLength={DESCRIPTION_MAX_LENGTH}
                    multiline
                    onChangeText={(value) => {
                      setDescription(value);
                      if (submitError) clearSubmitError();
                    }}
                    placeholder="一句话说明角色、主题或用途"
                    placeholderTextColor="#747878"
                    style={[styles.input, styles.textarea]}
                    textAlignVertical="top"
                    value={description}
                  />
                </View>
              </View>

              {/* Field 3: 加入收藏 */}
              <View style={styles.switchWrapper}>
                <Text style={styles.switchLabel}>加入收藏</Text>
                <Switch
                  disabled={isSubmitting}
                  onValueChange={setIsFavorite}
                  thumbColor="#ffffff"
                  trackColor={{ false: "#e2e2e2", true: "#000000" }}
                  value={isFavorite}
                  ios_backgroundColor="#e2e2e2"
                  style={
                    Platform.OS === "ios"
                      ? { transform: [{ scale: 0.85 }] }
                      : undefined
                  }
                />
              </View>

              {/* Field 4: 设置封面 */}
              {onSelectCover ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.switchWrapper,
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={onSelectCover}
                  disabled={isSubmitting}
                >
                  <Text style={styles.switchLabel}>选择 IP 封面</Text>
                  <MaterialIcons name="chevron-right" size={20} color="#a0a0a0" />
                </Pressable>
              ) : null}

              {/* Action Button */}
              <View style={styles.actionContainer}>
                <Pressable
                  disabled={!trimmedName || isSubmitting}
                  onPress={handleSave}
                  style={({ pressed }) => [
                    styles.submitButton,
                    pressed && styles.submitButtonPressed,
                    (!trimmedName || isSubmitting) && styles.submitButtonDisabled,
                  ]}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.submitButtonText}>保存修改</Text>
                  )}
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      </AppScreen>

      <View style={styles.headerContainer}>
        <View style={[styles.headerSolid, { paddingTop: insets.top }]}>
          <View style={styles.headerContent}>
            <Pressable
              onPress={onBack}
              style={({ pressed }) => [
                styles.backButton,
                pressed && { opacity: 0.6 },
              ]}
              hitSlop={8}
            >
              <MaterialIcons name="close" size={20} color="#1a1c1c" />
            </Pressable>
            <View style={styles.headerTitleWrap}>
              <Text numberOfLines={1} style={styles.headerTitle}>
                编辑IP
              </Text>
            </View>
            <View style={{ width: 44 }} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  appScreenContent: {
    paddingHorizontal: 0,
    gap: 0,
    paddingBottom: 0,
  },
  headerContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
  },
  headerSolid: {
    backgroundColor: "#ffffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  headerContent: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    minWidth: 44,
    minHeight: 44,
    marginLeft: -4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  headerTitleWrap: {
    flex: 1,
    paddingHorizontal: 4,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
    letterSpacing: -0.075,
    color: "#1a1c1c",
  },
  main: {
    flex: 1,
    paddingHorizontal: 16,
  },
  hint: {
    fontSize: 14,
    color: "#747878",
    textAlign: "center",
    marginTop: 24,
  },
  reloadLink: {
    fontSize: 13,
    color: "#000000",
    textAlign: "center",
    marginTop: 8,
    textDecorationLine: "underline",
  },
  errorText: {
    fontSize: 12,
    color: "#ba1a1a",
    marginBottom: 8,
    textAlign: "center",
  },
  formStack: {
    flexDirection: "column",
    gap: 20,
    marginTop: 8,
  },
  fieldGroup: {
    flexDirection: "column",
    gap: 4,
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
    letterSpacing: -0.075,
    color: "#1a1c1c",
  },
  inputWrapper: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  input: {
    minHeight: 48,
    paddingHorizontal: 12,
    color: "#1a1c1c",
    fontSize: 13,
    fontWeight: "400",
    lineHeight: 18,
    letterSpacing: 0.065,
  },
  textarea: {
    minHeight: 104,
    paddingTop: 12,
    paddingBottom: 12,
  },
  switchWrapper: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  switchLabel: {
    fontSize: 15,
    fontWeight: "400",
    lineHeight: 22,
    letterSpacing: 0,
    color: "#1a1c1c",
  },
  actionContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 112,
    width: "100%",
  },
  submitButton: {
    width: 192,
    height: 48,
    backgroundColor: "#000000",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  submitButtonPressed: {
    transform: [{ scale: 0.95 }],
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
    letterSpacing: -0.075,
    color: "#ffffff",
  },
});



