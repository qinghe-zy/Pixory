import re

path = 'src/screens/MeScreen.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Import
content = content.replace(
    "import { ProfileRenameDialog } from '../components/ProfileRenameDialog';",
    "import { ProfileRenameDialog } from '../components/ProfileRenameDialog';\nimport { Live2DPetManagerModal } from '../components/ai/Live2DPetManagerModal';"
)

# 2. Add State
content = content.replace(
    "const [isRenameDialogVisible, setIsRenameDialogVisible] = useState(false);",
    "const [isRenameDialogVisible, setIsRenameDialogVisible] = useState(false);\n  const [isPetManagerVisible, setIsPetManagerVisible] = useState(false);"
)

# 3. Add to system list
new_item = '''          <Pressable onPress={() => setIsPetManagerVisible(true)} style={({ pressed }) => [styles.systemListItem, pressed && styles.pressed]}>
            <View style={styles.systemListIcon}>
              <Ionicons color={colors.primary.active} name="shirt-outline" size={20} />
            </View>
            <Text style={styles.systemListTitle}>桌宠管理</Text>
            <Ionicons color={colors.text.secondary} name="chevron-forward" size={18} />
          </Pressable>
          <View style={styles.systemListDivider} />
'''
content = content.replace(
    "<Pressable onPress={() => handleEntryPress('about')}",
    new_item + "          <Pressable onPress={() => handleEntryPress('about')}"
)

# 4. Add the modal rendering
modal_code = '''
      <Live2DPetManagerModal
        visible={isPetManagerVisible}
        currentModelId={null}
        onClose={() => setIsPetManagerVisible(false)}
        onSelect={() => showToast('请在 AI 会话设置中为各个角色配置桌宠！')}
      />
'''
content = content.replace(
    '</ScreenScaffold>',
    modal_code + '\n    </ScreenScaffold>'
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("MeScreen patched.")
