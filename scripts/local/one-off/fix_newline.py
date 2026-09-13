import re

with open("src/screens/SettingsScreen.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# Replace the problematic line with a correct JS template literal or proper \n
search = "      Alert.alert('凭证导出成功', '已保存至系统文件夹\n请妥善保管这把属于你的顶级防伪私钥证明。');"
replace = "      Alert.alert('凭证导出成功', '已保存至系统文件夹\\n请妥善保管这把属于你的顶级防伪私钥证明。');"

content = content.replace(search, replace)

with open("src/screens/SettingsScreen.tsx", "w", encoding="utf-8") as f:
    f.write(content)