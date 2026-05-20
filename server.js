import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadDotEnv();

const config = {
  port: Number.parseInt(process.env.PORT || "8080", 10) || 8080,
  publicBaseUrl: process.env.PUBLIC_BASE_URL || "http://localhost:8080",
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || "",
  allowedTelegramUsers: parseAllowedUsers(process.env.TELEGRAM_ALLOWED_USERS || ""),
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.0-flash",
  agentTickMinutes: Number(process.env.AGENT_TICK_MINUTES || 1)
};

const paths = {
  agentsDir: path.join(__dirname, "agents"),
  dataDir: path.join(__dirname, "data"),
  tasksFile: path.join(__dirname, "data", "tasks.json"),
  publicDir: path.join(__dirname, "public")
};

const clients = new Set();
let telegramOffset = 0;
let telegramRunning = false;
let agentProcessing = false;

process.on("uncaughtException", (error) => {
  console.error("uncaughtException", error);
});

process.on("unhandledRejection", (error) => {
  console.error("unhandledRejection", error);
});

await ensureStorage();

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (url.pathname === "/health") return sendJson(res, { ok: true, service: "gwc-agents" });
    if (url.pathname === "/api/events") return handleEvents(req, res);
    if (url.pathname === "/api/state") return sendJson(res, await buildState());
    if (url.pathname === "/api/tasks" && req.method === "POST") return createTaskFromHttp(req, res);
    if (url.pathname.startsWith("/api/tasks/") && req.method === "PATCH") return patchTaskFromHttp(req, res, url);
    if (url.pathname === "/api/agents") return sendJson(res, { agents: await loadAgents() });

    return serveStatic(url.pathname, res);
  } catch (error) {
    console.error(error);
    sendJson(res, { error: "Server error", detail: error.message }, 500);
  }
});

server.listen(config.port, () => {
  console.log(`Dashboard: ${config.publicBaseUrl}`);
  console.log(config.telegramToken ? "Telegram polling enabled" : "Telegram polling disabled; set TELEGRAM_BOT_TOKEN");
});

setInterval(() => {
  processPendingTasks().catch((error) => console.error("agent tick failed", error));
}, Math.max(1, config.agentTickMinutes) * 60 * 1000);

processPendingTasks().catch((error) => console.error("initial agent tick failed", error));

if (config.telegramToken) {
  pollTelegram().catch((error) => console.error("telegram poll failed", error));
}

function loadDotEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function parseAllowedUsers(value) {
  return new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

async function ensureStorage() {
  await mkdir(paths.agentsDir, { recursive: true });
  await mkdir(paths.dataDir, { recursive: true });
  if (!existsSync(paths.tasksFile)) {
    await writeJson(paths.tasksFile, { tasks: [] });
  }
}

async function buildState() {
  const [agents, taskData] = await Promise.all([loadAgents(), readTasks()]);
  return {
    agents,
    tasks: taskData.tasks.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)),
    config: {
      dashboardUrl: config.publicBaseUrl,
      telegramEnabled: Boolean(config.telegramToken),
      geminiEnabled: Boolean(config.geminiApiKey),
      agentTickMinutes: config.agentTickMinutes
    }
  };
}

async function loadAgents() {
  const files = (await readdir(paths.agentsDir)).filter((file) => file.toLowerCase().endsWith(".md") && !file.startsWith("_"));
  const agents = [];
  for (const file of files) {
    const fullPath = path.join(paths.agentsDir, file);
    const markdown = await readFile(fullPath, "utf8");
    const name = path.basename(file, ".md");
    agents.push({
      id: normalizeAgentId(name),
      name,
      file,
      title: extractFirstHeading(markdown) || name,
      summary: extractSection(markdown, "Role").slice(0, 280),
      markdown
    });
  }
  return agents.sort((a, b) => a.name.localeCompare(b.name));
}

async function loadSharedContext() {
  const files = (await readdir(paths.agentsDir)).filter((file) => file.toLowerCase().endsWith(".md") && file.startsWith("_"));
  const sections = [];
  for (const file of files.sort()) {
    sections.push(await readFile(path.join(paths.agentsDir, file), "utf8"));
  }
  return sections.join("\n\n---\n\n").trim();
}

function extractFirstHeading(markdown) {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() || "";
}

function extractSection(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim().toLowerCase() === `## ${heading}`.toLowerCase());
  if (start === -1) return "";

  const section = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("## ")) break;
    section.push(line);
  }
  return section.join("\n").trim();
}

function normalizeAgentId(value) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

async function readTasks() {
  return JSON.parse(await readFile(paths.tasksFile, "utf8"));
}

async function writeTasks(data) {
  await writeJson(paths.tasksFile, data);
  broadcast(await buildState());
}

