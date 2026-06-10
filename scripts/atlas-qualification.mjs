import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = resolve(root, "runs", "atlas-qualification", runId);
mkdirSync(outDir, { recursive: true });

const flags = new Set(process.argv.slice(2));
const allowPaid = flags.has("--allow-paid");
const quick = flags.has("--quick");
const strict = flags.has("--strict");
const pnpm = isWin ? "pnpm.cmd" : "pnpm";
const gitBash = "C:\\Program Files\\Git\\bin\\bash.exe";
const bash = isWin && existsSync(gitBash) ? gitBash : "bash";
const matchingEdgeDriver = resolve(root, ".drivers", "msedgedriver-148.0.3967.96", "msedgedriver.exe");

const summary = {
  runId,
  startedAt: new Date().toISOString(),
  root,
  mode: {
    allowPaid,
    quick,
    strict,
    defaultPolicy: "No model generation or paid API calls unless --allow-paid is provided.",
  },
  phases: [],
  blockers: [],
  verdict: "unknown",
};

function safeName(name) {
  return name.replace(/[^a-z0-9_.-]+/gi, "_").slice(0, 96);
}

function writeJson(name, value) {
  writeFileSync(join(outDir, name), JSON.stringify(value, null, 2));
}

function redact(value) {
  if (!value) return null;
  const s = String(value);
  return s.length <= 12 ? `${s.slice(0, 2)}...${s.slice(-2)}` : `${s.slice(0, 7)}...${s.slice(-5)}`;
}

function readDotEnv() {
  const envPath = resolve(root, ".env");
  const parsed = {};
  if (!existsSync(envPath)) return parsed;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) parsed[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
  return parsed;
}

function addPhase(phase, fields) {
  const record = {
    phase,
    startedAt: new Date().toISOString(),
    status: fields.status ?? "recorded",
    rc: fields.rc ?? null,
    ...fields,
  };
  summary.phases.push(record);
  if (record.status === "blocked") summary.blockers.push({ phase, reason: record.reason });
  writeJson("summary.json", summary);
  return record;
}

async function commandExists(command) {
  return new Promise((resolveExists) => {
    const child = spawn(isWin ? "where.exe" : "sh", isWin ? [command] : ["-lc", `command -v ${command}`], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.on("close", (code) => resolveExists(code === 0));
    child.on("error", () => resolveExists(false));
  });
}

async function findFreePort() {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") resolvePort(address.port);
        else reject(new Error("No port allocated"));
      });
    });
    server.on("error", reject);
  });
}

function killProcessTree(child) {
  if (!child || child.killed || child.exitCode !== null) return;
  if (isWin && child.pid) {
    spawn("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  child.kill("SIGTERM");
}

async function waitFor(description, fn, timeoutMs = 30_000, intervalMs = 250) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError}` : ""}`);
}

async function waitForHttp(url, timeoutMs = 45_000) {
  return waitFor(url, async () => {
    const res = await fetch(url).catch(() => null);
    return !!res && res.status < 500;
  }, timeoutMs, 500);
}

