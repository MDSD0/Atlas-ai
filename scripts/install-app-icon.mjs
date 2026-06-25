#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const source = process.argv[2] ? resolve(process.argv[2]) : "";
const iconsDir = join(root, "src-tauri", "icons");
const tmpDir = join(root, ".tmp", "app-icon");

if (!source || !existsSync(source)) {
  console.error("Usage: node scripts/install-app-icon.mjs /absolute/path/to/icon.png");
  process.exit(2);
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function write(path, data) {
  ensureDir(dirname(path));
  writeFileSync(path, data);
}

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: "pipe" });
}

function resize(src, dest, size) {
  run("sips", ["-z", String(size), String(size), src, "--out", dest]);
}

function makeIcns(master) {
  const iconset = join(tmpDir, "Atlas.iconset");
  rmSync(iconset, { recursive: true, force: true });
  ensureDir(iconset);
  for (const [name, size] of [
    ["icon_16x16.png", 16],
    ["icon_16x16@2x.png", 32],
    ["icon_32x32.png", 32],
    ["icon_32x32@2x.png", 64],
    ["icon_128x128.png", 128],
    ["icon_128x128@2x.png", 256],
    ["icon_256x256.png", 256],
    ["icon_256x256@2x.png", 512],
    ["icon_512x512.png", 512],
    ["icon_512x512@2x.png", 1024],
  ]) {
    resize(master, join(iconset, name), size);
  }
  run("iconutil", ["-c", "icns", iconset, "-o", join(iconsDir, "icon.icns")]);
}

function makeIco(master) {
  const png = readFileSync(master);
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(16);
  entry[0] = 0;
  entry[1] = 0;
  entry[2] = 0;
  entry[3] = 0;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(22, 12);

  write(join(iconsDir, "icon.ico"), Buffer.concat([header, entry, png]));
}

function cleanTopLevelIcons() {
  ensureDir(iconsDir);
  for (const name of [
    "32x32.png",
    "64x64.png",
    "128x128.png",
    "128x128@2x.png",
    "Square30x30Logo.png",
    "Square44x44Logo.png",
    "Square71x71Logo.png",
    "Square89x89Logo.png",
    "Square107x107Logo.png",
    "Square142x142Logo.png",
    "Square150x150Logo.png",
    "Square284x284Logo.png",
    "Square310x310Logo.png",
    "StoreLogo.png",
    "icon.png",
    "icon.icns",
    "icon.ico",
  ]) {
    rmSync(join(iconsDir, name), { force: true });
  }
}

function installAndroid(master) {
  for (const [density, size] of [
    ["mipmap-mdpi", 48],
    ["mipmap-hdpi", 72],
    ["mipmap-xhdpi", 96],
    ["mipmap-xxhdpi", 144],
    ["mipmap-xxxhdpi", 192],
  ]) {
    const dir = join(iconsDir, "android", density);
    for (const name of ["ic_launcher.png", "ic_launcher_foreground.png", "ic_launcher_round.png"]) {
      resize(master, join(dir, name), size);
    }
  }
}

function installIos(master) {
  const targets = {
    "AppIcon-20x20@1x.png": 20,
    "AppIcon-20x20@2x-1.png": 40,
    "AppIcon-20x20@2x.png": 40,
    "AppIcon-20x20@3x.png": 60,
    "AppIcon-29x29@1x.png": 29,
    "AppIcon-29x29@2x-1.png": 58,
    "AppIcon-29x29@2x.png": 58,
    "AppIcon-29x29@3x.png": 87,
    "AppIcon-40x40@1x.png": 40,
    "AppIcon-40x40@2x-1.png": 80,
    "AppIcon-40x40@2x.png": 80,
    "AppIcon-40x40@3x.png": 120,
    "AppIcon-60x60@2x.png": 120,
    "AppIcon-60x60@3x.png": 180,
    "AppIcon-76x76@1x.png": 76,
    "AppIcon-76x76@2x.png": 152,
    "AppIcon-83.5x83.5@2x.png": 167,
    "AppIcon-512@2x.png": 1024,
  };
  for (const [name, size] of Object.entries(targets)) {
    resize(master, join(iconsDir, "ios", name), size);
  }
}

rmSync(tmpDir, { recursive: true, force: true });
ensureDir(tmpDir);
cleanTopLevelIcons();

const master = join(iconsDir, "icon.png");
resize(source, master, 1024);

for (const [name, size] of [
  ["32x32.png", 32],
  ["64x64.png", 64],
  ["128x128.png", 128],
  ["128x128@2x.png", 256],
  ["Square30x30Logo.png", 30],
  ["Square44x44Logo.png", 44],
  ["Square71x71Logo.png", 71],
  ["Square89x89Logo.png", 89],
  ["Square107x107Logo.png", 107],
  ["Square142x142Logo.png", 142],
  ["Square150x150Logo.png", 150],
  ["Square284x284Logo.png", 284],
  ["Square310x310Logo.png", 310],
  ["StoreLogo.png", 50],
]) {
  resize(master, join(iconsDir, name), size);
}

makeIcns(master);
makeIco(master);
installAndroid(master);
installIos(master);

write(join(root, "public", "logo.png"), readFileSync(master));
write(join(root, "public", "logo-transparent.png"), readFileSync(master));
write(join(root, "dist", "logo.png"), readFileSync(master));
write(join(root, "dist", "logo-transparent.png"), readFileSync(master));

console.log(`Installed app icon from ${source}`);