async function writeJson(filePath, data) {
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

async function createTask({ agentId, title, createdBy = "dashboard", source = "dashboard", telegramChatId = null }) {
  const agents = await loadAgents();
  const agent = findAgent(agents, agentId);
  if (!agent) throw new Error(`Agent not found: ${agentId}`);

  const now = new Date().toISOString();
  const task = {
    id: `TASK-${Date.now().toString(36).toUpperCase()}`,
    agentId: agent.id,
    agentName: agent.name,
    title,
    status: "queued",
    createdBy,
    source,
    telegramChatId,
    updates: [{ at: now, by: createdBy, message: "Task created" }],
    result: "",
    createdAt: now,
    updatedAt: now
  };

  const data = await readTasks();
  data.tasks.push(task);
  await writeTasks(data);
  notifyTelegram(task, `New task assigned to @${agent.name}: ${title}`).catch(console.error);
  setTimeout(() => processPendingTasks().catch((error) => console.error("agent trigger failed", error)), 100);
  return task;
}

function findAgent(agents, value) {
  const target = normalizeAgentId(String(value || "").replace(/^@/, ""));
  return agents.find((agent) => agent.id === target || normalizeAgentId(agent.name) === target);
}

async function updateTask(taskId, patch, by = "system") {
  const data = await readTasks();
  const task = data.tasks.find((item) => item.id === taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  Object.assign(task, patch);
  task.updatedAt = new Date().toISOString();
  if (patch.note) {
    task.updates.push({ at: task.updatedAt, by, message: patch.note });
    delete task.note;
  }
  await writeTasks(data);
  return task;
}

async function processPendingTasks() {
  if (agentProcessing) return;
  agentProcessing = true;
  try {
  const data = await readTasks();
  const next = data.tasks.find((task) => task.status === "queued");
  if (!next) return;

  await updateTask(next.id, { status: "working", note: "Agent started work" }, next.agentName);

  const agents = await loadAgents();
  const agent = findAgent(agents, next.agentId);
  if (!agent) {
    await updateTask(next.id, { status: "blocked", note: "Assigned agent file is missing" }, "system");
    return;
  }

  try {
    const result = await runAgentWithGemini(agent, next, agents);
    await updateTask(next.id, {
      status: "review",
      result,
      note: "Agent completed draft and moved task to review"
    }, agent.name);
    await notifyTelegram(next, `@${agent.name} finished ${next.id}. Review on dashboard: ${config.publicBaseUrl}`);
  } catch (error) {
    await updateTask(next.id, { status: "blocked", note: `Agent error: ${error.message}` }, "system");
    await notifyTelegram(next, `${next.id} is blocked: ${error.message}`);
  }
  } finally {
    agentProcessing = false;
  }
}

async function runAgentWithGemini(agent, task, agents) {
  const sharedContext = await loadSharedContext();
  const collaborationMap = agents.map((item) => `- @${item.name}: ${item.summary || "No role summary yet."}`).join("\n");
  const prompt = [
    "You are an execution agent in a business operating system. Your job is to complete the assigned task, not merely discuss it.",
    "Use the markdown context as your durable memory and operating manual.",
    "Critical rule: produce the finished deliverable requested by the task. Do not refuse, defer, or transfer the task just because another role could help.",
    "If the task asks for an Instagram post, caption, ad, script, report, checklist, design brief, customer reply, or plan, output that actual artifact in usable form.",
    "Mention other agents only in a final 'Optional handoff' section, and only after you have completed your own deliverable.",
    "Never say 'the Graphic Designer should do this' or 'Marketing should do this' as the main answer. If you are assigned the task, do the best complete version yourself.",
    "If details are missing, make reasonable assumptions and clearly label them instead of stopping.",
    "",
    `Current agent: @${agent.name}`,
    "",
    "Available agents:",
    collaborationMap,
    "",
    "Shared company context:",
    sharedContext || "No shared company context file has been added yet.",
    "",
    "Agent markdown context:",
    agent.markdown,
    "",
    "Assigned task:",
    task.title,
    "",
    "Required response format:",
    "1. Deliverable: the finished work product the user can use immediately.",
    "2. Assumptions: only if needed.",
    "3. Optional handoff: only if another existing dashboard agent truly needs a follow-up task.",
    "",
    "Keep the answer practical. Avoid generic advice. Do not output only a status update."
  ].join("\n");

  if (!config.geminiApiKey) {
    return [
      "Gemini is not connected yet, so this is a placeholder agent output.",
      "",
      `Task understood by @${agent.name}: ${task.title}`,
      "",
      "Next setup step: add GEMINI_API_KEY in .env to enable real agent reasoning.",
      "",
      "Suggested handoff: mention another @AgentName in the task when collaboration is needed."
    ].join("\n");
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.geminiModel)}:generateContent?key=${encodeURIComponent(config.geminiApiKey)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 1200 }
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gemini request failed: ${response.status} ${detail.slice(0, 300)}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim() || "No Gemini output returned.";
}

async function createTaskFromHttp(req, res) {
  const body = await readRequestJson(req);
  const task = await createTask({
    agentId: body.agentId,
    title: body.title,
    createdBy: body.createdBy || "dashboard",
    source: "dashboard"
  });
  sendJson(res, { task }, 201);
}

async function patchTaskFromHttp(req, res, url) {
  const taskId = decodeURIComponent(url.pathname.split("/").pop());
  const body = await readRequestJson(req);
  const task = await updateTask(taskId, body, body.by || "dashboard");
  sendJson(res, { task });
}

function handleEvents(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });
  clients.add(res);
  buildState().then((state) => sendEvent(res, state)).catch(console.error);
  req.on("close", () => clients.delete(res));
}