function startMockOpenAiServer(logPath) {
  const requests = [];
  let chatTurn = 0;
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let body = {};
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        body = { raw };
      }
      requests.push({
        at: new Date().toISOString(),
        url: req.url,
        method: req.method,
        body,
      });
      writeFileSync(logPath, JSON.stringify(requests, null, 2));

      if (req.url === "/v1/models") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ object: "list", data: [{ id: "atlas-gui-mock", object: "model" }] }));
        return;
      }
      if (req.url !== "/v1/chat/completions") {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "not found" }));
        return;
      }

      chatTurn += 1;
      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      const send = (payload) => res.write(`data: ${JSON.stringify(payload)}\n\n`);
      const done = () => {
        res.write("data: [DONE]\n\n");
        res.end();
      };
      if (chatTurn === 1) {
        send({
          id: "atlas-gui-mock-1",
          object: "chat.completion.chunk",
          choices: [{
            index: 0,
            delta: {
              role: "assistant",
              tool_calls: [{
                index: 0,
                id: "call_write_probe",
                type: "function",
                function: {
                  name: "write_file",
                  arguments: JSON.stringify({
                    path: "atlas_gui_probe.txt",
                    content: "atlas gui probe ok\n",
                  }),
                },
              }],
            },
            finish_reason: null,
          }],
        });
        send({ id: "atlas-gui-mock-1", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] });
        done();
        return;
      }
      if (chatTurn === 2) {
        send({
          id: "atlas-gui-mock-2",
          object: "chat.completion.chunk",
          choices: [{
            index: 0,
            delta: {
              role: "assistant",
              tool_calls: [{
                index: 0,
                id: "call_verify_probe",
                type: "function",
                function: {
                  name: "bash_run",
                  arguments: JSON.stringify({
                    command: "cmd.exe /c type atlas_gui_probe.txt",
                  }),
                },
              }],
            },
            finish_reason: null,
          }],
        });
        send({ id: "atlas-gui-mock-2", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] });
        done();
        return;
      }
      send({
        id: "atlas-gui-mock-3",
        object: "chat.completion.chunk",
        choices: [{
          index: 0,
          delta: { role: "assistant", content: "Verified with `cmd.exe /c type atlas_gui_probe.txt`. The file contains the expected text." },
          finish_reason: null,
        }],
      });
      send({
        id: "atlas-gui-mock-3",
        object: "chat.completion.chunk",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
      });
      done();
    });
  });

  return new Promise((resolveServer, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") resolveServer({ server, port: address.port, requests });
      else reject(new Error("Mock server did not bind to a TCP port"));
    });
    server.on("error", reject);
  });
}

async function webdriverRequest(port, sessionId, method, path, body) {
  const res = await fetch(`http://127.0.0.1:${port}${sessionId ? `/session/${sessionId}` : ""}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} -> HTTP ${res.status}: ${text.slice(0, 1000)}`);
  }
  return json.value ?? json;
}

function elementId(el) {
  return el?.["element-6066-11e4-a52e-4f735466cecf"] ?? el?.ELEMENT;
}

