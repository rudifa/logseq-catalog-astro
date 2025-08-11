#!/usr/bin/env node
// Script to fetch Logseq marketplace plugin package details from GitHub
// Usage: node fetch-logseq-marketplace.js


import fetch from "node-fetch";
import fs from "fs";
import sharp from "sharp";
import path from "path";

const OUTPUT_DIR = "src/data";
const OUTPUT_FILE = "logseq-marketplace-plugins.json";

const GITHUB_API =
  "https://api.github.com/repos/logseq/marketplace/contents/packages";
const RAW_BASE =
  "https://raw.githubusercontent.com/logseq/marketplace/master/packages";

function getGithubHeaders() {
  const headers = {Accept: "application/vnd.github.v3+json"};
  if (process.env.GITHUB_TOKEN) {
    headers["Authorization"] = `token ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

async function fetchPackages() {
  console.log("Fetching package list from GitHub...");
  const res = await fetch(GITHUB_API, {headers: getGithubHeaders()});
  if (!res.ok) {
    let errorText = "";
    try {
      errorText = await res.text();
    } catch (e) {
      errorText = "(could not read error body)";
    }
    console.error(
      `Failed to fetch package list. Status: ${res.status} ${res.statusText}. Body: ${errorText}`
    );
    throw new Error("Failed to fetch package list");
  }
  const data = await res.json();
  console.log(`Found ${data.length} packages.`);
  return data;
}

async function fetchManifest(packageName) {
  const url = `${RAW_BASE}/${packageName}/manifest.json`;
  try {
    const res = await fetch(url, {headers: getGithubHeaders()});
    if (!res.ok) {
      console.log(`No manifest.json for ${packageName}`);
      return null;
    }
    const manifest = await res.json();
    // Add iconUrl if icon is present, using raw.githubusercontent.com for CORS compatibility
    if (manifest.icon) {
      const remoteIconUrl = `https://raw.githubusercontent.com/logseq/marketplace/master/packages/${packageName}/${manifest.icon}`;
      const localIconDir = path.resolve("public/icons");
      if (!fs.existsSync(localIconDir)) {
        fs.mkdirSync(localIconDir, { recursive: true });
      }
      const ext = path.extname(manifest.icon) || ".png";
      const localIconName = `${packageName}${ext}`;
      const localIconPath = path.join(localIconDir, localIconName);
      const localIconUrl = `/icons/${localIconName}`;
      try {
        const iconRes = await fetch(remoteIconUrl);
        if (!iconRes.ok) {
          console.error(`Icon fetch failed for ${packageName}: ${remoteIconUrl} (status: ${iconRes.status} ${iconRes.statusText})`);
          manifest.iconUrl = "";
        } else {
          const buffer = await iconRes.arrayBuffer();
          await sharp(Buffer.from(buffer))
            .resize(32, 32)
            .toFile(localIconPath);
          manifest.iconUrl = localIconUrl;
        }
      } catch (iconErr) {
        console.error(`Error fetching or resizing icon for ${packageName}: ${remoteIconUrl}`, iconErr);
        manifest.iconUrl = "";
      }
    } else {
      manifest.iconUrl = "";
    }
    console.log(`Fetched manifest for ${packageName}`);
    return manifest;
  } catch (err) {
    console.log(`Error fetching manifest for ${packageName}:`, err);
    return null;
  }
}

// Fetch commit dates for a package directory
async function fetchCommitDates(packageName) {
  const commitsApi = `https://api.github.com/repos/logseq/marketplace/commits?path=packages/${packageName}&per_page=100`;
  try {
    const res = await fetch(commitsApi, {headers: getGithubHeaders()});
    if (!res.ok) {
      console.log(`Could not fetch commits for ${packageName}`);
      return {created_at: "", last_updated: ""};
    }
    const commits = await res.json();
    if (!Array.isArray(commits) || commits.length === 0) {
      return {created_at: "", last_updated: ""};
    }
    // Commits are returned newest first
    const last_updated = commits[0]?.commit?.committer?.date || "";
    const created_at =
      commits[commits.length - 1]?.commit?.committer?.date || "";
    return {created_at, last_updated};
  } catch (err) {
    console.log(`Error fetching commit dates for ${packageName}:`, err);
    return {created_at: "", last_updated: ""};
  }
}

async function main() {
  try {
    if (!fs.existsSync(OUTPUT_DIR)) {
      console.error(`Output directory does not exist: ${OUTPUT_DIR}`);
      process.exit(1);
    }
    const outputPath = `${OUTPUT_DIR}/${OUTPUT_FILE}`;
    const packages = await fetchPackages();
    const results = [];
    let count = 0;
    for (const pkg of packages) {
      if (pkg.type !== "dir") continue;
      console.log(`Processing package: ${pkg.name}`);
      const manifest = await fetchManifest(pkg.name);
      const commitDates = await fetchCommitDates(pkg.name);
      if (manifest) {
        results.push({
          name: manifest.name || pkg.name,
          id: manifest.id || "",
          description: manifest.description || "",
          author: manifest.author || "",
          repo: manifest.repo || "",
          version: manifest.version || "",
          dir: pkg.name,
          iconUrl: manifest.iconUrl,
          created_at: commitDates.created_at,
          last_updated: commitDates.last_updated,
        });
      } else {
        results.push({
          name: pkg.name,
          error: "No manifest.json",
          iconUrl: "",
          created_at: commitDates.created_at,
          last_updated: commitDates.last_updated,
        });
      }
      count++;
      if (count % 10 === 0) {
        console.log(`Processed ${count} packages...`);
      }
    //   if (count >= 50) {
    //     console.log(`Processed ${count} packages. Stopping early.`);
    //     break;
    //   }
    }
    fs.writeFileSync(
      outputPath,
      JSON.stringify(results, null, 2)
    );
    console.log(
      "Fetched",
      results.length,
      `plugins. Output: ${outputPath}`
    );
  } catch (e) {
    console.error(e);
  }
}

main();
