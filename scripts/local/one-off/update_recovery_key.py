import os

with open('src/components/RecoveryKeyModal.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Replace the inputWrap and TextInput in the "custom" mode
custom_old = """<View style={styles.inputWrap}>
                <TextInput
                  autoCapitalize="characters"
                  autoFocus
                  keyboardType="default"
                  maxLength={7}
                  onChangeText={(val) => {
                    const formatted = formatKey(val);
                    setCustomInput(formatted);
                  }}
                  placeholder="XXX-XXX"
                  placeholderTextColor={colors.text.placeholder}
                  style={styles.textInput}
                  value={customInput}
                />
              </View>"""

custom_new = """<View style={styles.customInputContainer}>
                {[0, 1, 2].map((i) => {
                  const rawChars = customInput.replace(/[^A-Z0-9]/g, '');
                  const char = rawChars[i] || '';
                  const isActive = rawChars.length === i;
                  return (
                    <View key={i} style={styles.charBox}>
                      <Text style={[styles.charText, !char && { color: 'transparent' }]}>{char || 'X'}</Text>
                      <View style={[styles.cursor, isActive && styles.cursorActive]} />
                    </View>
                  );
                })}
                <Text style={styles.customHyphen}>-</Text>
                {[3, 4, 5].map((i) => {
                  const rawChars = customInput.replace(/[^A-Z0-9]/g, '');
                  const char = rawChars[i] || '';
                  const isActive = rawChars.length === i;
                  return (
                    <View key={i} style={styles.charBox}>
                      <Text style={[styles.charText, !char && { color: 'transparent' }]}>{char || 'X'}</Text>
                      <View style={[styles.cursor, isActive && styles.cursorActive]} />
                    </View>
                  );
                })}
                <TextInput
                  autoCapitalize="characters"
                  autoFocus
                  keyboardType="default"
                  maxLength={6}
                  onChangeText={(val) => {
                    const clean = val.replace(/[^A-Z0-9a-z]/g, '').toUpperCase();
                    setCustomInput(clean);
                  }}
                  style={styles.hiddenInput}
                  value={customInput.replace(/[^A-Z0-9]/g, '')}
                  caretHidden
                />
              </View>"""

text = text.replace(custom_old, custom_new)

# Append styles
styles_to_add = """
  customInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[1],
    paddingVertical: spacing[3],
    position: 'relative',
    backgroundColor: colors.background.secondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  charBox: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  charText: {
    color: colors.text.primary,
    fontSize: 28,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 4,
  },
  cursor: {
    width: 24,
    height: 4,
    backgroundColor: 'transparent',
    borderRadius: 2,
  },
  cursorActive: {
    backgroundColor: colors.primary.active,
  },
  customHyphen: {
    color: colors.text.primary,
    fontSize: 28,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginHorizontal: spacing[1],
  },
  hiddenInput: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0,
    color: 'transparent',
  },"""

# Insert styles_to_add into StyleSheet.create({
text = text.replace('StyleSheet.create({', 'StyleSheet.create({' + styles_to_add)

# Another fix: when cancelling, it should reset the customInput to currentKey
# In handleCustomSave, if they hit cancel... Wait, cancel button is:
cancel_old = """<Pressable onPress={() => setMode('view')} style={styles.actionBtn}>
                  <Text style={[styles.actionText, { color: colors.text.secondary }]}>取消</Text>
                </Pressable>"""
cancel_new = """<Pressable onPress={() => { setCustomInput(currentKey); setMode('view'); }} style={styles.actionBtn}>
                  <Text style={[styles.actionText, { color: colors.text.secondary }]}>取消</Text>
                </Pressable>"""
text = text.replace(cancel_old, cancel_new)

# We also need to update `currentKey` if `initialKey` changes, or whenever modal opens.
# Let's add useEffect
effect_import = "import React, { useState, useEffect } from 'react';"
if "import React, { useState" in text and "useEffect" not in text:
    text = text.replace("import React, { useState } from 'react';", effect_import)

effect_code = """
  useEffect(() => {
    if (visible && initialKey) {
      setCurrentKey(initialKey);
      setCustomInput(initialKey);
      setMode('view');
    }
  }, [visible, initialKey]);
"""

text = text.replace("const [customInput, setCustomInput] = useState('');", "const [customInput, setCustomInput] = useState('');\n" + effect_code)

with open('src/components/RecoveryKeyModal.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print('Updated RecoveryKeyModal.tsx')
