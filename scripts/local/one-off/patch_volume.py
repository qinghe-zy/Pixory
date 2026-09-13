import re

with open('src/screens/ImageViewerScreen.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add import if missing
if 'react-native-volume-manager' not in content:
    content = content.replace("import { useEffect, useRef, useState, useCallback, useMemo } from 'react';", "import { useEffect, useRef, useState, useCallback, useMemo } from 'react';\nimport { VolumeManager } from 'react-native-volume-manager';")

volume_effect = """
  const previousVolumeRef = useRef<number | null>(null);

  useEffect(() => {
    const isVideo = activeImage?.mediaType === 'video';
    
    if (isVideo) {
      VolumeManager.showNativeVolumeUI({ enabled: true });
      return;
    }

    VolumeManager.showNativeVolumeUI({ enabled: false });

    VolumeManager.getVolume().then(({ volume }) => {
      previousVolumeRef.current = volume;
    });

    const subscription = VolumeManager.addVolumeListener((result) => {
      if (previousVolumeRef.current !== null) {
        if (result.volume > previousVolumeRef.current) {
          // Volume Up -> Prev
          goToRelativeImage(-1);
        } else if (result.volume < previousVolumeRef.current) {
          // Volume Down -> Next
          goToRelativeImage(1);
        }
      }
      previousVolumeRef.current = result.volume;

      if (result.volume >= 1) {
        VolumeManager.setVolume(0.9);
        previousVolumeRef.current = 0.9;
      } else if (result.volume <= 0) {
        VolumeManager.setVolume(0.1);
        previousVolumeRef.current = 0.1;
      }
    });

    return () => {
      VolumeManager.showNativeVolumeUI({ enabled: true });
      subscription.remove();
    };
  }, [activeImage?.mediaType, goToRelativeImage]);
"""

if 'VolumeManager.addVolumeListener' not in content:
    # insert before handleReaderZonePress
    content = content.replace('  const handleReaderZonePress = useCallback(', volume_effect + '\n  const handleReaderZonePress = useCallback(')

with open('src/screens/ImageViewerScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