async function runRealDesktopUiPhase() {
  const phase = "real_desktop_ui.webdriver";
  const startedAt = Date.now();
  const stdoutPath = join(outDir, `${phase}.stdout.log`);
  const stderrPath = join(outDir, `${phase}.stderr.log`);
  const artifactPath = join(outDir, "real-desktop-ui-artifacts.json");
  const mockLogPath = join(outDir, "real-desktop-ui-mock-requests.json");
  const viteStdout = join(outDir, "real-desktop-ui-vite.stdout.log");
  const viteStderr = join(outDir, "real-desktop-ui-vite.stderr.log");
  const driverStdout = join(outDir, "real-desktop-ui-tauri-driver.stdout.log");
  const driverStderr = join(outDir, "real-desktop-ui-tauri-driver.stderr.log");
  const projectDir = join(outDir, "project");
  const probeFile = join(projectDir, "atlas_gui_probe.txt");
  const appDataRoaming = process.env.APPDATA ?? join(outDir, "appdata", "Roaming");
  const appDataLocal = process.env.LOCALAPPDATA ?? join(outDir, "appdata", "Local");
  const atlasDataDir = join(appDataRoaming, "app.terax.atlas");
  const appDataBackupDir = join(outDir, "appdata-backup");
  const proofStorePath = join(atlasDataDir, "atlas-ai-proof-receipts.json");
  const traceStorePath = join(atlasDataDir, "atlas-ai-session-traces.json");
  const appDebug = resolve(root, "src-tauri", "target", "debug", "atlas.exe");
  const nativeDriver = existsSync(matchingEdgeDriver) ? matchingEdgeDriver : null;
  const tauriDriverPort = await findFreePort();
  const nativeDriverPort = await findFreePort();

  const record = {
    phase,
    kind: "real-atlas-ui",
    command: "tauri-driver + WebDriver protocol + debug atlas.exe + Vite dev server",
    cwd: root,
    startedAt: new Date().toISOString(),
    stdoutPath,
    stderrPath,
    paid: false,
    realAtlasUi: true,
    headlessShim: false,
    status: "running",
    rc: null,
    durationMs: null,
    artifactPath,
  };
  summary.phases.push(record);
  writeJson("summary.json", summary);

  const processes = [];
  let mock = null;
  let sessionId = null;
  let failure = null;
  let readProofEvidence = () => null;
  const storeFilesToRestore = [
    "atlas-settings.json",
    "atlas-ai-sessions.json",
    "atlas-ai-proof-receipts.json",
    "atlas-ai-session-traces.json",
  ];
  const storeBackups = new Map();
  try {
    if (!existsSync(appDebug)) {
      record.status = "blocked";
      record.reason = `Missing debug Atlas binary: ${appDebug}`;
      return record;
    }
    if (!nativeDriver) {
      record.status = "blocked";
      record.reason = `Missing matching Edge WebDriver: ${matchingEdgeDriver}`;
      return record;
    }

    rmSync(projectDir, { recursive: true, force: true });
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(atlasDataDir, { recursive: true });
    mkdirSync(appDataLocal, { recursive: true });
    mkdirSync(appDataBackupDir, { recursive: true });
    for (const file of storeFilesToRestore) {
      const target = join(atlasDataDir, file);
      const backup = join(appDataBackupDir, file);
      if (existsSync(target)) {
        const content = readFileSync(target);
        writeFileSync(backup, content);
        storeBackups.set(file, { existed: true, content });
      } else {
        storeBackups.set(file, { existed: false, content: null });
      }
    }
    writeFileSync(join(projectDir, "README.md"), "# Atlas GUI probe\n");
    mock = await startMockOpenAiServer(mockLogPath);
    writeFileSync(join(atlasDataDir, "atlas-settings.json"), JSON.stringify({
      defaultModelId: "openai-compatible-custom",
      openaiCompatibleBaseURL: `http://127.0.0.1:${mock.port}/v1`,
      openaiCompatibleModelId: "atlas-gui-mock",
      openaiCompatibleContextLimit: 32000,
      recentWorkspaces: [{
        path: projectDir,
        name: "project",
        addedAt: Date.now(),
      }],
    }, null, 2));
    writeFileSync(join(atlasDataDir, "atlas-ai-sessions.json"), JSON.stringify({}, null, 2));

    const env = {
      ...process.env,
      ATLAS_QUALIFICATION_RUN: "1",
    };
    const spawnTargetFor = (command, args) => {
      if (isWin && command.toLowerCase().endsWith(".cmd")) {
        return {
          command: "cmd.exe",
          args: [
            "/d",
            "/s",
            "/c",
            [command, ...args]
              .map((part) => {
                const s = String(part);
                return /[\s&()^|<>]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
              })
              .join(" "),
          ],
        };
      }
      return { command, args };
    };
    const startLoggedProcess = (command, args, stdoutFile, stderrFile) => {
      const target = spawnTargetFor(command, args);
      const child = spawn(target.command, target.args, { cwd: root, env, shell: false, windowsHide: true });
      processes.push(child);
      const out = [];
      const err = [];
      child.stdout.on("data", (chunk) => {
        out.push(Buffer.from(chunk));
        writeFileSync(stdoutFile, Buffer.concat(out));
      });
      child.stderr.on("data", (chunk) => {
        err.push(Buffer.from(chunk));
        writeFileSync(stderrFile, Buffer.concat(err));
      });
      return child;
    };

    const vite = startLoggedProcess(pnpm, ["exec", "vite", "--host", "127.0.0.1", "--port", "1420"], viteStdout, viteStderr);
    await waitForHttp("http://127.0.0.1:1420", 60_000);
    const driver = startLoggedProcess("tauri-driver", [
      "--port",
      String(tauriDriverPort),
      "--native-port",
      String(nativeDriverPort),
      "--native-driver",
      nativeDriver,
    ], driverStdout, driverStderr);
    await sleep(1200);

    const session = await webdriverRequest(tauriDriverPort, null, "POST", "/session", {
      capabilities: {
        alwaysMatch: {
          browserName: "tauri",
          "tauri:options": { application: appDebug },
        },
      },
    });
    sessionId = session.sessionId;

    await waitFor("Atlas document", async () => {
      const title = await webdriverRequest(tauriDriverPort, sessionId, "GET", "/title");
      return title === "Atlas";
    }, 45_000);

    await waitFor("seeded recent workspace", async () => {
      const clicked = await webdriverRequest(tauriDriverPort, sessionId, "POST", "/execute/sync", {
        script: "const target = arguments[0]; const node = Array.from(document.querySelectorAll('[data-testid=\"atlas-recent-workspace\"]')).find((el) => el.dataset.path === target); if (!node) return false; node.click(); return true;",
        args: [projectDir],
      }).catch(() => false);
      return clicked === true;
    }, 45_000);

    const input = await waitFor("Atlas AI input", async () => {
      const el = await webdriverRequest(tauriDriverPort, sessionId, "POST", "/element", {
        using: "css selector",
        value: "[data-testid='atlas-ai-input']",
      }).catch(() => null);
      return el || false;
    }, 45_000);
    await webdriverRequest(tauriDriverPort, sessionId, "POST", `/element/${elementId(input)}/click`, {});
    await webdriverRequest(tauriDriverPort, sessionId, "POST", `/element/${elementId(input)}/value`, {
      text: "Create atlas_gui_probe.txt containing exactly 'atlas gui probe ok', run a shell command to verify it, then finish.",
    });
    await webdriverRequest(tauriDriverPort, sessionId, "POST", `/element/${elementId(input)}/value`, {
      text: "\uE007",
    });

    readProofEvidence = () => {
      if (!existsSync(proofStorePath)) return null;
      let data;
      try {
        data = JSON.parse(readFileSync(proofStorePath, "utf8"));
      } catch {
        return null;
      }
      const runs = Object.values(data || {})
        .filter((run) => run && run.workspaceRoot === projectDir)
        .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
      for (const run of runs) {
        const events = Array.isArray(run.events) ? run.events : [];
        const previews = events
          .filter((event) => event.kind === "tool.finished")
          .map((event) => event.boundedPayload?.preview ?? "");
        const wrote = previews.some((preview) =>
          preview.includes('"toolName":"write_file"') &&
          preview.includes("atlas_gui_probe.txt") &&
          preview.includes('"ok":true'));
        const checked = previews.some((preview) =>
          preview.includes('"toolName":"bash_run"') &&
          preview.includes("cmd.exe /c type atlas_gui_probe.txt") &&
          preview.includes('"exit_code":0'));
        if (wrote && checked) {
          return {
            runId: run.id,
            status: run.status,
            eventCount: events.length,
            wrote,
            checked,
          };
        }
      }
      return null;
    };
    const readConversationEvidence = () => {
      const requests = mock?.requests ?? [];
      const toolMessages = requests.flatMap((request) =>
        Array.isArray(request.body?.messages)
          ? request.body.messages.filter((message) => message.role === "tool")
          : [],
      );
      const wrote = toolMessages.some((message) =>
        message.tool_call_id === "call_write_probe" &&
        typeof message.content === "string" &&
        message.content.includes("atlas_gui_probe.txt") &&
        message.content.includes('"ok":true'));
      const checked = toolMessages.some((message) =>
        message.tool_call_id === "call_verify_probe" &&
        typeof message.content === "string" &&
        message.content.includes("cmd.exe /c type atlas_gui_probe.txt") &&
        message.content.includes('"exit_code":0'));
      return { wrote, checked, toolResultCount: toolMessages.length };
    };
    const readTraceEvidence = () => {
      if (!existsSync(traceStorePath)) return null;
      let data;
      try {
        data = JSON.parse(readFileSync(traceStorePath, "utf8"));
      } catch {
        return null;
      }
      const traces = Object.entries(data || {})
        .filter(([key, value]) =>
          key.startsWith("trace:") &&
          value &&
          typeof value === "object" &&
          value.workspaceRoot === projectDir)
        .map(([, value]) => value)
        .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
      const events = traces.flatMap((trace) =>
        Array.isArray(trace.events)
          ? trace.events.map((event) => ({ trace, event }))
          : [],
      );
      const wrote = events.some(({ event }) => {
        const text = JSON.stringify(event.payload ?? {});
        return (event.type === "tool.called" || event.type === "tool.finished") &&
          text.includes('"toolName":"write_file"') &&
          text.includes("atlas_gui_probe.txt");
      });
      const checked = events.some(({ event }) => {
        const text = JSON.stringify(event.payload ?? {});
        return (
          event.type === "tool.called" ||
          event.type === "tool.finished" ||
          event.type === "agent.step"
        ) &&
          (text.includes('"toolName":"bash_run"') ||
            text.includes("Running cmd.exe /c type atlas_gui_probe.txt") ||
            text.includes("cmd.exe /c type atlas_gui_probe.txt"));
      });
      if (wrote && checked) {
        const latest = traces[0];
        return {
          runIds: traces.map((trace) => trace.runId),
          status: latest?.status ?? null,
          modelId: latest?.modelId ?? null,
          providerId: latest?.providerId ?? null,
          eventCount: events.length,
          totals: traces.reduce(
            (acc, trace) => ({
              inputTokens: acc.inputTokens + (trace.totals?.inputTokens ?? 0),
              outputTokens: acc.outputTokens + (trace.totals?.outputTokens ?? 0),
              cachedInputTokens: acc.cachedInputTokens + (trace.totals?.cachedInputTokens ?? 0),
              toolCalls: acc.toolCalls + (trace.totals?.toolCalls ?? 0),
              steps: acc.steps + (trace.totals?.steps ?? 0),
            }),
            { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, toolCalls: 0, steps: 0 },
          ),
          wrote,
          checked,
        };
      }
      return null;
    };

    const approvedIds = new Set();
    await waitFor("probe file, tool-result history, and session trace", async () => {
      const approvals = await webdriverRequest(tauriDriverPort, sessionId, "POST", "/elements", {
        using: "css selector",
        value: "[data-testid='atlas-approval-approve']",
      }).catch(() => []);
      for (const approval of approvals) {
        const id = elementId(approval);
        if (id && !approvedIds.has(id)) {
          approvedIds.add(id);
          await webdriverRequest(tauriDriverPort, sessionId, "POST", `/element/${id}/click`, {}).catch(() => null);
        }
      }
      const fileOk = existsSync(probeFile) && readFileSync(probeFile, "utf8") === "atlas gui probe ok\n";
      const conversationEvidence = readConversationEvidence();
      const traceEvidence = readTraceEvidence();
      return fileOk && conversationEvidence.wrote && conversationEvidence.checked && traceEvidence;
    }, 90_000, 500);

    const finalDom = await webdriverRequest(tauriDriverPort, sessionId, "POST", "/execute/sync", {
      script: "return { text: document.body.innerText.slice(0, 4000), receipt: !!document.querySelector('[data-testid=\"atlas-receipt-strip\"]'), project: document.querySelector('[data-testid=\"atlas-project-chip\"]')?.innerText ?? null };",
      args: [],
    });
    const artifact = {
      projectDir,
      probeFile,
      probeContent: readFileSync(probeFile, "utf8"),
      mockRequestCount: mock.requests.length,
      approvedCount: approvedIds.size,
      conversationEvidence: readConversationEvidence(),
      proofEvidence: readProofEvidence(),
      traceEvidence: readTraceEvidence(),
      receiptRendered: !!finalDom.receipt,
      finalDom,
      ports: { mock: mock.port, tauriDriver: tauriDriverPort, nativeDriver: nativeDriverPort },
      logs: { viteStdout, viteStderr, driverStdout, driverStderr, mockLogPath },
    };
    writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
    writeFileSync(stdoutPath, JSON.stringify(artifact, null, 2));
    writeFileSync(stderrPath, "");
    record.status = "passed";
    record.rc = 0;
    record.durationMs = Date.now() - startedAt;
    record.projectDir = projectDir;
    record.probeFile = probeFile;
    record.mockRequestCount = mock.requests.length;
    record.approvedCount = approvedIds.size;
    record.proofEvidence = readProofEvidence();
    record.traceEvidence = readTraceEvidence();
    record.receiptRendered = !!finalDom.receipt;
    if (!record.proofEvidence || !record.receiptRendered) {
      record.findings = [
        "Tool execution passed through the real GUI, but proof receipt evidence was not visible/persisted in this surface.",
      ];
    }
    return record;
  } catch (error) {
    failure = error;
    record.status = "failed";
    record.rc = 1;
    record.durationMs = Date.now() - startedAt;
    record.error = String(error);
    const failureDom = sessionId
      ? await webdriverRequest(tauriDriverPort, sessionId, "POST", "/execute/sync", {
          script: "return {title: document.title, text: document.body.innerText.slice(0, 4000), recents: Array.from(document.querySelectorAll('[data-testid=\"atlas-recent-workspace\"]')).map((el) => ({path: el.dataset.path, text: el.innerText}))};",
          args: [],
        }).catch((domError) => ({ error: String(domError) }))
      : null;
    const artifact = {
      projectDir,
      probeFile,
      probeExists: existsSync(probeFile),
      probeContent: existsSync(probeFile) ? readFileSync(probeFile, "utf8") : null,
      mockRequestCount: mock?.requests?.length ?? 0,
      proofEvidence: readProofEvidence(),
      traceEvidence: existsSync(traceStorePath)
        ? (() => {
            try {
              return JSON.parse(readFileSync(traceStorePath, "utf8"));
            } catch {
              return "unparseable";
            }
          })()
        : null,
      failureDom,
      error: String(error),
    };
    writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
    writeFileSync(stdoutPath, JSON.stringify(artifact, null, 2));
    writeFileSync(stderrPath, `${String(error)}\n${error?.stack ?? ""}`);
    return record;
  } finally {
    if (sessionId) {
      await webdriverRequest(tauriDriverPort, sessionId, "DELETE", "").catch(() => null);
    }
    if (mock) {
      await new Promise((resolveClose) => mock.server.close(resolveClose));
    }
    for (const child of processes.reverse()) killProcessTree(child);
    for (const file of storeFilesToRestore) {
      const backup = storeBackups.get(file);
      const target = join(atlasDataDir, file);
      if (!backup) continue;
      if (backup.existed) writeFileSync(target, backup.content);
      else rmSync(target, { force: true });
    }
    if (record.status === "blocked") {
      summary.blockers.push({ phase, reason: record.reason });
    }
    if (failure && record.status !== "failed") {
      record.status = "failed";
      record.rc = 1;
      record.error = String(failure);
    }
    writeJson("summary.json", summary);
  }
}

