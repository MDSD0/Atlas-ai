import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => null),
  Channel: class {},
}));

import {
  decodeDdgUrl,
  extractReadableText,
  readBoundedResponse,
  stripTags,
} from "./web";
import { searchCapabilities } from "./capabilities";

describe("web tools", () => {
  it("decodes DuckDuckGo redirect URLs", () => {
    expect(
      decodeDdgUrl(
        "//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs%3Fq%3D1&rut=abc",
      ),
    ).toBe("https://example.com/docs?q=1");
    expect(decodeDdgUrl("https://direct.example.com/x")).toBe(
      "https://direct.example.com/x",
    );
    expect(decodeDdgUrl("//duckduckgo.com/plain")).toBe(
      "https://duckduckgo.com/plain",
    );
  });

  it("strips tags and entities", () => {
    expect(stripTags("<b>Hello</b> &amp; <i>world</i>&nbsp;!")).toBe(
      "Hello & world !",
    );
  });

  it("extracts readable text preferring main content", () => {
    const html = `<html><head><title>My Page</title><style>.x{}</style></head>
      <body><nav>menu junk</nav><main><h1>Title</h1><p>First para.</p>
      <script>evil()</script><p>Second para.</p></main><footer>foot</footer></body></html>`;
    const { title, text } = extractReadableText(html);
    expect(title).toBe("My Page");
    expect(text).toContain("First para.");
    expect(text).toContain("Second para.");
    expect(text).not.toContain("menu junk");
    expect(text).not.toContain("evil()");
  });

  it("is discoverable through the capability gateway", () => {
    const hits = searchCapabilities("search the web for documentation");
    expect(hits.some((c) => c.id === "web")).toBe(true);
  });

  it("routes visual preview checks to browser verification", () => {
    const hits = searchCapabilities("take a screenshot and verify the preview UI");
    expect(hits.some((c) => c.id === "browser_verification")).toBe(true);
  });
});

describe("readBoundedResponse", () => {
  it("cancels oversized responses after the byte budget", async () => {
    const response = new Response("abcdefghij");
    await expect(readBoundedResponse(response, 5)).resolves.toEqual({
      text: "abcde",
      truncated: true,
    });
  });
});
