import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import { AppRegistry } from 'react-native';

import App from './App';

import { GlobalErrorBoundary } from './src/components/GlobalErrorBoundary';

const Root = () => (
  <GlobalErrorBoundary>
    <App />
  </GlobalErrorBoundary>
);

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(Root);

AppRegistry.registerHeadlessTask('PixoryDiaryAlarm', () => async (data: { jobId?: string }) => {
  const jobId = data?.jobId?.trim();
  if (!jobId) {
    return;
  }
  const { runDiaryJobForAnySpace } = await import('./src/ai/diary/diaryHeadlessService');
  await runDiaryJobForAnySpace(jobId);
});