async function runCommand(phase, command, args, options = {}) {
  const startedAt = new Date();
  const name = safeName(phase);
  const stdoutPath = join(outDir, `${name}.stdout.log`);
  const stderrPath = join(outDir, `${name}.stderr.log`);
  const record = {
    phase,
    kind: options.kind ?? "command",
    command: [command, ...args].join(" "),
    cwd: options.cwd ?? root,
    startedAt: startedAt.toISOString(),
    stdoutPath,
    stderrPath,
    paid: Boolean(options.paid),
    realAtlasUi: Boolean(options.realAtlasUi),
    headlessShim: Boolean(options.headlessShim),
    status: "running",
    rc: null,
    durationMs: null,
  };
  summary.phases.push(record);
  writeJson("summary.json", summary);

  const stdout = [];
  const stderr = [];
  const spawnTarget = isWin && command.toLowerCase().endsWith(".cmd")
    ? {
        command: "cmd.exe",
        args: [
          "/d",
          "/s",
          "/c",
          [command, ...args]
            .map((part) => {
              const s = String(part);
              return /[\s&()^|<>]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
            })
            .join(" "),
        ],
      }
    : { command, args };

  await new Promise((resolveRun) => {
    const child = spawn(spawnTarget.command, spawnTarget.args, {
      cwd: record.cwd,
      env: { ...process.env, ...(options.env ?? {}) },
      shell: false,
    });
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", (error) => {
      stderr.push(Buffer.from(String(error)));
      record.rc = 127;
      resolveRun();
    });
    child.on("close", (code) => {
      record.rc = code ?? 1;
      resolveRun();
    });
  });

  record.durationMs = Date.now() - startedAt.getTime();
  record.status = record.rc === 0 ? "passed" : "failed";
  writeFileSync(stdoutPath, Buffer.concat(stdout));
  writeFileSync(stderrPath, Buffer.concat(stderr));
  writeJson("summary.json", summary);
  return record;
}

