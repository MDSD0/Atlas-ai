import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [metadataArg, releaseArg, expectedTag] = process.argv.slice(2);

assert.ok(metadataArg, "latest.json path is required");
assert.ok(releaseArg, "GitHub release JSON path is required");
assert.ok(expectedTag, "expected release tag is required");

const metadataPath = resolve(metadataArg);
const releasePath = resolve(releaseArg);
const parseJsonFile = (path) =>
  JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
const metadata = parseJsonFile(metadataPath);
const release = parseJsonFile(releasePath);

assert.equal(release.tag_name, expectedTag, "release tag does not match");
assert.equal(release.draft, false, "release must be public before rewriting metadata");
assert.ok(metadata.platforms && typeof metadata.platforms === "object");

const assetsByApiUrl = new Map(
  release.assets.map((asset) => [asset.url, asset.browser_download_url]),
);

for (const [platform, entry] of Object.entries(metadata.platforms)) {
  assert.ok(entry && typeof entry === "object", `invalid ${platform} updater entry`);
  assert.ok(entry.signature, `missing ${platform} updater signature`);
  const publicUrl = assetsByApiUrl.get(entry.url) ?? entry.url;
  assert.match(
    publicUrl,
    new RegExp(`/releases/download/${expectedTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`),
    `${platform} updater URL is not a public tagged download`,
  );
  entry.url = publicUrl;
}

writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

console.log(JSON.stringify({
  status: "passed",
  tag: expectedTag,
  platforms: Object.keys(metadata.platforms),
}, null, 2));
