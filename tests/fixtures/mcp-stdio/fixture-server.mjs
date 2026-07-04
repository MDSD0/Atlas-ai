import { createInterface } from "node:readline";

const lines = createInterface({ input: process.stdin });
let initialized = false;
let calls = 0;

for await (const line of lines) {
  const message = JSON.parse(line);
  if (message.method === "initialize") {
    reply(message.id, {
      protocolVersion: message.params.protocolVersion,
      capabilities: { tools: {} },
      serverInfo: { name: "atlas-mcp-fixture", version: "1.0.0" },
    });
    continue;
  }
  if (message.method === "notifications/initialized") {
    initialized = true;
    continue;
  }
  if (message.method === "tools/list") {
    if (!initialized) {
      fail(message.id, -32002, "fixture requires initialize before tools/list");
      continue;
    }
    reply(message.id, {
      tools: [
        {
          name: "echo",
          description: "Return the supplied arguments.",
          inputSchema: { type: "object", additionalProperties: true },
        },
        {
          name: "sleep",
          description: "Wait for a bounded fixture delay.",
          inputSchema: {
            type: "object",
            properties: { ms: { type: "number" } },
          },
        },
      ],
    });
    continue;
  }
  if (message.method === "tools/call") {
    if (!initialized) {
      fail(message.id, -32002, "fixture requires initialize before tools/call");
      continue;
    }
    calls += 1;
    const args = message.params.arguments;
    if (message.params.name === "sleep") {
      // Used by cancellation tests: delays the reply so a test can cancel
      // the call while it's still in flight.
      setTimeout(() => {
        reply(message.id, {
          content: [{ type: "text", text: "slept" }],
          structuredContent: { calls, arguments: args },
          isError: false,
        });
      }, Number(args?.ms) || 1000);
      continue;
    }
    reply(message.id, {
      content: [{ type: "text", text: JSON.stringify(args) }],
      structuredContent: { calls, arguments: args },
      isError: false,
    });
    continue;
  }
  if (message.id !== undefined) {
    fail(message.id, -32601, `unsupported fixture method: ${message.method}`);
  }
}

function reply(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

function fail(id, code, message) {
  process.stdout.write(
    `${JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })}\n`,
  );
}