async function openRouterProbe(env) {
  const key =
    env.openrouter_paid_key ||
    env.OPENROUTER_PAID_KEY ||
    env.open_router_paid_key ||
    env.OPENROUTER_API_KEY ||
    env.open_router;
  if (!key) {
    addPhase("api.openrouter_key_probe", {
      kind: "api-probe",
      status: "blocked",
      paid: false,
      reason: "No OpenRouter key found in .env using paid-key aliases.",
    });
    return;
  }

  const started = Date.now();
  try {
    const res = await fetch("https://openrouter.ai/api/v1/key", {
      headers: {
        Authorization: `Bearer ${key}`,
        "HTTP-Referer": "http://localhost:1420",
        "X-Title": "AtlasQualification",
      },
    });
    const body = await res.text();
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = { raw: body.slice(0, 500) };
    }
    addPhase("api.openrouter_key_probe", {
      kind: "api-probe",
      status: res.ok ? "passed" : "failed",
      rc: res.ok ? 0 : res.status,
      durationMs: Date.now() - started,
      paid: false,
      keyFingerprint: redact(key),
      httpStatus: res.status,
      keyStatus: parsed?.data
        ? {
            isFreeTier: parsed.data.is_free_tier,
            usage: parsed.data.usage,
            limit: parsed.data.limit,
            limitRemaining: parsed.data.limit_remaining,
          }
        : parsed,
    });
  } catch (error) {
    addPhase("api.openrouter_key_probe", {
      kind: "api-probe",
      status: "failed",
      rc: 1,
      durationMs: Date.now() - started,
      paid: false,
      keyFingerprint: redact(key),
      error: String(error),
    });
  }
}

