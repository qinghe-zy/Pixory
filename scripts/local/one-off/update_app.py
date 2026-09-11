import re

with open("App.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# Add to imports
import_search = "import { SettingsScreen } from './src/screens/SettingsScreen';"
import_replace = """import { SettingsScreen } from './src/screens/SettingsScreen';
import { AdvancedSettingsScreen } from './src/screens/AdvancedSettingsScreen';"""

if import_search in content:
    content = content.replace(import_search, import_replace)
else:
    print("Warning: import_search not found")

# Add to AppRoute type
route_type_search = "  | { name: 'settings'; space: PixorySpace }"
route_type_replace = """  | { name: 'settings'; space: PixorySpace }
  | { name: 'advanced-settings'; space: PixorySpace }"""

if route_type_search in content:
    content = content.replace(route_type_search, route_type_replace)
else:
    print("Warning: route_type_search not found")

# Add to route rendering
render_search = """      <SettingsScreen 
        space={currentRoute.space}
        onBack={popRoute}
        onOpenDeveloperMode={() => pushRoute({ name: 'developer-mode-settings', space: currentRoute.space })}
        onOpenDiagnostics={() => pushRoute({ name: 'diagnostics-settings', space: currentRoute.space })}
        onOpenPasswordSecurity={() => pushRoute({ name: 'password-and-security' })}
      />"""
render_replace = """      <SettingsScreen 
        space={currentRoute.space}
        onBack={popRoute}
        onOpenDeveloperMode={() => pushRoute({ name: 'developer-mode-settings', space: currentRoute.space })}
        onOpenDiagnostics={() => pushRoute({ name: 'diagnostics-settings', space: currentRoute.space })}
        onOpenPasswordSecurity={() => pushRoute({ name: 'password-and-security' })}
        onOpenAdvancedSettings={() => pushRoute({ name: 'advanced-settings', space: currentRoute.space })}
      />"""

if render_search in content:
    content = content.replace(render_search, render_replace)
else:
    print("Warning: render_search not found")

# Add new case statement for advanced-settings
case_search = """    case 'settings':
      content = 
      <SettingsScreen """
case_replace = """    case 'advanced-settings':
      content = <AdvancedSettingsScreen space={currentRoute.space} onBack={popRoute} />;
      break;
    case 'settings':
      content = 
      <SettingsScreen """

if case_search in content:
    content = content.replace(case_search, case_replace)
else:
    print("Warning: case_search not found")


with open("App.tsx", "w", encoding="utf-8") as f:
    f.write(content)