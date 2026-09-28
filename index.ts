import 'react-native-gesture-handler';
import React from 'react';
import { registerRootComponent } from 'expo';
import { AppRegistry } from 'react-native';

import { GlobalErrorBoundary } from './src/components/GlobalErrorBoundary';

// Use dynamic inline require for App to catch module evaluation errors (e.g. top-level syntax/reference errors in App.tsx)
let App: any;
try {
  App = require('./App').default;
} catch (e: any) {
  // If App.tsx fails to evaluate, fallback to a component that throws during render
  // This guarantees GlobalErrorBoundary will catch it and display the recovery UI
  App = () => {
    throw e;
  };
}

const Root = () => React.createElement(
  GlobalErrorBoundary,
  null,
  React.createElement(App, null)
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
