#!/usr/bin/env node
// Script to fetch Logseq marketplace plugin package details from GitHub
// Usage: node fetch-logseq-marketplace.js
// Output: logseq-marketplace-plugins.json

import fetch from "node-fetch";
import fs from "fs";
import sharp from "sharp";
import path from "path";

const OUTPUT_DIR = "src/data";
const OUTPUT_FILE = "logseq-marketplace-plugins.json";

const LOGSEQ_MARKETPLACE_PACKAGES_URL =
  "https://api.github.com/repos/logseq/marketplace/contents/packages";

  const COMMITS_API =
    "https://api.github.com/repos/logseq/marketplace/commits?path=packages";

  const RAW_LOGSEQ_MARKETPLACE_PACKAGES_URL =
  "https://raw.githubusercontent.com/logseq/marketplace/master/packages";

// Parse command line arguments for verbose flag, max, and help
const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(
    `Usage: node update-catalog-index.js [--max <number>] [--verbose|-v] [--help|-h]\n\nOptions:\n  --max <number>   Limit the number of packages processed\n  --verbose, -v    Enable verbose logging\n  --help, -h       Show this help message`
  );
  process.exit(0);
}
const verbose = args.includes("--verbose") || args.includes("-v");
let maxItems;
const maxIdx = args.indexOf("--max");
if (maxIdx !== -1 && args.length > maxIdx + 1) {
  const val = parseInt(args[maxIdx + 1], 10);
  if (!isNaN(val) && val > 0) maxItems = val;
}

main();

/**
 * Main entry point for the script. Fetches all packages, processes them, and writes the output file.
 * Handles command line arguments for verbosity and max items.
 * @async
 * @returns {Promise<void>}
 */
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

      const details = await retrievePackageDetails(pkg);
      if (details.error) {
        console.error(`Error processing package "${pkg.name}":`, details.error);
        continue;
      }

      results.push(details);

      count++;
      process.stdout.write("."); // Add this line to write a '.' to the console
      if (count % 10 === 0) {
        console.log(`Processed ${count} packages...`);
      }
      if (maxItems && count >= maxItems) {
        console.log(`Processed ${count} packages. Stopping early.`);
        break;
      }
    }
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log("Fetched", results.length, `plugins. Output: ${outputPath}`);
  } catch (e) {
    console.error(e);
  }
}

/**
 * Fetches and processes details for a single Logseq plugin package.
 *
 * @async
 * @param {Object} pkg - The package object containing basic information.
 * @param {string} pkg.name - The name of the package.
 * @param {string} pkg.type - The type of the package (expected to be "dir").
 * @returns {Promise<Object>} An object containing the processed package details, including:
 *   - name: The name of the package (from manifest or fallback to pkg.name)
 *   - id: The package ID (if available in manifest)
 *   - description: The package description (if available in manifest)
 *   - author: The package author (if available in manifest)
 *   - repo: The package repository (if available in manifest)
 *   - version: The package version (if available in manifest)
 *   - dir: The package directory name
 *   - iconUrl: The URL of the package icon (if available)
 *   - created_at: The creation date of the package
 *   - last_updated: The last update date of the package
 *   - error: Error message if manifest.json is not found
 * @throws {Error} If there's an error fetching or processing the package details.
 */
async function retrievePackageDetails(pkg, results) {
  const manifest = await fetchManifest(pkg.name);
  const commitDates = await fetchCommitDates(pkg.name);
  if (manifest) {
    const localIconUrl = await fetchAndStoreIcon(manifest, pkg.name);
    return {
      name: manifest.name || pkg.name,
      id: manifest.id || "",
      description: manifest.description || "",
      author: manifest.author || "",
      repo: manifest.repo || "",
      version: manifest.version || "",
      dir: pkg.name,
      iconUrl: localIconUrl || "",
      created_at: commitDates.created_at,
      last_updated: commitDates.last_updated,
    };
  } else {
    return {
      name: pkg.name,
      error: "No manifest.json",
      iconUrl: "",
      created_at: commitDates.created_at,
      last_updated: commitDates.last_updated,
    };
  }
}

/**
 * Fetches the list of Logseq marketplace packages from GitHub.
 * @async
 * @returns {Promise<Array>} Array of package objects from the GitHub API.
 * @throws {Error} If the fetch fails or the response is not OK.
 */
