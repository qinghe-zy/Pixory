import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, BackHandler, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppScreen } from './src/components/AppScreen';
import { AppToastProvider } from './src/components/AppToast';
import { BackupScreen } from './src/screens/BackupScreen';
import { BottomTabBar, type RootTabKey } from './src/components/BottomTabBar';
import { PrimaryButton } from './src/components/PrimaryButton';
import { colors, spacing, typography } from './src/design/tokens';
import { initDatabase, type IpLibraryFilter, type PixorySpace } from './src/database';
import { AllImagesScreen } from './src/screens/AllImagesScreen';
import { BatchManageImagesScreen } from './src/screens/BatchManageImagesScreen';
import { CreateGroupScreen } from './src/screens/CreateGroupScreen';
import { CreateIpScreen } from './src/screens/CreateIpScreen';
import { EditGroupScreen } from './src/screens/EditGroupScreen';
import { EditIpScreen } from './src/screens/EditIpScreen';
import { EditImageScreen } from './src/screens/EditImageScreen';
import { FavoritesScreen } from './src/screens/FavoritesScreen';
import { GlobalGroupsScreen } from './src/screens/GlobalGroupsScreen';
import { GlobalSearchScreen } from './src/screens/GlobalSearchScreen';
import { GroupImagesScreen } from './src/screens/GroupImagesScreen';
import { GroupOverviewScreen } from './src/screens/GroupOverviewScreen';
import { HomeLibraryScreen } from './src/screens/HomeLibraryScreen';
import { ImageDetailScreen } from './src/screens/ImageDetailScreen';
import { ImageViewerScreen } from './src/screens/ImageViewerScreen';
import { ImportDevelopmentScreen } from './src/screens/ImportDevelopmentScreen';
import { DuplicateReviewScreen } from './src/screens/DuplicateReviewScreen';
import { ImportBatchHistoryScreen } from './src/screens/ImportBatchHistoryScreen';
import { ImportBatchReviewScreen, type BatchInitialMode } from './src/screens/ImportBatchReviewScreen';
import { ImportImagesScreen } from './src/screens/ImportImagesScreen';
import { IpDetailScreen } from './src/screens/IpDetailScreen';
import { MeScreen } from './src/screens/MeScreen';
import { MoveImageGroupScreen } from './src/screens/MoveImageGroupScreen';
import { PlaceholderScreen } from './src/screens/PlaceholderScreen';
import { PersonalSystemScreen } from './src/screens/PersonalSystemScreen';
import { QuickOrganizeScreen } from './src/screens/QuickOrganizeScreen';
import { RecentViewedScreen } from './src/screens/RecentViewedScreen';
import { TagResultScreen } from './src/screens/TagResultScreen';
import { TagsOverviewScreen } from './src/screens/TagsOverviewScreen';
import { TrashScreen } from './src/screens/TrashScreen';
import type { ImageViewerContext } from './src/navigation/imageViewerContext';
import { ensureAppDirectories } from './src/services/fileStorageService';
import { isDevToolsEnabled } from './src/utils/dev';

type AppRoute =
  | { name: 'root'; tab: RootTabKey; initialFilter?: IpLibraryFilter }
  | { name: 'create-ip'; space: PixorySpace }
  | { name: 'ip-detail'; ipId: number; space: PixorySpace }
  | { name: 'edit-ip'; ipId: number; space: PixorySpace }
  | { name: 'edit-group'; ipId: number; groupId: number; space: PixorySpace }
  | { name: 'edit-image'; imageId: number; space: PixorySpace }
  | { name: 'group-overview'; ipId: number; space: PixorySpace }
  | { name: 'create-group'; ipId: number; space: PixorySpace }
  | { name: 'group-images'; ipId: number; groupId: number; space: PixorySpace }
  | {
      name: 'batch-manage-images';
      ipId: number;
      space: PixorySpace;
      source: 'ip-detail' | 'all-images' | 'group-images';
      groupId?: number | null;
      importBatchId?: number | null;
      scopeImageIds?: number[];
      initialSelectedImageIds?: number[];
      initialMode?: BatchInitialMode;
    }
  | { name: 'import-images'; ipId: number; groupId?: number | null; space: PixorySpace }
  | { name: 'import-result'; ipId: number; imageIds: number[]; importBatchId: number | null; space: PixorySpace }
  | { name: 'import-batch-history'; ipId: number; space: PixorySpace }
  | { name: 'duplicate-review'; ipId: number; importBatchId: number; space: PixorySpace }
  | { name: 'all-images'; ipId: number; space: PixorySpace }
  | { name: 'image-viewer'; imageId: number; space: PixorySpace; context: ImageViewerContext }
  | { name: 'image-detail'; imageId: number; space: PixorySpace; context?: ImageViewerContext }
  | { name: 'move-image-group'; imageId: number; space: PixorySpace }
  | { name: 'tag-result'; tagId: number; space: PixorySpace }
  | { name: 'favorites'; space: PixorySpace }
  | { name: 'recent-viewed'; space: PixorySpace }
  | { name: 'quick-organize'; ipId?: number; importBatchId?: number | null; space: PixorySpace }
  | { name: 'global-search'; query?: string; space: PixorySpace }
  | { name: 'trash'; space: PixorySpace }
  | { name: 'backup'; space: PixorySpace }
  | { name: 'personal-system' }
  | { name: 'placeholder'; title: string; description: string }
  | { name: 'import-development' };

