import re

path = 'src/components/ai/Live2DPetManagerModal.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Import Live2DPetView
if 'Live2DPetView' not in content:
    content = content.replace(
        "import { live2dManagerService } from '../../services/live2dManagerService';",
        "import { live2dManagerService } from '../../services/live2dManagerService';\nimport { Live2DPetView } from './Live2DPetView';"
    )

# 2. Add previewModelId state
if 'const [previewModelId, setPreviewModelId]' not in content:
    content = content.replace(
        "const [downloadingId, setDownloadingId] = useState<string | null>(null);",
        "const [downloadingId, setDownloadingId] = useState<string | null>(null);\n  const [previewModelId, setPreviewModelId] = useState<string | null>(currentModelId);"
    )
    
    # Sync preview when currentModelId changes or becomes visible
    sync_code = '''  useEffect(() => {
    if (visible && currentModelId) {
      setPreviewModelId(currentModelId);
    }
  }, [visible, currentModelId]);
'''
    content = content.replace(
        "const refreshStatus = async () => {",
        sync_code + "\n  const refreshStatus = async () => {"
    )

# 3. Add Preview Area and Avatar function
colors = ['#FFCDD2', '#F8BBD0', '#E1BEE7', '#D1C4E9', '#C5CAE9', '#BBDEFB', '#B3E5FC', '#B2EBF2', '#B2DFDB', '#C8E6C9', '#DCEDC8', '#F0F4C3', '#FFF9C4', '#FFECB3', '#FFE082', '#FFCC80', '#FFAB91', '#BCAAA4', '#EEEEEE', '#CFD8DC']
avatar_func = '''
  const getAvatarColor = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = ['#FFCDD2', '#F8BBD0', '#E1BEE7', '#D1C4E9', '#C5CAE9', '#BBDEFB', '#B3E5FC', '#B2EBF2', '#B2DFDB', '#C8E6C9', '#DCEDC8', '#F0F4C3', '#FFF9C4', '#FFECB3', '#FFE082', '#FFCC80', '#FFAB91', '#BCAAA4', '#EEEEEE', '#CFD8DC'];
    return colors[Math.abs(hash) % colors.length];
  };
'''
if 'getAvatarColor' not in content:
    content = content.replace(
        "const filteredModels = useMemo(() => {",
        avatar_func + "\n  const filteredModels = useMemo(() => {"
    )

# 4. Modify JSX to inject preview area
preview_jsx = '''
            <View style={{ height: 200, width: '100%', backgroundColor: aiLightColors.background, borderRadius: 12, marginBottom: 16, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' }}>
              {previewModelId && downloadedMap[previewModelId] ? (
                <Live2DPetView 
                  modelUrl={PET_MODELS.find(m => m.id === previewModelId)?.url || ''} 
                  onLoadSuccess={() => {}}
                />
              ) : (
                <View style={{ alignItems: 'center' }}>
                  <Ionicons name="paw-outline" size={48} color={aiLightColors.border} />
                  <Text style={{ marginTop: 8, color: aiLightColors.textSecondary, fontSize: 12 }}>
                    {previewModelId && !downloadedMap[previewModelId] ? '该模型未下载，请先下载后预览' : '点击列表模型可在此处预览 (Live2D引擎渲染)'}
                  </Text>
                </View>
              )}
            </View>
'''
if 'Live2DPetView' not in content.split('</View>')[1]:  # Very crude check to see if we already injected it
    content = content.replace(
        '<View style={styles.categoryTabsContainer}>',
        preview_jsx + '\n            <View style={styles.categoryTabsContainer}>'
    )

# 5. Modify item rendering to include avatar and tap-to-preview
old_item = '''                  <View key={model.id} style={[styles.item, isSelected && styles.itemSelected]}>
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemName} numberOfLines={1}>
                        {model.name}
                      </Text>
                    </View>'''

new_item = '''                  <Pressable 
                    key={model.id} 
                    style={[styles.item, (isSelected || previewModelId === model.id) && styles.itemSelected]}
                    onPress={() => setPreviewModelId(model.id)}
                  >
                    <View style={styles.itemInfo}>
                      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: getAvatarColor(model.name), justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                        <Text style={{ color: '#444', fontWeight: 'bold', fontSize: 16 }}>{model.name.substring(0, 1).toUpperCase()}</Text>
                      </View>
                      <Text style={styles.itemName} numberOfLines={1}>
                        {model.name}
                      </Text>
                    </View>'''

content = content.replace(old_item, new_item)

# also change </View> at the end of map iteration to </Pressable>
# Specifically the one right after </View> for actions
content = content.replace(
    '''                    </View>
                  </View>''',
    '''                    </View>
                  </Pressable>'''
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Patched Modal screen.")
