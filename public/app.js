const state = {
  agents: [],
  tasks: [],
  config: {}
};

const statusEl = document.querySelector("#systemStatus");
const agentSelect = document.querySelector("#agentSelect");
const agentsEl = document.querySelector("#agents");
const assignForm = document.querySelector("#assignForm");
const taskInput = document.querySelector("#taskInput");
const taskDialog = document.querySelector("#taskDialog");
const taskDetail = document.querySelector("#taskDetail");

assignForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = taskInput.value.trim();
  if (!title) return;

  const response = await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentId: agentSelect.value, title })
  });
  if (!response.ok) {
    statusEl.textContent = "Could not assign task. Check server/API.";
    return;
  }
  taskInput.value = "";
  const stateResponse = await fetch("/api/state");
  Object.assign(state, await stateResponse.json());
  render();
});

const events = new EventSource("/api/events");
events.onmessage = (event) => {
  Object.assign(state, JSON.parse(event.data));
  render();
};
events.onerror = () => {
  statusEl.textContent = "Realtime connection interrupted. Reconnecting...";
};

fetch("/api/state")
  .then((response) => response.json())
  .then((data) => {
    Object.assign(state, data);
    render();
  })
  .catch(() => {
    statusEl.textContent = "Could not load agents. Make sure the server is running.";
  });

function render() {
  if (!state.agents.length) {
    statusEl.textContent = "No agents loaded. Check the agents folder and API.";
  }

  statusEl.textContent = [
    state.config.geminiEnabled ? "Gemini connected" : "Gemini not connected",
    state.config.telegramEnabled ? "Telegram enabled" : "Telegram disabled",
    `Agent tick: ${state.config.agentTickMinutes || 1} min`
  ].join(" | ");

  agentSelect.innerHTML = state.agents
    .map((agent) => `<option value="${escapeHtml(agent.id)}">@${escapeHtml(agent.name)}</option>`)
    .join("");

  agentsEl.innerHTML = state.agents
    .map((agent) => `
      <article class="agent">
        <strong>@${escapeHtml(agent.name)}</strong>
        <span>${escapeHtml(agent.summary || "Edit this agent markdown file to add role context.")}</span>
      </article>
    `)
    .join("");

  for (const status of ["queued", "working", "review", "done", "blocked"]) {
    const column = document.querySelector(`#${status}`);
    const tasks = state.tasks.filter((task) => task.status === status);
    column.innerHTML = tasks.map(renderTask).join("") || `<p class="empty">No ${status} tasks.</p>`;
  }

  document.querySelectorAll(".task").forEach((button) => {
    button.addEventListener("click", () => openTask(button.dataset.id));
  });
}

function renderTask(task) {
  return `
    <button class="task" data-id="${escapeHtml(task.id)}" data-status="${escapeHtml(task.status)}">
      <span class="taskId">${escapeHtml(task.id)} | @${escapeHtml(task.agentName)}</span>
      <strong class="taskTitle">${escapeHtml(task.title)}</strong>
      <span class="taskMeta">${formatDate(task.updatedAt)}</span>
    </button>
  `;
}

function openTask(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;

  const updates = task.updates
    .map((update) => `${formatDate(update.at)} - ${update.by}: ${update.message}`)
    .join("\n");

  taskDetail.innerHTML = `
    <h2>${escapeHtml(task.id)} | @${escapeHtml(task.agentName)}</h2>
    <p class="taskMeta">${escapeHtml(task.status)} | Created ${formatDate(task.createdAt)}</p>
    <h3>Task</h3>
    <div class="detailBlock">${escapeHtml(task.title)}</div>
    <h3>Result</h3>
    <div class="detailBlock">${escapeHtml(task.result || "No result yet.")}</div>
    <h3>Updates</h3>
    <div class="detailBlock">${escapeHtml(updates || "No updates yet.")}</div>
    <div class="dialogActions">
      <button data-action="done">Mark Done</button>
      <button data-action="queued">Requeue</button>
      <button data-action="blocked">Block</button>
    </div>
  `;

  taskDetail.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: button.dataset.action,
          note: `Marked ${button.dataset.action} from dashboard`
        })
      });
      taskDialog.close();
    });
  });

  taskDialog.showModal();
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
