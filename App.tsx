import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppScreen } from './src/components/AppScreen';
import { PrimaryButton } from './src/components/PrimaryButton';
import { colors, spacing, typography } from './src/design/tokens';
import { initDatabase, type IpLibraryFilter } from './src/database';
import { AllImagesScreen } from './src/screens/AllImagesScreen';
import { CreateGroupScreen } from './src/screens/CreateGroupScreen';
import { CreateIpScreen } from './src/screens/CreateIpScreen';
import { EditIpScreen } from './src/screens/EditIpScreen';
import { GroupImagesScreen } from './src/screens/GroupImagesScreen';
import { GroupOverviewScreen } from './src/screens/GroupOverviewScreen';
import { HomeLibraryScreen } from './src/screens/HomeLibraryScreen';
import { ImageDetailScreen } from './src/screens/ImageDetailScreen';
import { ImportDevelopmentScreen } from './src/screens/ImportDevelopmentScreen';
import { ImportImagesScreen } from './src/screens/ImportImagesScreen';
import { IpDetailScreen } from './src/screens/IpDetailScreen';
import { PlaceholderScreen } from './src/screens/PlaceholderScreen';
import { ensureAppDirectories } from './src/services/fileStorageService';

type AppRoute =
  | { name: 'home'; initialFilter?: IpLibraryFilter }
  | { name: 'create-ip' }
  | { name: 'ip-detail'; ipId: number }
  | { name: 'edit-ip'; ipId: number }
  | { name: 'group-overview'; ipId: number }
  | { name: 'create-group'; ipId: number }
  | { name: 'group-images'; ipId: number; groupId: number }
  | { name: 'import-images'; ipId: number; groupId?: number | null }
  | { name: 'all-images'; ipId: number }
  | { name: 'image-detail'; imageId: number }
  | { name: 'placeholder'; title: string; description: string }
  | { name: 'import-development' };

const INITIAL_ROUTE: AppRoute = { name: 'home' };

export default function App() {
  const [status, setStatus] = useState('正在初始化 Pixory 本地数据库与文件目录...');
  const [isReady, setIsReady] = useState(false);
  const [routeStack, setRouteStack] = useState<AppRoute[]>([INITIAL_ROUTE]);
  const [libraryRefreshToken, setLibraryRefreshToken] = useState(0);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [initializationKey, setInitializationKey] = useState(0);

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

  function pushRoute(route: AppRoute) {
    setRouteStack((current) => [...current, route]);
  }

  function popRoute() {
    setRouteStack((current) => (current.length > 1 ? current.slice(0, -1) : current));
  }

  function popAndRefresh() {
    setLibraryRefreshToken((current) => current + 1);
    popRoute();
  }

  function resetHome(filter: IpLibraryFilter = 'all') {
    setRouteStack([{ name: 'home', initialFilter: filter }]);
  }

  if (!isReady) {
    return (
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
    );
  }

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
        onBack={popRoute}
        onCreateGroup={() => pushRoute({ name: 'create-group', ipId: currentRoute.ipId })}
        onEdit={() => pushRoute({ name: 'edit-ip', ipId: currentRoute.ipId })}
        onImportImages={() => pushRoute({ name: 'import-images', ipId: currentRoute.ipId })}
        onOpenAllImages={() => pushRoute({ name: 'all-images', ipId: currentRoute.ipId })}
        onOpenBatchManagement={() =>
          pushRoute({
            name: 'placeholder',
            title: '批量管理',
            description: '批量管理会在下一轮补齐，这里先保留正式入口位。',
          })
        }
        onOpenGroups={() => pushRoute({ name: 'group-overview', ipId: currentRoute.ipId })}
        onOpenImage={(imageId) => pushRoute({ name: 'image-detail', imageId })}
        refreshToken={libraryRefreshToken}
      />
    );
  } else if (currentRoute.name === 'edit-ip') {
    content = <EditIpScreen ipId={currentRoute.ipId} onBack={popRoute} onSaved={popAndRefresh} />;
  } else if (currentRoute.name === 'group-overview') {
    content = (
      <GroupOverviewScreen
        ipId={currentRoute.ipId}
        onBack={popRoute}
        onCreateGroup={() => pushRoute({ name: 'create-group', ipId: currentRoute.ipId })}
        onOpenGroup={(groupId) => pushRoute({ name: 'group-images', ipId: currentRoute.ipId, groupId })}
        refreshToken={libraryRefreshToken}
      />
    );
  } else if (currentRoute.name === 'create-group') {
    content = <CreateGroupScreen ipId={currentRoute.ipId} onBack={popRoute} onCreated={popAndRefresh} />;
  } else if (currentRoute.name === 'group-images') {
    content = (
      <GroupImagesScreen
        groupId={currentRoute.groupId}
        ipId={currentRoute.ipId}
        onBack={popRoute}
        onImportImages={() =>
          pushRoute({
            name: 'import-images',
            ipId: currentRoute.ipId,
            groupId: currentRoute.groupId,
          })
        }
        onOpenImage={(imageId) => pushRoute({ name: 'image-detail', imageId })}
        refreshToken={libraryRefreshToken}
      />
    );
  } else if (currentRoute.name === 'import-images') {
    content = (
      <ImportImagesScreen
        defaultGroupId={currentRoute.groupId ?? null}
        ipId={currentRoute.ipId}
        onBack={popRoute}
        onImported={popAndRefresh}
      />
    );
  } else if (currentRoute.name === 'all-images') {
    content = (
      <AllImagesScreen
        ipId={currentRoute.ipId}
        onBack={popRoute}
        onImportImages={() => pushRoute({ name: 'import-images', ipId: currentRoute.ipId })}
        onOpenImage={(imageId) => pushRoute({ name: 'image-detail', imageId })}
        refreshToken={libraryRefreshToken}
      />
    );
  } else if (currentRoute.name === 'image-detail') {
    content = (
      <ImageDetailScreen
        imageId={currentRoute.imageId}
        onBack={popRoute}
        onRefreshed={() => setLibraryRefreshToken((current) => current + 1)}
        refreshToken={libraryRefreshToken}
      />
    );
  } else if (currentRoute.name === 'placeholder') {
    content = <PlaceholderScreen description={currentRoute.description} onBack={popRoute} title={currentRoute.title} />;
  } else if (currentRoute.name === 'import-development') {
    content = <ImportDevelopmentScreen onBack={popRoute} />;
  } else {
    content = (
      <HomeLibraryScreen
        initialFilter={currentRoute.name === 'home' ? currentRoute.initialFilter : 'all'}
        onCreateIp={() => pushRoute({ name: 'create-ip' })}
        onOpenImportDevelopment={__DEV__ ? () => pushRoute({ name: 'import-development' }) : undefined}
        onOpenIp={(ipId) => pushRoute({ name: 'ip-detail', ipId })}
        refreshKey={libraryRefreshToken}
      />
    );
  }

  return (
    <>
      {content}
      <StatusBar style="dark" />
    </>
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
