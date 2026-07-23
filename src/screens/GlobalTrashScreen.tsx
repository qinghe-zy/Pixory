import React, { useState } from 'react';
import type { PixorySpace } from '../database';
import { TrashScreen } from './TrashScreen';
import { AiHistoryScreen } from './AiHistoryScreen';
import { CompactSegmentedControl } from '../components/CompactSegmentedControl';
import { View, StyleSheet } from 'react-native';

interface GlobalTrashScreenProps {
  onBack: () => void;
  onChanged: () => void;
  refreshToken?: number;
  space?: PixorySpace;
  storageMode?: boolean;
}

export function GlobalTrashScreen({
  onBack,
  onChanged,
  refreshToken,
  space = 'normal',
  storageMode,
}: GlobalTrashScreenProps) {
  const [tab, setTab] = useState<'ip' | 'chat'>('ip');

  const titleSlot = (
    <View style={styles.titleSlot}>
      <CompactSegmentedControl
        onChange={(val) => setTab(val as 'ip' | 'chat')}
        options={[
          { label: 'IP', value: 'ip' },
          { label: '聊天', value: 'chat' },
        ]}
        value={tab}
      />
    </View>
  );

  if (tab === 'ip') {
    return (
      <TrashScreen
        onBack={onBack}
        onChanged={onChanged}
        refreshToken={refreshToken}
        space={space}
        storageMode={storageMode}
        titleSlot={titleSlot}
      />
    );
  }

  return (
    <AiHistoryScreen
      forcedFilter="archived"
      onBack={onBack}
      onOpenThread={() => {}} // In trash we typically don't open thread directly, or maybe we do?
      space={space}
      titleSlot={titleSlot}
    />
  );
}

const styles = StyleSheet.create({
  titleSlot: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
});
