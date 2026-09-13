import re

def fix_imports(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Check if StatusBar is imported from react-native
    rn_import_match = re.search(r"import \{ (.*?) \} from 'react-native';", content)
    if rn_import_match:
        rn_imports = rn_import_match.group(1)
        if 'StatusBar' not in rn_imports:
            # Platform might also be missing
            new_rn_imports = rn_imports
            if 'Platform' not in rn_imports:
                new_rn_imports += ', Platform'
            new_rn_imports += ', StatusBar'
            content = content.replace(f"import {{ {rn_imports} }} from 'react-native';", f"import {{ {new_rn_imports} }} from 'react-native';")

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

fix_imports('src/screens/GroupImagesScreen.tsx')
fix_imports('src/screens/TagResultScreen.tsx')