function broadcast(state) {
  for (const client of clients) sendEvent(client, state);
}

function sendEvent(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function serveStatic(urlPath, res) {
  const safePath = urlPath === "/" ? "/index.html" : urlPath;
  const filePath = path.normalize(path.join(paths.publicDir, safePath));
  if (!filePath.startsWith(paths.publicDir)) return sendText(res, "Not found", 404);

  try {
    const body = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const type = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8"
    }[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(body);
  } catch {
    sendText(res, "Not found", 404);
  }
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function sendText(res, text, status = 200) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

async function readRequestJson(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
}

async function pollTelegram() {
  if (telegramRunning) return;
  telegramRunning = true;
  while (true) {
    try {
      const updates = await telegramApi("getUpdates", {
        offset: telegramOffset + 1,
        timeout: 25,
        allowed_updates: ["message"]
      });
      for (const update of updates.result || []) {
        telegramOffset = update.update_id;
        if (update.message?.text) await handleTelegramMessage(update.message);
      }
    } catch (error) {
      console.error("telegram polling error", error.message);
      await sleep(5000);
    }
  }
}

async function handleTelegramMessage(message) {
  const chatId = message.chat.id;
  const userId = String(message.from?.id || "");
  const text = message.text.trim();

  if (!isTelegramAllowed(userId)) {
    await telegramSend(chatId, `Access locked. Add your Telegram user ID to TELEGRAM_ALLOWED_USERS: ${userId}`);
    return;
  }

  if (text === "/help" || text === "/start") {
    await telegramSend(chatId, [
      "Working agents ready.",
      "",
      "/agents",
      "/assign @AgentName Task details",
      "/tasks",
      "/task TASK-ID",
      "/done TASK-ID Optional note"
    ].join("\n"));
    return;
  }

  if (text === "/agents") {
    const agents = await loadAgents();
    await telegramSend(chatId, agents.map((agent) => `@${agent.name} - ${agent.summary || "No role summary yet."}`).join("\n\n"));
    return;
  }

  if (text.startsWith("/assign ")) {
    const match = text.match(/^\/assign\s+@?([A-Za-z0-9_-]+)\s+([\s\S]+)$/);
    if (!match) {
      await telegramSend(chatId, "Use: /assign @AgentName Task details");
      return;
    }
    const task = await createTask({
      agentId: match[1],
      title: match[2].trim(),
      createdBy: `telegram:${userId}`,
      source: "telegram",
      telegramChatId: chatId
    });
    await telegramSend(chatId, `Assigned ${task.id} to @${task.agentName}. Dashboard: ${config.publicBaseUrl}`);
    return;
  }

  if (text === "/tasks") {
    const data = await readTasks();
    const lines = data.tasks.slice(-10).reverse().map((task) => `${task.id} [${task.status}] @${task.agentName}: ${task.title}`);
    await telegramSend(chatId, lines.join("\n") || "No tasks yet.");
    return;
  }

  if (text.startsWith("/task ")) {
    const taskId = text.split(/\s+/)[1];
    const data = await readTasks();
    const task = data.tasks.find((item) => item.id === taskId);
    await telegramSend(chatId, task ? formatTask(task) : `Task not found: ${taskId}`);
    return;
  }

  if (text.startsWith("/done ")) {
    const [, taskId, ...noteParts] = text.split(/\s+/);
    const task = await updateTask(taskId, { status: "done", note: noteParts.join(" ") || "Marked done from Telegram" }, `telegram:${userId}`);
    await telegramSend(chatId, `Done: ${task.id}`);
    return;
  }

  await telegramSend(chatId, "Unknown command. Send /help");
}

function isTelegramAllowed(userId) {
  return config.allowedTelegramUsers.size > 0 && config.allowedTelegramUsers.has(userId);
}

function formatTask(task) {
  return [
    `${task.id} [${task.status}]`,
    `Agent: @${task.agentName}`,
    `Task: ${task.title}`,
    task.result ? `\nResult:\n${task.result}` : "",
    `\nDashboard: ${config.publicBaseUrl}`
  ].filter(Boolean).join("\n");
}

async function notifyTelegram(task, text) {
  if (!config.telegramToken || !task.telegramChatId) return;
  await telegramSend(task.telegramChatId, text);
}

async function telegramSend(chatId, text) {
  if (!config.telegramToken) return;
  await telegramApi("sendMessage", { chat_id: chatId, text: text.slice(0, 3900) });
}

async function telegramApi(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${config.telegramToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`Telegram ${method} failed: ${response.status} ${await response.text()}`);
  return response.json();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
