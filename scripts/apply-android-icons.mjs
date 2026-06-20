import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceBase = path.join(repoRoot, 'assets', 'android-icons');
const targetBase = path.join(repoRoot, 'android', 'app', 'src', 'main', 'res');
const manifestPath = path.join(repoRoot, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
const densities = ['mipmap-mdpi', 'mipmap-hdpi', 'mipmap-xhdpi', 'mipmap-xxhdpi', 'mipmap-xxxhdpi'];
const iconNames = ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png'];

const fileExists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const copyIcons = async () => {
  for (const density of densities) {
    for (const iconName of iconNames) {
      const sourcePath = path.join(sourceBase, density, iconName);
      const targetPath = path.join(targetBase, density, iconName);
      if (!(await fileExists(sourcePath))) {
        throw new Error(`Missing source icon: ${sourcePath}`);
      }
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.copyFile(sourcePath, targetPath);
    }
  }
};

const applyAdaptiveForeground = async () => {
  const drawablePath = path.join(targetBase, 'drawable', 'ic_launcher_foreground.xml');
  const drawableV24Path = path.join(targetBase, 'drawable-v24', 'ic_launcher_foreground.xml');
  const content = `<?xml version="1.0" encoding="utf-8"?>
<bitmap xmlns:android="http://schemas.android.com/apk/res/android"
    android:gravity="fill"
    android:src="@mipmap/ic_launcher_foreground" />
`;
  await fs.mkdir(path.dirname(drawablePath), { recursive: true });
  await fs.mkdir(path.dirname(drawableV24Path), { recursive: true });
  await fs.writeFile(drawablePath, content, 'utf8');
  await fs.writeFile(drawableV24Path, content, 'utf8');
};

const applyBackgroundColor = async () => {
  const valuesPath = path.join(targetBase, 'values', 'ic_launcher_background.xml');
  const content = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#101B47</color>
</resources>
`;
  await fs.mkdir(path.dirname(valuesPath), { recursive: true });
  await fs.writeFile(valuesPath, content, 'utf8');
};

const applyNotificationIcon = async () => {
  const drawablePath = path.join(targetBase, 'drawable', 'ic_stat_vibe.xml');
  const content = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:fillColor="#FFFFFFFF"
        android:pathData="M3,3h18v12H7l-4,4z" />
    <path
        android:fillColor="#FF000000"
        android:fillAlpha="0"
        android:pathData="M0,0h24v24H0z" />
</vector>
`;
  await fs.mkdir(path.dirname(drawablePath), { recursive: true });
  await fs.writeFile(drawablePath, content, 'utf8');
};

const patchAdaptiveIconXml = async () => {
  const anydpiPath = path.join(targetBase, 'mipmap-anydpi-v26');
  const iconXml = path.join(anydpiPath, 'ic_launcher.xml');
  const roundIconXml = path.join(anydpiPath, 'ic_launcher_round.xml');
  const content = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
`;
  await fs.mkdir(anydpiPath, { recursive: true });
  await fs.writeFile(iconXml, content, 'utf8');
  await fs.writeFile(roundIconXml, content, 'utf8');
};

const patchManifestDefaults = async () => {
  if (!(await fileExists(manifestPath))) return;
  let manifest = await fs.readFile(manifestPath, 'utf8');
  let changed = false;

  if (manifest.includes('android:icon="@mipmap/ic_launcher_round"')) {
    manifest = manifest.replace('android:icon="@mipmap/ic_launcher_round"', 'android:icon="@mipmap/ic_launcher"');
    changed = true;
  }
  if (manifest.includes('android:roundIcon="@mipmap/ic_launcher_round"')) {
    manifest = manifest.replace('android:roundIcon="@mipmap/ic_launcher_round"', 'android:roundIcon="@mipmap/ic_launcher"');
    changed = true;
  }
  if (!manifest.includes('android:roundIcon="@mipmap/ic_launcher"')) {
    manifest = manifest.replace(
      /(<application[^>]*android:icon="[^"]+"[^>]*)(>)/,
      '$1 android:roundIcon="@mipmap/ic_launcher"$2',
    );
    changed = true;
  }

  if (manifest.includes('android:windowSoftInputMode=')) {
    const next = manifest.replace(
      /(<activity\b[^>]*android:name="\.MainActivity"[\s\S]*?)android:windowSoftInputMode="[^"]*"/,
      '$1android:windowSoftInputMode="adjustResize"',
    );
    if (next !== manifest) {
      manifest = next;
      changed = true;
    }
  } else {
    const next = manifest.replace(
      /(<activity\b[^>]*android:name="\.MainActivity"[^>]*android:exported="true")/m,
      '$1 android:windowSoftInputMode="adjustResize"',
    );
    if (next !== manifest) {
      manifest = next;
      changed = true;
    }
  }

  if (!manifest.includes('com.google.firebase.messaging.default_notification_icon')) {
    manifest = manifest.replace(
      /(<application[^>]*>)/,
      `$1
        <meta-data
            android:name="com.google.firebase.messaging.default_notification_icon"
            android:resource="@drawable/ic_stat_vibe" />
        <meta-data
            android:name="com.google.firebase.messaging.default_notification_color"
            android:resource="@android:color/white" />`,
    );
    changed = true;
  } else if (!manifest.includes('com.google.firebase.messaging.default_notification_color')) {
    manifest = manifest.replace(
      /(<meta-data[\s\S]*?com\.google\.firebase\.messaging\.default_notification_icon[\s\S]*?\/>)/,
      `$1
        <meta-data
            android:name="com.google.firebase.messaging.default_notification_color"
            android:resource="@android:color/white" />`,
    );
    changed = true;
  }

  if (changed) {
    await fs.writeFile(manifestPath, manifest, 'utf8');
  }
};

const main = async () => {
  const hasAndroid = await fileExists(path.join(repoRoot, 'android', 'app'));
  if (!hasAndroid) {
    console.log('[android-icons] android/app not found. Skip icon apply.');
    return;
  }

  const hasSources = await fileExists(sourceBase);
  if (!hasSources) {
    throw new Error('[android-icons] assets/android-icons directory is missing.');
  }

  await copyIcons();
  await applyAdaptiveForeground();
  await applyBackgroundColor();
  await patchAdaptiveIconXml();
  await applyNotificationIcon();
  await patchManifestDefaults();
  console.log('[android-icons] Android launcher icons applied successfully.');
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
