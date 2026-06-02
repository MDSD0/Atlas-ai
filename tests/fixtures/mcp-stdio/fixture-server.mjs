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
  if (message.method === "tools/call") {
    if (!initialized) {
      fail(message.id, -32002, "fixture requires initialize before tools/call");
      continue;
    }
    calls += 1;
    reply(message.id, {
      content: [{ type: "text", text: JSON.stringify(message.params.arguments) }],
      structuredContent: { calls, arguments: message.params.arguments },
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
