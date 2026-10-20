import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { asRelease, choosePlatform } from "../src/platform/index.js";
import { ReleaseNote } from "../src/shell/Shell.js";
import { fakeBridge } from "./fake-bridge.js";

afterEach(() => vi.unstubAllGlobals());

const health = (body: unknown, ok = true) =>
  vi.fn(
    async () => new Response(JSON.stringify(body), { status: ok ? 200 : 503 }),
  );

describe("asRelease", () => {
  it("reads with one v, and not at all for an empty value, dev or 0.0.0", () => {
    expect(asRelease("0.5.1")).toBe("v0.5.1");
    expect(asRelease("v0.5.1")).toBe("v0.5.1");
    expect(asRelease("")).toBeNull();
    expect(asRelease("dev")).toBeNull();
    expect(asRelease("0.0.0")).toBeNull();
    expect(asRelease(undefined)).toBeNull();
  });
});

describe("the web platform release", () => {
  it("is the server's version from /api/health, fetched once", async () => {
    const fetch = health({ ok: true, version: "v0.5.1" });
    vi.stubGlobal("fetch", fetch);
    const platform = choosePlatform(undefined);
    expect(await platform.releaseVersion()).toBe("v0.5.1");
    expect(await platform.releaseVersion()).toBe("v0.5.1");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/api/health");
  });

  it("is nothing for dev", async () => {
    vi.stubGlobal("fetch", health({ ok: true, version: "dev" }));
    expect(await choosePlatform(undefined).releaseVersion()).toBeNull();
  });

  it("is nothing on a failed request or an unhealthy answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("offline"))),
    );
    expect(await choosePlatform(undefined).releaseVersion()).toBeNull();
    vi.stubGlobal("fetch", health({ ok: false, version: "v0.5.1" }, false));
    expect(await choosePlatform(undefined).releaseVersion()).toBeNull();
  });
});

describe("the desktop platform release", () => {
  it("is the app's version with a v, and fetches nothing", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { bridge } = fakeBridge();
    const platform = choosePlatform({ promptbook: bridge });
    await platform.init();
    expect(await platform.releaseVersion()).toBe("v0.5.0");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("is nothing for 0.0.0", async () => {
    const { bridge } = fakeBridge();
    bridge.info = async () => ({
      ...(await fakeBridge().bridge.info()),
      version: "0.0.0",
    });
    const platform = choosePlatform({ promptbook: bridge });
    await platform.init();
    expect(await platform.releaseVersion()).toBeNull();
  });
});

describe("the rail note", () => {
  it("names the release for assistive technology and the tooltip", () => {
    const html = renderToStaticMarkup(
      createElement(ReleaseNote, { version: "v0.5.1" }),
    );
    expect(html).toContain('role="note"');
    expect(html).toContain('aria-label="Release v0.5.1"');
    expect(html).toContain('data-tip="Release v0.5.1"');
    expect(html).toContain(">v0.5.1<");
  });

  it("keeps its slot but shows nothing while unknown", () => {
    const html = renderToStaticMarkup(
      createElement(ReleaseNote, { version: null }),
    );
    expect(html).toBe('<div class="rail-version"></div>');
  });
});