async function fetchPackages() {
  console.log("Fetching package list from GitHub...");
  const res = await fetch(LOGSEQ_MARKETPLACE_PACKAGES_URL, {headers: getGithubHeaders()});
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

/**
 * Fetches the manifest.json for a given package from the Logseq marketplace repo.
 * @async
 * @param {string} packageName - The name of the package.
 * @returns {Promise<Object|null>} The manifest object, or null if not found or error.
 */
async function fetchManifest(packageName) {
  const url = `${RAW_LOGSEQ_MARKETPLACE_PACKAGES_URL}/${packageName}/manifest.json`;
  try {
    const res = await fetch(url, {headers: getGithubHeaders()});
    if (!res.ok) {
      console.log(`No manifest.json for ${packageName}`);
      return null;
    }
    const manifest = await res.json();

    // console.log(`Fetched manifest for ${packageName}`);
    return manifest;
  } catch (err) {
    console.log(`Error fetching manifest for ${packageName}:`, err);
    return null;
  }
}

/**
 * Fetches and stores the icon for a Logseq plugin.
 *
 * @async
 * @param {Object} manifest - The manifest object of the plugin.
 * @param {string} packageName - The name of the package/plugin.
 * @returns {Promise<string|undefined>} The local URL of the stored icon, or undefined if no icon was stored.
 * @throws {Error} If there's an error fetching or processing the icon.
 */
async function fetchAndStoreIcon(manifest, packageName) {
  let localIconUrl;
  if (manifest.icon) {
    const remoteIconUrl = getRemoteIconUrl(packageName, manifest);
    const localIconDir = path.resolve("public/icons");
    if (!fs.existsSync(localIconDir)) {
      fs.mkdirSync(localIconDir, {recursive: true});
    }
    const ext = path.extname(manifest.icon).toLowerCase() || ".png";
    let localIconName, localIconPath;
    try {
      const iconRes = await fetch(remoteIconUrl);
      if (!iconRes.ok) {
        console.error(
          `Icon fetch failed for ${packageName}: ${remoteIconUrl} (status: ${iconRes.status} ${iconRes.statusText})`
        );
        manifest.iconUrl = "";
      } else if (ext === ".svg") {
        // Save SVG as-is
        localIconName = `${packageName}.svg`;
        localIconPath = path.join(localIconDir, localIconName);
        localIconUrl = `/icons/${localIconName}`;
        const svgBuffer = Buffer.from(await iconRes.arrayBuffer());
        fs.writeFileSync(localIconPath, svgBuffer);
        // manifest.iconUrl = localIconUrl;
      } else {
        // Convert to PNG and update extension
        localIconName = `${packageName}.png`;
        localIconPath = path.join(localIconDir, localIconName);
        localIconUrl = `/icons/${localIconName}`;
        const buffer = await iconRes.arrayBuffer();
        await sharp(Buffer.from(buffer))
          .resize(32, 32)
          .png()
          .toFile(localIconPath);
        // manifest.iconUrl = localIconUrl;
      }
    } catch (iconErr) {
      console.error(
        `Error fetching or processing icon for ${packageName}: ${remoteIconUrl}`,
        iconErr
      );
      manifest.iconUrl = "";
    }
  } else {
    manifest.iconUrl = "";
  }
  return localIconUrl;
}

// Fetch commit dates for a package directory
/**
 * Fetches commit dates for a package directory from the GitHub API.
 * @async
 * @param {string} packageName - The name of the package.
 * @returns {Promise<{created_at: string, last_updated: string}>} Object with creation and last update dates.
 */
async function fetchCommitDates(packageName) {
  const commitsApi = `${COMMITS_API}/${packageName}&per_page=100`;
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

/**
 * Returns headers for GitHub API requests, including authorization if GITHUB_TOKEN is set.
 * @returns {Object} Headers object for fetch requests.
 */
function getGithubHeaders() {
  const headers = {Accept: "application/vnd.github.v3+json"};
  if (process.env.GITHUB_TOKEN) {
    headers["Authorization"] = `token ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}


/**
 * Constructs the remote icon URL for a given package and manifest.
 * @param {string} packageName - The name of the package.
 * @param {Object} manifest - The manifest object containing the icon filename.
 * @returns {string} The remote icon URL.
 */
function getRemoteIconUrl(packageName, manifest) {
  return `${RAW_LOGSEQ_MARKETPLACE_PACKAGES_URL}/${packageName}/${manifest.icon}`;
}

// Export principal functions for testing
export const logseqMarketplace = {
  fetchPackages,
  fetchManifest,
  fetchCommitDates,
  fetchPackageDetails: retrievePackageDetails,
  fetchAndStoreIcon,
  getRemoteIconUrl,
};
