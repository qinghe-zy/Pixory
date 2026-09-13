import re

with open('src/screens/ImageViewerScreen.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old_effect = """  const previousVolumeRef = useRef<number | null>(null);

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
  }, [activeImage?.mediaType, goToRelativeImage]);"""

new_effect = """  const baselineVolumeRef = useRef<number | null>(null);

  useEffect(() => {
    const isVideo = activeImage?.mediaType === 'video';
    
    if (isVideo) {
      VolumeManager.showNativeVolumeUI({ enabled: true });
      return;
    }

    VolumeManager.showNativeVolumeUI({ enabled: false });

    VolumeManager.getVolume().then(({ volume }) => {
      // 保证基准音量不在极端值，否则按键可能无法触发系统事件
      if (volume <= 0.05 || volume >= 0.95) {
        baselineVolumeRef.current = 0.5;
        VolumeManager.setVolume(0.5);
      } else {
        baselineVolumeRef.current = volume;
      }
    });

    const subscription = VolumeManager.addVolumeListener((result) => {
      if (baselineVolumeRef.current === null) return;

      // 如果是代码调用 setVolume 引起的恢复事件，或者是极微小的浮点数误差，忽略
      if (Math.abs(result.volume - baselineVolumeRef.current) < 0.001) {
        return;
      }

      if (result.volume > baselineVolumeRef.current) {
        // 音量加 -> 往前翻
        goToRelativeImage(-1);
      } else {
        // 音量减 -> 往后翻
        goToRelativeImage(1);
      }

      // 翻页后，立即将系统音量恢复到基准值，从而做到“拦截且不改变真实音量”
      VolumeManager.setVolume(baselineVolumeRef.current);
    });

    return () => {
      VolumeManager.showNativeVolumeUI({ enabled: true });
      subscription.remove();
    };
  }, [activeImage?.mediaType, goToRelativeImage]);"""

if old_effect in content:
    content = content.replace(old_effect, new_effect)
else:
    print("Could not find old effect!")

with open('src/screens/ImageViewerScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
