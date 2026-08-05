const STORAGE = {
  custom: "oe-radar-custom-v1",
  overrides: "oe-radar-overrides-v1",
  hidden: "oe-radar-hidden-v1",
  cache: "oe-radar-feed-cache-v1",
  view: "oe-radar-view-v1",
};

const STATUSES = ["New", "Shortlisted", "Preparing", "Applied", "Interviewing", "Offer", "Closed", "Archived"];
const TRACKS = [
  "Creative Leadership",
  "Motion Design",
  "Experiential / Immersive",
  "Audiovisual Communications",
  "Video / Content Production",
  "Broadcast / Real-time",
  "VFX Leadership",
  "AI Motion",
  "Technical Visualisation",
  "Other",
];
const PIPELINE_STATUSES = ["New", "Shortlisted", "Preparing", "Applied", "Interviewing", "Offer"];

const state = {
  feed: [],
  custom: readStorage(STORAGE.custom, []),
  overrides: readStorage(STORAGE.overrides, {}),
  hidden: new Set(readStorage(STORAGE.hidden, [])),
  view: localStorage.getItem(STORAGE.view) || "cards",
  query: "",
  priority: "all",
  track: "all",
  status: "all",
  sort: "score",
  generatedAt: null,
};

const elements = {
  feedStatus: document.querySelector("#feedStatus"),
  recommendedCount: document.querySelector("#recommendedCount"),
  applicationCount: document.querySelector("#applicationCount"),
  progressCount: document.querySelector("#progressCount"),
  closingCount: document.querySelector("#closingCount"),
  searchInput: document.querySelector("#searchInput"),
  priorityFilter: document.querySelector("#priorityFilter"),
  trackFilter: document.querySelector("#trackFilter"),
  statusFilter: document.querySelector("#statusFilter"),
  sortSelect: document.querySelector("#sortSelect"),
  resultSummary: document.querySelector("#resultSummary"),
  cardsView: document.querySelector("#cardsView"),
  pipelineView: document.querySelector("#pipelineView"),
  emptyState: document.querySelector("#emptyState"),
  jobDialog: document.querySelector("#jobDialog"),
  jobForm: document.querySelector("#jobForm"),
  dataDialog: document.querySelector("#dataDialog"),
  toast: document.querySelector("#toast"),
};

function readStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function uid() {
  return `custom-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function safe(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cleanUrl(value = "") {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function clampScore(value) {
  return Math.min(100, Math.max(0, Number(value) || 0));
}

function priorityFor(job) {
  if (job.hardGap) return "Watch";
  const score = clampScore(job.score);
  if (score >= 76) return "Apply";
  if (score >= 62) return "Consider";
  if (score >= 50) return "Stretch";
  return "Watch";
}

function normaliseJob(job, origin = "feed") {
  const role = job.role || job.title || "Untitled role";
  const employer = job.employer || job.company || "Unknown employer";
  const dateFound = job.dateFound || job.date_found || new Date().toISOString().slice(0, 10);
  const id = String(job.id || `${origin}-${slugify(`${employer}-${role}-${dateFound}`)}`);
  const normalised = {
    id,
    role,
    employer,
    location: job.location || "Location not stated",
    workMode: job.workMode || job.work_mode || "Unclear",
    contract: job.contract || "Not stated",
    salary: job.salary || "Not stated",
    deadline: job.deadline || "",
    score: clampScore(job.score ?? 55),
    track: TRACKS.includes(job.track) ? job.track : "Other",
    fit: job.fit || "Review the full description against the target profile.",
    risks: job.risks || "Confirm location, compensation and language requirements.",
    cv: job.cv || "Select after reviewing the role",
    status: STATUSES.includes(job.status) ? job.status : "New",
    nextAction: job.nextAction || job.next_action || "Review the original listing",
    dateFound,
    lastChecked: job.lastChecked || job.last_checked || dateFound,
    publishedAt: job.publishedAt || job.published_at || "",
    url: cleanUrl(job.url || job.sourceUrl || job.source_url || ""),
    active: job.active !== false,
    notes: job.notes || "",
    source: job.source || (origin === "feed" ? "Public feed" : "Manual"),
    hardGap: Boolean(job.hardGap || job.hard_gap),
    origin: job.origin || origin,
  };
  normalised.priority = priorityFor(normalised);
  return normalised;
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

function allJobs() {
  const feedIds = new Set(state.feed.map((job) => job.id));
  const currentFeed = state.feed.map((job) => normaliseJob({ ...job, ...(state.overrides[job.id] || {}) }, "feed"));
  const preservedOverrides = Object.values(state.overrides)
    .filter((job) => !feedIds.has(job.id))
    .map((job) => normaliseJob(job, "feed"));
  const custom = state.custom.map((job) => normaliseJob(job, job.origin || "custom"));
  return [...currentFeed, ...preservedOverrides, ...custom]
    .filter((job) => !state.hidden.has(job.id))
    .filter((job, index, rows) => rows.findIndex((candidate) => candidate.id === job.id) === index);
}

function filteredJobs() {
  const query = state.query.trim().toLowerCase();
  const rows = allJobs().filter((job) => {
    const haystack = [job.role, job.employer, job.location, job.track, job.fit, job.risks, job.notes].join(" ").toLowerCase();
    return (!query || haystack.includes(query))
      && (state.priority === "all" || job.priority === state.priority)
      && (state.track === "all" || job.track === state.track)
      && (state.status === "all" || job.status === state.status);
  });

  return rows.sort((a, b) => {
    if (state.sort === "newest") return dateNumber(b.dateFound) - dateNumber(a.dateFound);
    if (state.sort === "deadline") return deadlineNumber(a.deadline) - deadlineNumber(b.deadline);
    if (state.sort === "company") return a.employer.localeCompare(b.employer);
    return b.score - a.score || dateNumber(b.dateFound) - dateNumber(a.dateFound);
  });
}

function dateNumber(value) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function deadlineNumber(value) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
}

function daysUntil(value) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((timestamp - today.getTime()) / 86400000);
}

function formatDate(value) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) return "No deadline";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(timestamp);
}

function optionMarkup(options, selected) {
  return options.map((option) => `<option value="${safe(option)}"${option === selected ? " selected" : ""}>${safe(option)}</option>`).join("");
}

function renderCard(job) {
  const deadline = daysUntil(job.deadline);
  const deadlineLabel = deadline === null ? "No deadline" : deadline < 0 ? "Deadline passed" : deadline === 0 ? "Closes today" : `${deadline} day${deadline === 1 ? "" : "s"} left`;
  const sourceLink = job.url
    ? `<a class="tiny-button" href="${safe(job.url)}" target="_blank" rel="noreferrer">Original ↗</a>`
    : "";
  return `
    <article class="job-card" data-priority="${safe(job.priority)}" data-job-id="${safe(job.id)}">
      <div class="card-top"><span class="priority-pill">${safe(job.priority)}</span><span class="score">${job.score}<small>/100</small></span></div>
      <h3>${safe(job.role)}</h3>
      <p class="employer">${safe(job.employer)}</p>
      <div class="card-meta">
        <span>${safe(job.location)}</span><span>${safe(job.workMode)}</span><span>${safe(job.track)}</span><span title="${safe(formatDate(job.deadline))}">${safe(deadlineLabel)}</span>
      </div>
      <p class="fit-copy">${safe(job.fit)}</p>
      ${job.risks ? `<p class="risk-line"><strong>Check:</strong> ${safe(job.risks)}</p>` : ""}
      <div class="card-footer">
        <select class="status-select" data-status-id="${safe(job.id)}" aria-label="Status for ${safe(job.role)}">${optionMarkup(STATUSES, job.status)}</select>
        <div class="card-actions">${sourceLink}<button class="tiny-button" type="button" data-edit-id="${safe(job.id)}">Edit</button><button class="tiny-button" type="button" data-delete-id="${safe(job.id)}" aria-label="Remove ${safe(job.role)}">×</button></div>
      </div>
    </article>`;
}

function renderPipeline(rows) {
  const columns = [...PIPELINE_STATUSES];
  if (rows.some((job) => ["Closed", "Archived"].includes(job.status))) columns.push("Closed / Archived");
  elements.pipelineView.innerHTML = columns.map((column) => {
    const jobs = rows.filter((job) => column === "Closed / Archived" ? ["Closed", "Archived"].includes(job.status) : job.status === column);
    return `<section class="pipeline-column"><div class="pipeline-heading"><span>${safe(column)}</span><span class="pipeline-count">${jobs.length}</span></div>${jobs.map((job) => `
      <article class="pipeline-card" data-edit-id="${safe(job.id)}" tabindex="0" role="button" aria-label="Edit ${safe(job.role)}">
        <strong>${safe(job.role)}</strong><span>${safe(job.employer)}</span><small>${job.score}/100 · ${safe(job.priority)}</small>
      </article>`).join("")}</section>`;
  }).join("");
}

function render() {
  const rows = filteredJobs();
  const total = allJobs();
  elements.cardsView.innerHTML = rows.map(renderCard).join("");
  renderPipeline(rows);
  elements.resultSummary.textContent = `${rows.length} of ${total.length} opportunit${total.length === 1 ? "y" : "ies"} shown`;
  elements.emptyState.hidden = rows.length > 0;
  elements.cardsView.hidden = state.view !== "cards" || rows.length === 0;
  elements.pipelineView.hidden = state.view !== "pipeline" || rows.length === 0;
  document.querySelectorAll(".view-button").forEach((button) => button.classList.toggle("is-active", button.dataset.view === state.view));

  const active = total.filter((job) => !["Closed", "Archived"].includes(job.status));
  elements.recommendedCount.textContent = active.filter((job) => ["Apply", "Consider"].includes(job.priority)).length;
  elements.applicationCount.textContent = total.filter((job) => ["Applied", "Interviewing", "Offer"].includes(job.status)).length;
  elements.progressCount.textContent = total.filter((job) => ["Preparing", "Interviewing"].includes(job.status)).length;
  elements.closingCount.textContent = active.filter((job) => {
    const days = daysUntil(job.deadline);
    return days !== null && days >= 0 && days <= 7;
  }).length;
}

function populateSelects() {
  elements.trackFilter.insertAdjacentHTML("beforeend", optionMarkup(TRACKS, ""));
  elements.statusFilter.insertAdjacentHTML("beforeend", optionMarkup(STATUSES, ""));
  document.querySelector("#jobTrack").innerHTML = optionMarkup(TRACKS, "Motion Design");
  document.querySelector("#jobStatus").innerHTML = optionMarkup(STATUSES, "New");
}

function saveJob(job) {
  if (job.origin === "custom" || job.origin === "imported" || job.id.startsWith("custom-")) {
    const index = state.custom.findIndex((candidate) => candidate.id === job.id);
    if (index >= 0) state.custom[index] = job;
    else state.custom.push(job);
    writeStorage(STORAGE.custom, state.custom);
  } else {
    state.overrides[job.id] = job;
    writeStorage(STORAGE.overrides, state.overrides);
  }
  render();
}

function updateStatus(id, status) {
  const job = allJobs().find((candidate) => candidate.id === id);
  if (!job || !STATUSES.includes(status)) return;
  job.status = status;
  job.lastChecked = new Date().toISOString().slice(0, 10);
  saveJob(job);
  toast(`Moved to ${status}`);
}

function openJobDialog(job = null) {
  elements.jobForm.reset();
  document.querySelector("#jobDialogTitle").textContent = job ? "Edit opportunity" : "Add opportunity";
  document.querySelector("#jobId").value = job?.id || "";
  document.querySelector("#jobRole").value = job?.role || "";
  document.querySelector("#jobEmployer").value = job?.employer || "";
  document.querySelector("#jobLocation").value = job?.location || "";
  document.querySelector("#jobWorkMode").value = job?.workMode || "Remote";
  document.querySelector("#jobTrack").value = job?.track || "Motion Design";
  document.querySelector("#jobScore").value = job?.score ?? 70;
  document.querySelector("#jobStatus").value = job?.status || "New";
  document.querySelector("#jobDeadline").value = job?.deadline || "";
  document.querySelector("#jobUrl").value = job?.url || "";
  document.querySelector("#jobFit").value = job?.fit || "";
  document.querySelector("#jobRisks").value = job?.risks || "";
  document.querySelector("#jobNotes").value = job?.notes || "";
  elements.jobDialog.showModal();
}

function formToJob() {
  const data = new FormData(elements.jobForm);
  const id = String(data.get("id") || "");
  const existing = id ? allJobs().find((job) => job.id === id) : null;
  return normaliseJob({
    ...(existing || {}),
    id: id || uid(),
    role: data.get("role"),
    employer: data.get("employer"),
    location: data.get("location"),
    workMode: data.get("workMode"),
    track: data.get("track"),
    score: data.get("score"),
    status: data.get("status"),
    deadline: data.get("deadline"),
    url: data.get("url"),
    fit: data.get("fit"),
    risks: data.get("risks"),
    notes: data.get("notes"),
    dateFound: existing?.dateFound || new Date().toISOString().slice(0, 10),
    lastChecked: new Date().toISOString().slice(0, 10),
    origin: existing?.origin || "custom",
    source: existing?.source || "Manual",
  }, existing?.origin || "custom");
}

function deleteJob(id) {
  const job = allJobs().find((candidate) => candidate.id === id);
  if (!job || !confirm(`Remove “${job.role}” from this browser?`)) return;
  state.custom = state.custom.filter((candidate) => candidate.id !== id);
  delete state.overrides[id];
  state.hidden.add(id);
  writeStorage(STORAGE.custom, state.custom);
  writeStorage(STORAGE.overrides, state.overrides);
  writeStorage(STORAGE.hidden, [...state.hidden]);
  render();
  toast("Opportunity removed");
}

function download(filename, contents, type) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportJson() {
  const payload = { exportedAt: new Date().toISOString(), profile: "Ovidiu Eftimie", jobs: allJobs() };
  download(`ovidiu-job-tracker-${today()}.json`, JSON.stringify(payload, null, 2), "application/json");
  toast("JSON export downloaded");
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function exportCsv() {
  const fields = ["priority", "score", "track", "role", "employer", "location", "workMode", "contract", "salary", "deadline", "fit", "risks", "cv", "status", "nextAction", "dateFound", "lastChecked", "url", "active", "notes", "source"];
  const rows = [fields.join(","), ...allJobs().map((job) => fields.map((field) => csvCell(job[field])).join(","))];
  download(`ovidiu-job-tracker-${today()}.csv`, rows.join("\n"), "text/csv;charset=utf-8");
  toast("CSV export downloaded");
}

function parseCsv(text) {
  const rows = [];
  let row = [], value = "", quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') { value += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(value); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value); if (row.some(Boolean)) rows.push(row); row = []; value = "";
    } else value += char;
  }
  row.push(value); if (row.some(Boolean)) rows.push(row);
  const [headers = [], ...data] = rows;
  return data.map((cells) => Object.fromEntries(headers.map((header, index) => [header.trim(), cells[index] ?? ""])));
}

async function importFile(file) {
  const text = await file.text();
  let jobs;
  if (file.name.toLowerCase().endsWith(".json")) {
    const parsed = JSON.parse(text);
    jobs = Array.isArray(parsed) ? parsed : parsed.jobs;
  } else jobs = parseCsv(text);
  if (!Array.isArray(jobs)) throw new Error("No jobs array found");
  const imported = jobs.map((job) => normaliseJob({ ...job, id: job.id || uid(), origin: "imported" }, "imported"));
  for (const job of imported) {
    const index = state.custom.findIndex((candidate) => candidate.id === job.id);
    if (index >= 0) state.custom[index] = job;
    else state.custom.push(job);
    state.hidden.delete(job.id);
  }
  writeStorage(STORAGE.custom, state.custom);
  writeStorage(STORAGE.hidden, [...state.hidden]);
  render();
  toast(`${imported.length} opportunit${imported.length === 1 ? "y" : "ies"} imported`);
}

function today() { return new Date().toISOString().slice(0, 10); }

let toastTimer;
function toast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  toastTimer = setTimeout(() => elements.toast.classList.remove("is-visible"), 2600);
}

function clearFilters() {
  state.query = ""; state.priority = "all"; state.track = "all"; state.status = "all"; state.sort = "score";
  elements.searchInput.value = ""; elements.priorityFilter.value = "all"; elements.trackFilter.value = "all"; elements.statusFilter.value = "all"; elements.sortSelect.value = "score";
  render();
}

function bindEvents() {
  document.querySelector("#addJobButton").addEventListener("click", () => openJobDialog());
  document.querySelector("#exportButton").addEventListener("click", () => elements.dataDialog.showModal());
  document.querySelector("#clearFiltersButton").addEventListener("click", clearFilters);
  document.querySelector("#exportJsonButton").addEventListener("click", exportJson);
  document.querySelector("#exportCsvButton").addEventListener("click", exportCsv);
  document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => document.querySelector(`#${button.dataset.closeDialog}`).close()));
  document.querySelectorAll(".view-button").forEach((button) => button.addEventListener("click", () => {
    state.view = button.dataset.view; localStorage.setItem(STORAGE.view, state.view); render();
  }));
  elements.searchInput.addEventListener("input", (event) => { state.query = event.target.value; render(); });
  elements.priorityFilter.addEventListener("change", (event) => { state.priority = event.target.value; render(); });
  elements.trackFilter.addEventListener("change", (event) => { state.track = event.target.value; render(); });
  elements.statusFilter.addEventListener("change", (event) => { state.status = event.target.value; render(); });
  elements.sortSelect.addEventListener("change", (event) => { state.sort = event.target.value; render(); });
  elements.jobForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveJob(formToJob());
    elements.jobDialog.close();
    toast("Opportunity saved in this browser");
  });
  document.addEventListener("change", (event) => {
    const id = event.target.dataset?.statusId;
    if (id) updateStatus(id, event.target.value);
  });
  document.addEventListener("click", (event) => {
    const editTarget = event.target.closest("[data-edit-id]");
    const deleteTarget = event.target.closest("[data-delete-id]");
    if (editTarget) {
      const job = allJobs().find((candidate) => candidate.id === editTarget.dataset.editId);
      if (job) openJobDialog(job);
    }
    if (deleteTarget) deleteJob(deleteTarget.dataset.deleteId);
  });
  document.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " ") && event.target.matches(".pipeline-card")) {
      event.preventDefault();
      const job = allJobs().find((candidate) => candidate.id === event.target.dataset.editId);
      if (job) openJobDialog(job);
    }
  });
  document.querySelector("#importInput").addEventListener("change", async (event) => {
    const [file] = event.target.files;
    if (!file) return;
    try { await importFile(file); elements.dataDialog.close(); }
    catch (error) { toast(`Import failed: ${error.message}`); }
    finally { event.target.value = ""; }
  });
}

async function loadFeed() {
  let payload;
  try {
    const response = await fetch(`./jobs.json?updated=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Feed returned ${response.status}`);
    payload = await response.json();
    writeStorage(STORAGE.cache, payload);
  } catch {
    payload = readStorage(STORAGE.cache, { jobs: [], generatedAt: null });
  }
  state.feed = (payload.jobs || []).map((job) => normaliseJob(job, "feed"));
  state.generatedAt = payload.generatedAt || payload.generated_at || null;
  if (state.generatedAt) {
    const formatted = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(Date.parse(state.generatedAt));
    elements.feedStatus.textContent = `Feed updated ${formatted}`;
  } else {
    elements.feedStatus.textContent = "Feed ready · run workflow for live roles";
  }
  render();
}

async function init() {
  populateSelects();
  bindEvents();
  render();
  await loadFeed();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./service-worker.js").catch(() => {});
}

init();
