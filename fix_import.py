with open('src/screens/ImageViewerScreen.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

import_statement = "import { VolumeManager } from 'react-native-volume-manager';\n"
if 'react-native-volume-manager' not in content:
    content = import_statement + content

with open('src/screens/ImageViewerScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
