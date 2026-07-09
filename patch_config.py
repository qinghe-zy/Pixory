import re

path = 'src/screens/AiSessionConfigScreen.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

target = '''            <AiLightListGroup footer="此设置全局生效。" title="桌宠与互动">
              <AiLightListItem
                icon="eye-off-outline"
                title="关闭桌宠"
                onPress={() => void handleSelectPetModel(null)}
                value={currentPetModelId === null ? '✔️' : undefined}
              />'''

replacement = '''            <AiLightListGroup footer="此设置全局生效。" title="桌宠与互动">
              <AiLightListItem
                accessibilityRole="switch"
                icon="eye-outline"
                title="显示桌宠"
                onPress={() => void handleSelectPetModel(currentPetModelId === null ? PET_MODELS[0].id : null)}
                action={
                  <AiSwitch
                    value={currentPetModelId !== null}
                    onValueChange={(val) => void handleSelectPetModel(val ? PET_MODELS[0].id : null)}
                  />
                }
              />'''

content = content.replace(target, replacement)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Patched config screen.")
