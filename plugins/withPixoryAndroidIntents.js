const fs = require('node:fs');
const path = require('node:path');
const { createRunOncePlugin, withAppBuildGradle, withDangerousMod } = require('expo/config-plugins');

const PLUGIN_NAME = 'with-pixory-android-intents';
const PLUGIN_VERSION = '1.0.0';

const TEMPLATE_FILES = [
  {
    source: 'plugins/pixory-android-intents/templates/app/src/main/AndroidManifest.xml',
    target: 'app/src/main/AndroidManifest.xml',
  },
  {
    source: 'plugins/pixory-android-intents/templates/app/src/main/res/values/styles.xml',
    target: 'app/src/main/res/values/styles.xml',
  },
  {
    source: 'plugins/pixory-android-intents/templates/app/src/main/java/com/pixory/app/MainActivity.kt',
    target: 'app/src/main/java/com/pixory/app/MainActivity.kt',
  },
  {
    source: 'plugins/pixory-android-intents/templates/app/src/main/java/com/pixory/app/PixoryShareActivity.kt',
    target: 'app/src/main/java/com/pixory/app/PixoryShareActivity.kt',
  },
  {
    source: 'plugins/pixory-android-intents/templates/app/src/main/java/com/pixory/app/media/PixoryMediaModule.kt',
    target: 'app/src/main/java/com/pixory/app/media/PixoryMediaModule.kt',
  },
  {
    source: 'plugins/pixory-android-intents/templates/app/src/main/java/com/pixory/app/diary/DiaryAlarmReceiver.kt',
    target: 'app/src/main/java/com/pixory/app/diary/DiaryAlarmReceiver.kt',
  },
  {
    source: 'plugins/pixory-android-intents/templates/app/src/main/java/com/pixory/app/diary/DiaryAlarmService.kt',
    target: 'app/src/main/java/com/pixory/app/diary/DiaryAlarmService.kt',
  },
];

const PDFBOX_DEPENDENCY = 'implementation("com.tom-roush:pdfbox-android:2.0.27.0")';

function copyTemplateFile(projectRoot, androidRoot, sourceRelativePath, targetRelativePath) {
  const sourcePath = path.join(projectRoot, sourceRelativePath);
  const targetPath = path.join(androidRoot, targetRelativePath);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`[${PLUGIN_NAME}] Missing template file: ${sourceRelativePath}`);
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function withPixoryAndroidIntents(config) {
  const configWithDependency = withAppBuildGradle(config, (modConfig) => {
    if (!modConfig.modResults.contents.includes(PDFBOX_DEPENDENCY)) {
      modConfig.modResults.contents = modConfig.modResults.contents.replace(
        /dependencies\s*\{\n/,
        (match) => `${match}    ${PDFBOX_DEPENDENCY}\n`
      );
    }
    return modConfig;
  });

  return withDangerousMod(configWithDependency, [
    'android',
    async (modConfig) => {
      const { projectRoot, platformProjectRoot } = modConfig.modRequest;

      for (const file of TEMPLATE_FILES) {
        copyTemplateFile(projectRoot, platformProjectRoot, file.source, file.target);
      }

      return modConfig;
    },
  ]);
}

module.exports = createRunOncePlugin(withPixoryAndroidIntents, PLUGIN_NAME, PLUGIN_VERSION);