async function main() {
  const env = readDotEnv();

  addPhase("environment", {
    kind: "inventory",
    status: "recorded",
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    outDir,
  });

  await runCommand("git.status_porcelain", "git", ["status", "--short", "--branch"]);
  await runCommand(
    "tooling.where_core",
    isWin ? "where.exe" : "sh",
    isWin
      ? ["node", "pnpm", "cargo", "git", "bash", "docker", "tauri-driver", "msedgedriver", "chromedriver", "geckodriver"]
      : ["-lc", "command -v node pnpm cargo git bash docker tauri-driver msedgedriver chromedriver geckodriver"],
    { kind: "inventory" },
  );
  await openRouterProbe(env);

  await runCommand("source_parity_hook.raw", bash, ["scripts/consult-opensrc.sh", "tauri-driver", "mini-swe-agent", "opencode"], {
    kind: "source-parity",
  });
  await runCommand("desktop.static_contract", "node", ["scripts/desktop-smoke.mjs"], {
    kind: "static-contract",
  });
  await runCommand("frontend.typescript", pnpm, ["exec", "tsc", "--noEmit"], {
    kind: "verification",
  });
  await runCommand(
    "frontend.focused_vitest",
    pnpm,
    [
      "exec",
      "vitest",
      "run",
      "src/modules/ai/bench/tauriInvokeShim.test.ts",
      "src/modules/ai/tools/capabilities.test.ts",
      "src/modules/ai/components/receiptStrip.test.ts",
      "--reporter=basic",
    ],
    { kind: "verification" },
  );

  if (!quick) {
    await runCommand("native.git_worktree_tests", "cargo", [
      "test",
      "--locked",
      "--manifest-path",
      "src-tauri/Cargo.toml",
      "modules::git::operations::tests",
      "--",
      "--nocapture",
    ], { kind: "native-verification" });
  }

  const tauriDriver = await commandExists("tauri-driver");
  const edgeDriver = await commandExists("msedgedriver");
  const chromeDriver = await commandExists("chromedriver");
  const geckoDriver = await commandExists("geckodriver");
  if (!tauriDriver || (!edgeDriver && !chromeDriver && !geckoDriver && !existsSync(matchingEdgeDriver))) {
    addPhase("real_desktop_ui.webdriver", {
      kind: "real-atlas-ui",
      status: "blocked",
      realAtlasUi: true,
      headlessShim: false,
      paid: false,
      reason:
        "Real Atlas UI automation requires tauri-driver plus a platform WebDriver. Missing: " +
        [
          !tauriDriver ? "tauri-driver" : null,
          !edgeDriver && !chromeDriver && !geckoDriver && !existsSync(matchingEdgeDriver) ? "msedgedriver/chromedriver/geckodriver" : null,
        ].filter(Boolean).join(", "),
      nextCommand: "cargo install tauri-driver --locked; install matching Microsoft Edge WebDriver or ChromeDriver.",
    });
  } else {
    await runRealDesktopUiPhase();
  }

  if (allowPaid) {
    await runCommand(
      "headless_swebench_smoke.paid",
      pnpm,
      ["exec", "vitest", "run", "src/modules/ai/bench/sweBenchLite.test.ts", "--reporter=basic"],
      {
        kind: "paid-headless-benchmark",
        paid: true,
        headlessShim: true,
        env: {
          ATLAS_BENCH_RUN: "1",
          BENCH_PROVIDER: process.env.BENCH_PROVIDER ?? "openrouter",
          BENCH_MODEL: process.env.BENCH_MODEL ?? "google/gemini-2.5-flash",
          BENCH_INSTANCE_LIMIT: process.env.BENCH_INSTANCE_LIMIT ?? "1",
          BENCH_MAX_STEPS: process.env.BENCH_MAX_STEPS ?? "8",
          BENCH_MAX_OUTPUT_TOKENS: process.env.BENCH_MAX_OUTPUT_TOKENS ?? "512",
          REPO_INTEL: process.env.REPO_INTEL ?? "minimal",
        },
      },
    );
  } else {
    addPhase("headless_swebench_smoke.paid", {
      kind: "paid-headless-benchmark",
      status: "skipped",
      paid: true,
      headlessShim: true,
      reason: "Skipped by default. Re-run with --allow-paid only after the real desktop UI phase is passing.",
    });
  }

  const failed = summary.phases.filter((p) => p.status === "failed");
  const blocked = summary.phases.filter((p) => p.status === "blocked");
  summary.finishedAt = new Date().toISOString();
  summary.verdict =
    failed.length === 0 && blocked.length === 0
      ? "GO"
      : strict && (failed.length > 0 || blocked.length > 0)
        ? "NO_GO_STRICT"
        : "RECORDED_WITH_BLOCKERS";
  writeJson("summary.json", summary);

  const lines = [
    "# Atlas Qualification Report",
    "",
    `Run: ${runId}`,
    `Verdict: ${summary.verdict}`,
    `Output: ${outDir}`,
    "",
    "| phase | status | rc | kind | real UI | shim | paid |",
    "| --- | --- | ---: | --- | --- | --- | --- |",
    ...summary.phases.map((p) =>
      `| ${p.phase} | ${p.status} | ${p.rc ?? ""} | ${p.kind ?? ""} | ${p.realAtlasUi ? "yes" : "no"} | ${p.headlessShim ? "yes" : "no"} | ${p.paid ? "yes" : "no"} |`,
    ),
    "",
    "## Blockers",
    ...(summary.blockers.length ? summary.blockers.map((b) => `- ${b.phase}: ${b.reason}`) : ["- none"]),
    "",
    "## Failures",
    ...(failed.length
      ? failed.map((p) => `- ${p.phase}: RC=${p.rc}; stdout=${p.stdoutPath ?? ""}; stderr=${p.stderrPath ?? ""}`)
      : ["- none"]),
    "",
    "## Rule",
    "Headless shim benchmark results are useful for agent-loop regression only. They are not accepted as proof that the Atlas desktop UI/session/native boundary works.",
  ];
  writeFileSync(join(outDir, "report.md"), `${lines.join("\n")}\n`);
  console.log(JSON.stringify({
    runId,
    outDir,
    verdict: summary.verdict,
    phases: summary.phases.map((p) => ({
      phase: p.phase,
      status: p.status,
      rc: p.rc,
      realAtlasUi: Boolean(p.realAtlasUi),
      headlessShim: Boolean(p.headlessShim),
      paid: Boolean(p.paid),
    })),
  }, null, 2));

  if (strict && summary.verdict !== "GO") process.exit(1);
}

main().catch((error) => {
  addPhase("runner", {
    kind: "runner",
    status: "failed",
    rc: 1,
    error: String(error),
  });
  summary.finishedAt = new Date().toISOString();
  summary.verdict = "RUNNER_FAILED";
  writeJson("summary.json", summary);
  console.error(error);
  process.exit(1);
});