const INITIAL_ROUTE: AppRoute = { name: 'root', tab: 'home' };

export default function App() {
  const [status, setStatus] = useState('正在初始化 Pixory 本地数据库与文件目录...');
  const [isReady, setIsReady] = useState(false);
  const [routeStack, setRouteStack] = useState<AppRoute[]>([INITIAL_ROUTE]);
  const [libraryRefreshToken, setLibraryRefreshToken] = useState(0);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [initializationKey, setInitializationKey] = useState(0);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');

  const currentRoute = routeStack[routeStack.length - 1] ?? INITIAL_ROUTE;

  useEffect(() => {
    let isMounted = true;

    async function initialize() {
      setInitializationError(null);
      setIsReady(false);
      setStatus('正在初始化 Pixory 本地数据库与文件目录...');

      try {
        await ensureAppDirectories();
        await initDatabase();

        if (isMounted) {
          setIsReady(true);
          setStatus('Pixory 本地数据环境已就绪。');
        }
      } catch (error) {
        if (isMounted) {
          setIsReady(false);
          const message = error instanceof Error ? error.message : '未知错误';
          setInitializationError(message);
          setStatus(`Pixory 初始化失败：${message}`);
        }
      }
    }

    initialize();

    return () => {
      isMounted = false;
    };
  }, [initializationKey]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        setRouteStack((current) => {
          const route = current[current.length - 1];
          if (route?.name === 'personal-system' || (route?.name === 'import-images' && route.space === 'personal')) {
            return [INITIAL_ROUTE];
          }
          return current;
        });
      }
    });

    return () => subscription.remove();
  }, []);

  function pushRoute(route: AppRoute) {
    setRouteStack((current) => [...current, route]);
  }

  function popRoute() {
    setRouteStack((current) => (current.length > 1 ? current.slice(0, -1) : current));
  }

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return undefined;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      let handled = false;

      setRouteStack((current) => {
        if (current.length > 1) {
          handled = true;
          return current.slice(0, -1);
        }

        const [rootRoute] = current;
        if (rootRoute?.name === 'root' && rootRoute.tab !== 'home') {
          handled = true;
          return [INITIAL_ROUTE];
        }

        return current;
      });

      return handled;
    });

    return () => subscription.remove();
  }, []);

  function popAndRefresh() {
    setLibraryRefreshToken((current) => current + 1);
    popRoute();
  }

  function refreshLibrary() {
    setLibraryRefreshToken((current) => current + 1);
  }

  function resetHome(filter: IpLibraryFilter = 'all') {
    setRouteStack([{ name: 'root', tab: 'home', initialFilter: filter }]);
  }

  function switchRootTab(tab: RootTabKey) {
    setRouteStack([{ name: 'root', tab }]);
  }

  function openImageViewer(imageId: number, context: ImageViewerContext) {
    pushRoute({ name: 'image-viewer', imageId, space: context.space, context });
  }

  function openImageDetail(imageId: number, context?: ImageViewerContext) {
    pushRoute({ name: 'image-detail', imageId, space: context?.space ?? 'normal', context });
  }

  function replaceCurrentRoute(route: AppRoute) {
    setRouteStack((current) => [...current.slice(0, -1), route]);
  }

  if (!isReady) {
    return (
      <SafeAreaProvider>
        <AppScreen contentStyle={styles.stateScreen}>
          <View style={styles.stateCard}>
            <Text style={styles.title}>Pixory</Text>
            <Text style={styles.message}>{status}</Text>
            {initializationError ? (
              <PrimaryButton label="重新初始化" onPress={() => setInitializationKey((current) => current + 1)} variant="outline" />
            ) : null}
          </View>
          <StatusBar style="dark" />
        </AppScreen>
      </SafeAreaProvider>
    );
  }

  const rootFooter =
    currentRoute.name === 'root' ? (
      <BottomTabBar activeTab={currentRoute.tab} onSelectTab={switchRootTab} />
    ) : undefined;

  let content;

  if (currentRoute.name === 'create-ip') {
    content = (
      <CreateIpScreen
        onCancel={() => resetHome()}
        onCreated={() => {
          setLibraryRefreshToken((current) => current + 1);
          resetHome('recent');
        }}
      />
    );
  } else if (currentRoute.name === 'ip-detail') {
    content = (
      <IpDetailScreen
        ipId={currentRoute.ipId}
        space={currentRoute.space}
        onBack={popRoute}
        onCreateGroup={() => pushRoute({ name: 'create-group', ipId: currentRoute.ipId, space: currentRoute.space })}
        onEdit={() => pushRoute({ name: 'edit-ip', ipId: currentRoute.ipId, space: currentRoute.space })}
        onEditGroup={(groupId) => pushRoute({ name: 'edit-group', ipId: currentRoute.ipId, groupId, space: currentRoute.space })}
        onImportImages={() => pushRoute({ name: 'import-images', ipId: currentRoute.ipId, space: currentRoute.space })}
        onOpenAllImages={() => pushRoute({ name: 'all-images', ipId: currentRoute.ipId, space: currentRoute.space })}
        onOpenBatchManagement={(imageId) =>
          pushRoute({
            name: 'batch-manage-images',
            ipId: currentRoute.ipId,
            space: currentRoute.space,
            source: 'ip-detail',
            initialSelectedImageIds: imageId ? [imageId] : undefined,
          })
        }
        onOpenImportBatches={() => pushRoute({ name: 'import-batch-history', ipId: currentRoute.ipId, space: currentRoute.space })}
        onOpenNeedsOrganizing={() => pushRoute({ name: 'quick-organize', ipId: currentRoute.ipId, space: currentRoute.space })}
        onOpenGroups={() => pushRoute({ name: 'group-overview', ipId: currentRoute.ipId, space: currentRoute.space })}
        onOpenGroup={(groupId) => pushRoute({ name: 'group-images', ipId: currentRoute.ipId, groupId, space: currentRoute.space })}
        onOpenImage={openImageViewer}
        onOpenImageDetail={openImageDetail}
        refreshToken={libraryRefreshToken}
      />
    );
  } else if (currentRoute.name === 'edit-ip') {
    content = <EditIpScreen ipId={currentRoute.ipId} space={currentRoute.space} onBack={popRoute} onSaved={popAndRefresh} />;
  } else if (currentRoute.name === 'edit-group') {
    content = (
      <EditGroupScreen
        groupId={currentRoute.groupId}
        ipId={currentRoute.ipId}
        space={currentRoute.space}
        onBack={popRoute}
        onDeleted={popAndRefresh}
        onSaved={popAndRefresh}
      />
    );
  } else if (currentRoute.name === 'edit-image') {
    content = (
      <EditImageScreen
        imageId={currentRoute.imageId}
        space={currentRoute.space}
        onBack={popRoute}
        onSaved={popAndRefresh}
        refreshToken={libraryRefreshToken}
      />
    );
  } else if (currentRoute.name === 'group-overview') {
    content = (
      <GroupOverviewScreen
        ipId={currentRoute.ipId}
        space={currentRoute.space}
        onBack={popRoute}
        onCreateGroup={() => pushRoute({ name: 'create-group', ipId: currentRoute.ipId, space: currentRoute.space })}
        onEditGroup={(groupId) => pushRoute({ name: 'edit-group', ipId: currentRoute.ipId, groupId, space: currentRoute.space })}
        onOpenGroup={(groupId) => pushRoute({ name: 'group-images', ipId: currentRoute.ipId, groupId, space: currentRoute.space })}
        refreshToken={libraryRefreshToken}
      />
    );
  } else if (currentRoute.name === 'create-group') {
    content = <CreateGroupScreen ipId={currentRoute.ipId} space={currentRoute.space} onBack={popRoute} onCreated={popAndRefresh} />;
  } else if (currentRoute.name === 'group-images') {
    content = (
      <GroupImagesScreen
        groupId={currentRoute.groupId}
        ipId={currentRoute.ipId}
        space={currentRoute.space}
        onBack={popRoute}
        onImportImages={() =>
          pushRoute({
            name: 'import-images',
            ipId: currentRoute.ipId,
            groupId: currentRoute.groupId,
            space: currentRoute.space,
          })
        }
        onStartBatchManagement={(imageId) =>
          pushRoute({
            name: 'batch-manage-images',
            ipId: currentRoute.ipId,
            space: currentRoute.space,
            source: 'group-images',
            groupId: currentRoute.groupId,
            initialSelectedImageIds: [imageId],
          })
        }
        onOpenImage={openImageViewer}
        onOpenImageDetail={openImageDetail}
        refreshToken={libraryRefreshToken}
      />
    );
  } else if (currentRoute.name === 'batch-manage-images') {
    content = (
      <BatchManageImagesScreen
        groupId={currentRoute.groupId ?? null}
        space={currentRoute.space}
        initialSelectedImageIds={currentRoute.initialSelectedImageIds}
        importBatchId={currentRoute.importBatchId ?? null}
        initialMode={currentRoute.initialMode}
        ipId={currentRoute.ipId}
        onBack={popRoute}
        onChanged={refreshLibrary}
        onDeleted={popAndRefresh}
        onImportImages={() =>
          pushRoute({
            name: 'import-images',
            ipId: currentRoute.ipId,
            groupId: currentRoute.groupId ?? null,
            space: currentRoute.space,
          })
        }
        onOpenImage={openImageViewer}
        refreshToken={libraryRefreshToken}
        scopeImageIds={currentRoute.scopeImageIds}
        source={currentRoute.source}
      />
    );
  } else if (currentRoute.name === 'import-images') {
    content = (
      <ImportImagesScreen
        defaultGroupId={currentRoute.groupId ?? null}
        ipId={currentRoute.ipId}
        space={currentRoute.space}
        onBack={popRoute}
        onImported={(imageIds, importBatchId) => {
          refreshLibrary();
          if (currentRoute.space === 'personal') {
            setRouteStack([{ name: 'personal-system' }]);
            return;
          }
          replaceCurrentRoute({ name: 'import-result', ipId: currentRoute.ipId, imageIds, importBatchId, space: currentRoute.space });
        }}
      />
    );
  } else if (currentRoute.name === 'import-result') {
    content = (
      <ImportBatchReviewScreen
        imageIds={currentRoute.imageIds}
        importBatchId={currentRoute.importBatchId}
        ipId={currentRoute.ipId}
        space={currentRoute.space}
        onBack={popRoute}
        onBatchOrganize={(imageIds, initialMode) =>
          pushRoute({
            name: 'batch-manage-images',
            ipId: currentRoute.ipId,
            space: currentRoute.space,
            source: 'all-images',
            importBatchId: currentRoute.importBatchId,
            scopeImageIds: imageIds,
            initialSelectedImageIds: imageIds,
            initialMode,
          })
        }
        onOpenDuplicateReview={(importBatchId) =>
          pushRoute({ name: 'duplicate-review', ipId: currentRoute.ipId, importBatchId, space: currentRoute.space })
        }
        onImportAgain={() => replaceCurrentRoute({ name: 'import-images', ipId: currentRoute.ipId, space: currentRoute.space })}
        onQuickOrganize={(importBatchId) => pushRoute({ name: 'quick-organize', ipId: currentRoute.ipId, importBatchId, space: currentRoute.space })}
        onOpenImageDetail={openImageDetail}
        refreshToken={libraryRefreshToken}
      />
    );
  } else if (currentRoute.name === 'import-batch-history') {
    content = (
      <ImportBatchHistoryScreen
        ipId={currentRoute.ipId}
        space={currentRoute.space}
        onBack={popRoute}
        onOpenBatch={(batch) =>
          pushRoute({
            name: 'import-result',
            ipId: currentRoute.ipId,
            imageIds: [],
            importBatchId: batch.id,
            space: currentRoute.space,
          })
        }
        refreshToken={libraryRefreshToken}
      />
    );
  } else if (currentRoute.name === 'duplicate-review') {
    content = (
      <DuplicateReviewScreen
        importBatchId={currentRoute.importBatchId}
        space={currentRoute.space}
        onBack={popRoute}
        refreshToken={libraryRefreshToken}
      />
    );
  } else if (currentRoute.name === 'all-images') {
    content = (
      <AllImagesScreen
        ipId={currentRoute.ipId}
        space={currentRoute.space}
        onBack={popRoute}
        onImportImages={() => pushRoute({ name: 'import-images', ipId: currentRoute.ipId, space: currentRoute.space })}
        onStartBatchManagement={(imageId) =>
          pushRoute({
            name: 'batch-manage-images',
            ipId: currentRoute.ipId,
            space: currentRoute.space,
            source: 'all-images',
            initialSelectedImageIds: [imageId],
          })
        }
        onOpenImage={openImageViewer}
        onOpenImageDetail={openImageDetail}
        refreshToken={libraryRefreshToken}
      />
    );
  } else if (currentRoute.name === 'image-viewer') {
    content = (
      <ImageViewerScreen
        context={currentRoute.context}
        imageId={currentRoute.imageId}
        onBack={popRoute}
        onOpenDetail={(imageId) => openImageDetail(imageId, currentRoute.context)}
        refreshToken={libraryRefreshToken}
      />
    );
  } else if (currentRoute.name === 'image-detail') {
    content = (
      <ImageDetailScreen
        imageId={currentRoute.imageId}
        space={currentRoute.space}
        context={currentRoute.context}
        onBack={popRoute}
        onDeleted={popAndRefresh}
        onEdit={(imageId) => pushRoute({ name: 'edit-image', imageId, space: currentRoute.space })}
        onMoveGroup={(imageId) => pushRoute({ name: 'move-image-group', imageId, space: currentRoute.space })}
        onNavigateImage={(imageId, context) => replaceCurrentRoute({ name: 'image-detail', imageId, space: context?.space ?? currentRoute.space, context })}
        onRefreshed={() => setLibraryRefreshToken((current) => current + 1)}
        refreshToken={libraryRefreshToken}
      />
    );
  } else if (currentRoute.name === 'move-image-group') {
    content = (
      <MoveImageGroupScreen
        imageId={currentRoute.imageId}
        space={currentRoute.space}
        onBack={popRoute}
        onSaved={popAndRefresh}
        refreshToken={libraryRefreshToken}
      />
    );
  } else if (currentRoute.name === 'tag-result') {
    content = (
      <TagResultScreen
        onBack={popRoute}
        onOpenImage={openImageViewer}
        onOpenImageDetail={openImageDetail}
        onStartBatchManagement={(ipId, imageId) =>
          pushRoute({
            name: 'batch-manage-images',
            ipId,
            space: currentRoute.space,
            source: 'all-images',
            initialSelectedImageIds: [imageId],
          })
        }
        refreshToken={libraryRefreshToken}
        space={currentRoute.space}
        tagId={currentRoute.tagId}
      />
    );
  } else if (currentRoute.name === 'favorites') {
    content = (
      <FavoritesScreen
        onBack={popRoute}
        onOpenImage={openImageViewer}
        onOpenImageDetail={openImageDetail}
        onStartBatchManagement={(ipId, imageId) =>
          pushRoute({
            name: 'batch-manage-images',
            ipId,
            space: currentRoute.space,
            source: 'all-images',
            initialSelectedImageIds: [imageId],
          })
        }
        refreshToken={libraryRefreshToken}
        space={currentRoute.space}
      />
    );
  } else if (currentRoute.name === 'recent-viewed') {
    content = (
      <RecentViewedScreen
        onBack={popRoute}
        onOpenImage={openImageViewer}
        onOpenImageDetail={openImageDetail}
        onStartBatchManagement={(ipId, imageId) =>
          pushRoute({
            name: 'batch-manage-images',
            ipId,
            space: currentRoute.space,
            source: 'all-images',
            initialSelectedImageIds: [imageId],
          })
        }
        refreshToken={libraryRefreshToken}
        space={currentRoute.space}
      />
    );
  } else if (currentRoute.name === 'quick-organize') {
    content = (
      <QuickOrganizeScreen
        importBatchId={currentRoute.importBatchId ?? null}
        ipId={currentRoute.ipId}
        space={currentRoute.space}
        onBack={popRoute}
        onChanged={refreshLibrary}
        onOpenImage={openImageViewer}
      />
    );
  } else if (currentRoute.name === 'global-search') {
    content = (
      <GlobalSearchScreen
        onBack={popRoute}
        onChangeQuery={setGlobalSearchQuery}
        onOpenGroup={(ipId, groupId) => pushRoute({ name: 'group-images', ipId, groupId, space: currentRoute.space })}
        onOpenImageDetail={openImageDetail}
        onOpenIp={(ipId) => pushRoute({ name: 'ip-detail', ipId, space: currentRoute.space })}
        onOpenTag={(tagId) => pushRoute({ name: 'tag-result', tagId, space: currentRoute.space })}
        query={globalSearchQuery}
      />
    );
  } else if (currentRoute.name === 'trash') {
    content = <TrashScreen onBack={popRoute} onChanged={refreshLibrary} refreshToken={libraryRefreshToken} />;
  } else if (currentRoute.name === 'backup') {
    content = <BackupScreen onBack={popRoute} refreshToken={libraryRefreshToken} />;
  } else if (currentRoute.name === 'personal-system') {
    content = (
      <PersonalSystemScreen
        onBack={popRoute}
        onImportImages={(ipId) => pushRoute({ name: 'import-images', ipId, space: 'personal' })}
        refreshToken={libraryRefreshToken}
      />
    );
  } else if (currentRoute.name === 'placeholder') {
    content = <PlaceholderScreen description={currentRoute.description} onBack={popRoute} title={currentRoute.title} />;
  } else if (currentRoute.name === 'import-development') {
    content = isDevToolsEnabled ? (
      <ImportDevelopmentScreen onBack={popRoute} />
    ) : (
      <PlaceholderScreen
        description="这个入口仅用于开发回归，非开发环境下不会显示。"
        onBack={popRoute}
        title="开发入口不可用"
      />
    );
  } else if (currentRoute.tab === 'groups') {
    content = (
      <GlobalGroupsScreen
        footer={rootFooter}
        onEditGroup={(ipId, groupId) => pushRoute({ name: 'edit-group', ipId, groupId, space: 'normal' })}
        onOpenGroup={(ipId, groupId) => pushRoute({ name: 'group-images', ipId, groupId, space: 'normal' })}
        refreshToken={libraryRefreshToken}
      />
    );
  } else if (currentRoute.tab === 'tags') {
    content = (
      <TagsOverviewScreen
        footer={rootFooter}
        onOpenTag={(tagId) => pushRoute({ name: 'tag-result', tagId, space: 'normal' })}
        refreshToken={libraryRefreshToken}
      />
    );
  } else if (currentRoute.tab === 'me') {
    content = (
      <MeScreen
        footer={rootFooter}
        onOpenFavorites={() => pushRoute({ name: 'favorites', space: 'normal' })}
        onOpenBackup={() => pushRoute({ name: 'backup', space: 'normal' })}
        onOpenPersonalSystem={() => pushRoute({ name: 'personal-system' })}
        onOpenRecentViewed={() => pushRoute({ name: 'recent-viewed', space: 'normal' })}
        onOpenTrash={() => pushRoute({ name: 'trash', space: 'normal' })}
        refreshToken={libraryRefreshToken}
      />
    );
  } else {
    content = (
      <HomeLibraryScreen
        footer={rootFooter}
        initialFilter={currentRoute.initialFilter ?? 'all'}
        onCreateIp={() => pushRoute({ name: 'create-ip', space: 'normal' })}
        onOpenGlobalSearch={() => {
          setGlobalSearchQuery('');
          pushRoute({ name: 'global-search', space: 'normal' });
        }}
        onOpenNeedsOrganizing={() => pushRoute({ name: 'quick-organize', space: 'normal' })}
        onOpenIp={(ipId) => pushRoute({ name: 'ip-detail', ipId, space: 'normal' })}
        refreshKey={libraryRefreshToken}
      />
    );
  }

  return (
    <SafeAreaProvider>
      <AppToastProvider>
        {content}
        <StatusBar style="dark" />
      </AppToastProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  stateScreen: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing[4],
    padding: spacing[6],
    width: '100%',
  },
  title: {
    ...typography.textStyles.navTitle,
    textAlign: 'center',
  },
  message: {
    ...typography.textStyles.body,
    textAlign: 'center',
  },
});
