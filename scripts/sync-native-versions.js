#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const appJsonPath = path.join(root, "app.json");
const pbxprojPath = path.join(root, "ios", "Reflekt.xcodeproj", "project.pbxproj");
const infoPlistPath = path.join(root, "ios", "Reflekt", "Info.plist");
const androidGradlePath = path.join(root, "android", "app", "build.gradle");

const read = (file) => fs.readFileSync(file, "utf8");
const writeIfChanged = (file, next) => {
  const current = fs.existsSync(file) ? read(file) : "";
  if (current === next) return false;
  fs.writeFileSync(file, next);
  return true;
};

const appConfig = JSON.parse(read(appJsonPath)).expo;
const versionName = String(appConfig.version || "").trim();
const iosBuildNumber = String(appConfig.ios?.buildNumber || "").trim();
const androidVersionCode = Number(appConfig.android?.versionCode);

if (!versionName) {
  throw new Error("Missing expo.version in app.json");
}

if (!iosBuildNumber) {
  throw new Error("Missing expo.ios.buildNumber in app.json");
}

if (!Number.isInteger(androidVersionCode) || androidVersionCode < 1) {
  throw new Error("Missing or invalid expo.android.versionCode in app.json");
}

const touched = [];

if (fs.existsSync(pbxprojPath)) {
  let pbxproj = read(pbxprojPath);
  pbxproj = pbxproj.replace(
    /CURRENT_PROJECT_VERSION = [^;]+;/g,
    `CURRENT_PROJECT_VERSION = ${iosBuildNumber};`,
  );
  pbxproj = pbxproj.replace(
    /MARKETING_VERSION = [^;]+;/g,
    `MARKETING_VERSION = ${versionName};`,
  );
  if (writeIfChanged(pbxprojPath, pbxproj)) touched.push("ios project");
}

if (fs.existsSync(infoPlistPath)) {
  let plist = read(infoPlistPath);
  plist = plist.replace(
    /(<key>CFBundleShortVersionString<\/key>\s*<string>)[^<]*(<\/string>)/,
    `$1${versionName}$2`,
  );
  plist = plist.replace(
    /(<key>CFBundleVersion<\/key>\s*<string>)[^<]*(<\/string>)/,
    `$1${iosBuildNumber}$2`,
  );
  if (writeIfChanged(infoPlistPath, plist)) touched.push("ios Info.plist");
}

if (fs.existsSync(androidGradlePath)) {
  let gradle = read(androidGradlePath);
  gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${androidVersionCode}`);
  gradle = gradle.replace(/versionName\s+["'][^"']+["']/, `versionName "${versionName}"`);
  if (writeIfChanged(androidGradlePath, gradle)) touched.push("android gradle");
}

console.log(
  `Synced native versions from app.json: version ${versionName}, iOS build ${iosBuildNumber}, Android versionCode ${androidVersionCode}.`,
);

if (touched.length > 0) {
  console.log(`Updated ${touched.join(", ")}.`);
} else {
  console.log("Native versions were already in sync.");
}
