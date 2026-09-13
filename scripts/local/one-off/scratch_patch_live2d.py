import re

def patch_live2d_view():
    path = "src/components/ai/Live2DPetView.tsx"
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Add motions parameter to onLoadSuccess
    content = content.replace(
        "onLoadSuccess?: () => void;",
        "onLoadSuccess?: (motions?: string[]) => void;"
    )
    
    # Extract motions in loadModel
    script_injection = """
        // 提取支持的 motions
        let extractedMotions = [];
        try {
          if (model.internalModel.motionManager) {
            if (model.internalModel.motionManager.motionGroups) {
              extractedMotions = Object.keys(model.internalModel.motionManager.motionGroups);
            } else if (model.internalModel.motionManager.groups) {
              extractedMotions = Object.keys(model.internalModel.motionManager.groups);
            }
          }
          if (extractedMotions.length === 0 && model.internalModel.settings && model.internalModel.settings.motions) {
            extractedMotions = Object.keys(model.internalModel.settings.motions);
          }
        } catch(e) {}

        // 通知 RN 加载成功
        window.ReactNativeWebView?.postMessage(JSON.stringify({
          type: 'MODEL_LOADED',
          payload: { status: 'success', motions: extractedMotions }
        }));"""
    
    content = re.sub(
        r"// 通知 RN 加载成功\s*window\.ReactNativeWebView\?\.postMessage\(JSON\.stringify\(\{\s*type:\s*'MODEL_LOADED',\s*payload:\s*\{\s*status:\s*'success'\s*\}\s*\}\)\);",
        script_injection,
        content
    )
    
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

def patch_aichat_screen():
    path = "src/screens/AiChatScreen.tsx"
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # Pass motions to onLoadSuccess
    content = content.replace(
        "case 'MODEL_LOADED':\n          setLoading(false);\n          onLoadSuccess?.();",
        "case 'MODEL_LOADED':\n          setLoading(false);\n          onLoadSuccess?.(data.payload.motions);"
    )

    # Add state for loadedMotions
    content = content.replace(
        "const [currentPetModelId, setCurrentPetModelId] = useState<string | null>(null);",
        "const [currentPetModelId, setCurrentPetModelId] = useState<string | null>(null);\n    const [loadedMotions, setLoadedMotions] = useState<string[]>([]);\n    const [petVisible, setPetVisible] = useState(true);"
    )
    
    # Update onLoadSuccess
    content = content.replace(
        "modelUrl={currentPetModel.url}",
        "modelUrl={currentPetModel.url}\n                onLoadSuccess={(motions) => { if (motions) setLoadedMotions(motions); }}"
    )
    
    # Replace currentPetModel.motions with loadedMotions in resetIdleTimer
    content = content.replace(
        "const motions = currentPetModel.motions || [];",
        "const motions = loadedMotions.length > 0 ? loadedMotions : (currentPetModel?.motions || []);"
    )

    # Wait, add the capsule button for the user to toggle pet
    capsule_button = """
          <Pressable
            accessibilityLabel="切换桌宠显示"
            accessibilityRole="button"
            onPress={() => setPetVisible(!petVisible)}
            style={({ pressed }) => [styles.roundButton, pressed && styles.pressed, { paddingHorizontal: 12, width: 'auto', borderRadius: 20 }]}
          >
            <Text style={{ fontSize: 12, color: aiLightColors.ink }}>{petVisible ? '隐藏桌宠' : '召唤桌宠'}</Text>
          </Pressable>
"""
    content = content.replace(
        '<View style={styles.headerActions}>',
        '<View style={styles.headerActions}>\n' + capsule_button
    )
    
    # Render Live2DPetView based on petVisible
    content = content.replace(
        '<View {...petPanResponder.panHandlers} style={{ flex: 1, position: \'relative\' }}>',
        '{petVisible && <View {...petPanResponder.panHandlers} style={{ flex: 1, position: \'relative\' }}>'
    )
    
    # Safely close petVisible brace
    content = re.sub(
        r'(<Animated\.View[^>]*\{...scalePanResponder\.panHandlers\}[^>]*>.*?</Animated\.View>\s*)(</View>)',
        r'\1\2}',
        content,
        flags=re.DOTALL
    )

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

patch_live2d_view()
patch_aichat_screen()
print("Patched.")
