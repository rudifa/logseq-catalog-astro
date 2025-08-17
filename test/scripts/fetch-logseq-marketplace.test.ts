import {describe, it, expect} from "vitest";
import {logseqMarketplace} from "../../scripts/fetch-logseq-marketplace.js";

describe("logseqMarketplace export object", () => {
  it("should export fetchPackages, fetchManifest, fetchCommitDates as functions", () => {
    expect(typeof logseqMarketplace.fetchPackages).toBe("function");
    expect(typeof logseqMarketplace.fetchManifest).toBe("function");
    expect(typeof logseqMarketplace.fetchCommitDates).toBe("function");
  });
});

describe("fetchPackages", () => {
  it("should fetch packages and log the JSON", async () => {
    const packages = await logseqMarketplace.fetchPackages();
    console.log("fetchPackages:", JSON.stringify(packages[0], null, 2));
    expect(packages.length).toBe(466);
    expect(packages[0].name).toEqual("block-pin");
    expect(packages[0].type).toEqual("dir");
    expect(packages[0].path).toEqual("packages/block-pin");
    expect(packages[0].html_url).toEqual(
      "https://github.com/logseq/marketplace/tree/master/packages/block-pin"
    );
    expect(packages[0].git_url).toEqual(
      "https://api.github.com/repos/logseq/marketplace/git/trees/366217e5ce5bff68f9c86e0092a774749f2ce1fd"
    );
  }, 3000);
});

describe("fetchManifest", () => {
  it("should fetch manifest and log the JSON", async () => {
    const manifest = await logseqMarketplace.fetchManifest("block-pin");
    console.log("fetchManifest:", JSON.stringify(manifest, null, 2));
    expect(manifest.title).toEqual("Block pin");
    expect(manifest.description).toEqual(
      'Add "Paste as pin" shortcut for pdf and editor blocks.'
    );
    expect(manifest.author).toEqual("Joodo <wyattliang@gmail.com>");
    expect(manifest.repo).toEqual("joodo/logseq-plugin-pin");
    expect(manifest.icon).toEqual("icon.png");
    expect(manifest.effect).toEqual(true);
    // expect(manifest.iconUrl).toEqual("/icons/block-pin.png"); not in manifest any more
  }, 3000);
});

describe("fetchCommitDates", () => {
  it("should fetch commit dates", async () => {
    const commitDates = await logseqMarketplace.fetchCommitDates("block-pin");
    console.log("fetchCommitDates:", JSON.stringify(commitDates, null, 2));
    expect(Object.keys(commitDates).length).toEqual(2);
    expect(commitDates.created_at).toEqual("2024-08-27T16:41:22Z");
    expect(commitDates.last_updated).toEqual("2024-08-29T01:37:02Z");
  }, 3000);
});

describe("fetchPackageDetails", async () => {
  const packages = await logseqMarketplace.fetchPackages();
  it("should fetch package details for package[0]", async () => {
    const details = await logseqMarketplace.fetchPackageDetails(packages[0]);
    console.log("fetchPackageDetails:", JSON.stringify(details, null, 2));
    expect(details.name).toEqual("block-pin");
    expect(details.description).toEqual(
      'Add "Paste as pin" shortcut for pdf and editor blocks.'
    );
    expect(details.author).toEqual("Joodo <wyattliang@gmail.com>");
    expect(details.repo).toEqual("joodo/logseq-plugin-pin");
    expect(details.dir).toEqual("block-pin");
    expect(details.iconUrl).toEqual("/icons/block-pin.png");
    expect(details.created_at).toEqual("2024-08-27T16:41:22Z");
    expect(details.last_updated).toEqual("2024-08-29T01:37:02Z");
  });
});

describe("getRemoteIconUrl", () => {
  it("should return the correct remote icon URL", async () => {
    const packageName = "block-pin";
    const manifest = {icon: "icon.png"};
    const expectedUrl =
      `https://raw.githubusercontent.com/logseq/marketplace/master/packages/` +
      `${packageName}/${manifest.icon}`;
    console.log("getRemoteIconUrl:", expectedUrl);
    expect(logseqMarketplace.getRemoteIconUrl(packageName, manifest)).toEqual(
      expectedUrl
    );
    const res = await fetch(expectedUrl);
    expect(res.status).toEqual(200);
  });
});
