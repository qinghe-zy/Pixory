import re

with open("App.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# Add route handling
render_search = """      <SettingsScreen 
          space={currentRoute.space} 
          onBack={popRoute} 
          onOpenDeveloperMode={() => pushRoute({ name: 'developer-mode-settings', space: currentRoute.space })} 
          onOpenDiagnostics={() => pushRoute({ name: 'diagnostics-settings', space: currentRoute.space })} 
          onOpenPasswordSecurity={() => pushRoute({ name: 'password-security-settings', space: currentRoute.space })}
        />"""
render_replace = """      <SettingsScreen 
          space={currentRoute.space} 
          onBack={popRoute} 
          onOpenDeveloperMode={() => pushRoute({ name: 'developer-mode-settings', space: currentRoute.space })} 
          onOpenDiagnostics={() => pushRoute({ name: 'diagnostics-settings', space: currentRoute.space })} 
          onOpenPasswordSecurity={() => pushRoute({ name: 'password-security-settings', space: currentRoute.space })}
          onOpenAdvancedSettings={() => pushRoute({ name: 'advanced-settings', space: currentRoute.space })}
        />"""

if render_search in content:
    content = content.replace(render_search, render_replace)
else:
    print("Warning: render_search not found")

case_search = """    } else if (currentRoute.name === 'settings') {"""
case_replace = """    } else if (currentRoute.name === 'advanced-settings') {
      content = <AdvancedSettingsScreen space={currentRoute.space} onBack={popRoute} />;
    } else if (currentRoute.name === 'settings') {"""

if case_search in content:
    content = content.replace(case_search, case_replace)
else:
    print("Warning: case_search not found")

with open("App.tsx", "w", encoding="utf-8") as f:
    f.write(content)