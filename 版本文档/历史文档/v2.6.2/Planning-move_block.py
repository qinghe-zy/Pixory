import re

with open('src/screens/AiSessionConfigScreen.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

pet_manager_regex = re.compile(r'(\s*<AiLightListGroup footer="此设置全局生效。" title="桌宠与互动">.*?</AiLightListGroup>)', re.DOTALL)
match = pet_manager_regex.search(content)
if match:
    pet_block = match.group(1)
    # Remove the block from its original position
    content = content.replace(pet_block, '')
    
    # Insert it below 角色与表现
    insert_regex = re.compile(r'(<AiLightListGroup title="角色与表现">.*?</AiLightListGroup>)', re.DOTALL)
    insert_match = insert_regex.search(content)
    if insert_match:
        role_block = insert_match.group(1)
        content = content.replace(role_block, role_block + '\n' + pet_block)
        
        with open('src/screens/AiSessionConfigScreen.tsx', 'w', encoding='utf-8') as f:
            f.write(content)
        print('Successfully moved Pet Manager block.')
    else:
        print('Could not find insert point')
else:
    print('Could not find pet block')
