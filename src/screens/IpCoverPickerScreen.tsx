import { StyleSheet, View, Text, Pressable } from 'react-native';
import { BlurView } from "expo-blur";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppScreen } from "../components/AppScreen";
import { PageStateBlock } from '../components/PageStateBlock';
import { PrimaryButton } from '../components/PrimaryButton';
import { ThumbnailTile } from '../components/ThumbnailTile';
import { imageRepository, ipRepository, runWithDatabaseSpace, type ImageListItem, type IpDetailRecord, type PixorySpace } from '../database';
import { componentTokens, rhythm, spacing } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useToast } from '../components/AppToast';

interface IpCoverPickerScreenProps {
  ipId: number;
  space?: PixorySpace;
  onBack: () => void;
  onChanged: () => void;
}

export function IpCoverPickerScreen({ ipId, space = 'normal', onBack, onChanged }: IpCoverPickerScreenProps) {
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  
  const { data, isLoading, errorMessage, reload } = useScreenLoad<{ ip: IpDetailRecord | null; images: ImageListItem[] }>(
    () =>
      runWithDatabaseSpace(space, async (db) => {
        const [ip, images] = await Promise.all([
          ipRepository.findDetailById(db, ipId),
          imageRepository.findByIpId(db, ipId),
        ]);
        return { ip, images };
      }),
    [ipId, space],
    {
      initialData: { ip: null, images: [] },
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取封面候选失败：${message}`;
      },
    }
  );

  const ip = data?.ip ?? null;
  const images = data?.images ?? [];

  function chooseCover(imageId: number) {
    void (async () => {
      try {
        await runWithDatabaseSpace(space, (db) => ipRepository.setCoverImage(db, ipId, imageId));
        showToast('已更新 IP 封面');
        onChanged();
        onBack();
      } catch (error) {
        showToast(error instanceof Error ? `设置封面失败：${error.message}` : '设置封面失败');
      }
    })();
  }

  function useDefaultCover() {
    void (async () => {
      try {
        await runWithDatabaseSpace(space, (db) => ipRepository.clearCoverImage(db, ipId));
        showToast('已恢复默认封面');
        onChanged();
        onBack();
      } catch (error) {
        showToast(error instanceof Error ? `恢复默认封面失败：${error.message}` : '恢复默认封面失败');
      }
    })();
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
            { paddingTop: insets.top + 56 + 16, paddingBottom: insets.bottom + 32 },
          ]}
        >
          <View style={styles.actionContainer}>
            <Pressable
              onPress={useDefaultCover}
              style={({ pressed }) => [
                styles.submitButton,
                pressed && styles.submitButtonPressed,
              ]}
            >
              <Text style={styles.submitButtonText}>使用系统默认封面</Text>
            </Pressable>
          </View>

          <PageStateBlock
            emptyDescription="导入图片后，可以从这里选择一张作为 IP 封面。"
            emptyIconName="images-outline"
            emptyTitle="还没有可选图片"
            errorMessage={errorMessage}
            isEmpty={!isLoading && images.length === 0}
            loading={isLoading}
            loadingDescription="正在读取当前 IP 的图片。"
            loadingTitle="正在读取封面候选"
            onRetry={reload}
          >
            <View style={styles.grid}>
              {images.map((image) => (
                <ThumbnailTile
                  aspectRatio={componentTokens.thumbnail.squareAspectRatio}
                  image={image}
                  key={image.id}
                  onPress={chooseCover}
                  selected={ip?.coverImageAssetId === image.id}
                  space={space}
                />
              ))}
            </View>
          </PageStateBlock>
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
                选择 IP 封面
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
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: rhythm.compactGridGap,
    paddingTop: spacing[3],
    marginTop: 16,
  },
  actionContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 24,
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
  submitButtonText: {
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
    letterSpacing: -0.075,
    color: "#ffffff",
  },
});






