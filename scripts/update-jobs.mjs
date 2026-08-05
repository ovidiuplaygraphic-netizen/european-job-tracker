import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const OUTPUT = new URL("../site/jobs.json", import.meta.url);
const TODAY = new Date().toISOString().slice(0, 10);
const MAX_JOBS = 40;
const RETENTION_DAYS = 14;

const TARGET_TITLE = /\b(creative director|design director|art director|head of (creative|design|motion|video|content)|motion (designer|design|graphics)|senior animator|3d animator|visual designer|multimedia designer|experiential designer|experience designer|immersive|creative technologist|video producer|creative producer|content producer|digital communications|audiovisual|audio visual|broadcast designer|broadcast graphics|real[- ]?time graphics|virtual production|vfx (supervisor|lead|producer)|visual effects|compositing (lead|supervisor)|technical artist|visuali[sz]ation|generative ai.*(design|creative|video)|ai.*motion)\b/i;
const EXCLUDE_TITLE = /\b(junior|intern(ship)?|trainee|student|graduate|apprentice|sales|account executive|software engineer|front[- ]?end|back[- ]?end|full[- ]?stack|product manager)\b/i;
const SENIORITY = /\b(senior|lead|principal|director|head|supervisor|manager)\b/i;
const EUROPE = /\b(europe|eu\b|eea|austria|belgium|bulgaria|croatia|cyprus|czech|denmark|estonia|finland|france|germany|greece|hungary|ireland|italy|latvia|lithuania|luxembourg|malta|netherlands|norway|poland|portugal|romania|slovakia|slovenia|spain|sweden|switzerland|iceland|liechtenstein|amsterdam|berlin|brussels|bucharest|copenhagen|dublin|helsinki|lisbon|madrid|munich|oslo|paris|prague|stockholm|vienna|warsaw|zurich)\b/i;
const UK = /\b(united kingdom|uk\b|england|london|manchester|scotland|wales)\b/i;
const SPONSORSHIP = /\b(visa sponsorship|sponsorship available|sponsor a visa|skilled worker visa)\b/i;
const FRENCH = /\bfrench\b/i;
const MANDATORY_FRENCH = /(fluent|native|professional|minimum|at least|b2|c1|c2).{0,35}french|french.{0,35}(fluent|native|professional|b2|c1|c2|required|mandatory|essential|must)/i;
const MANDATORY_OTHER_LANGUAGE = /(fluent|native|professional|minimum|at least|b2|c1|c2).{0,35}(german|dutch|spanish|italian|swedish|danish|norwegian|polish)|(german|dutch|spanish|italian|swedish|danish|norwegian|polish).{0,35}(fluent|native|professional|b2|c1|c2|required|mandatory|essential|must)/i;
const NATIVE_ENGLISH = /\b(native english|english native speaker|mother tongue english)\b/i;

const TRACK_RULES = [
  ["Creative Leadership", /\b(creative director|design director|art director|head of creative|head of design)\b/i],
  ["Experiential / Immersive", /\b(experiential|immersive|installation|experience designer|spatial|interactive exhibit)\b/i],
  ["Audiovisual Communications", /\b(digital communications|communications|audiovisual|audio visual|multimedia)\b/i],
  ["Video / Content Production", /\b(video producer|creative producer|content producer|video content|film producer)\b/i],
  ["Broadcast / Real-time", /\b(broadcast|real[- ]?time|virtual production|unreal engine|vizrt|notch)\b/i],
  ["VFX Leadership", /\b(vfx|visual effects|compositing|post[- ]production supervisor)\b/i],
  ["AI Motion", /\b(generative ai|genai|ai video|ai creative|synthetic media)\b/i],
  ["Technical Visualisation", /\b(technical artist|visuali[sz]ation|scientific visual|architectural visual)\b/i],
  ["Motion Design", /\b(motion|animation|animator|3d|visual designer|broadcast graphics)\b/i],
];

const TOOL_TERMS = /\b(after effects|cinema 4d|c4d|houdini|nuke|unreal engine|blender|maya|adobe creative cloud|premiere|davinci resolve|notch|touchdesigner|vizrt)\b/gi;
const SECTOR_TERMS = /\b(broadcast|advertising|agency|brand|entertainment|media|events|museum|culture|public sector|communications|technology)\b/gi;

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "Ovidiu-European-Opportunity-Radar/1.0" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function stripHtml(value = "") {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function isoDate(value) {
  if (!value) return TODAY;
  const numeric = typeof value === "number" && value < 1e12 ? value * 1000 : value;
  const date = new Date(numeric);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : TODAY;
}

function stableId(source, sourceId, employer, role) {
  const seed = `${source}:${sourceId || ""}:${employer}:${role}`.toLowerCase();
  return `${source.toLowerCase()}-${createHash("sha256").update(seed).digest("hex").slice(0, 16)}`;
}

function normaliseUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function fromJobicy(payload) {
  return (payload?.jobs || []).map((job) => ({
    sourceId: job.id,
    source: "Jobicy",
    role: job.jobTitle,
    employer: job.companyName,
    location: job.jobGeo || "Europe / remote",
    workMode: "Remote",
    contract: job.jobType || "Not stated",
    salary: salaryText(job.annualSalaryMin, job.annualSalaryMax, job.salaryCurrency),
    description: stripHtml(job.jobDescription || job.jobExcerpt),
    url: normaliseUrl(job.url),
    publishedAt: isoDate(job.pubDate),
    trustedEurope: true,
  }));
}

function fromArbeitnow(payload) {
  return (payload?.data || []).map((job) => ({
    sourceId: job.slug,
    source: "Arbeitnow",
    role: job.title,
    employer: job.company_name,
    location: job.location || "Location not stated",
    workMode: job.remote ? "Remote" : "On-site / hybrid",
    contract: Array.isArray(job.job_types) ? job.job_types.join(", ") : "Not stated",
    salary: "Not stated",
    description: stripHtml(job.description),
    url: normaliseUrl(job.url),
    publishedAt: isoDate(job.created_at),
    trustedEurope: EUROPE.test(job.location || ""),
  }));
}

function salaryText(min, max, currency) {
  if (!min && !max) return "Not stated";
  const format = (value) => Number(value).toLocaleString("en-GB");
  const range = min && max ? `${format(min)}–${format(max)}` : format(min || max);
  return `${currency || ""} ${range} / year`.trim();
}

function uniqueMatches(text, pattern) {
  return [...new Set(text.match(pattern) || [])];
}

function assess(raw) {
  const role = String(raw.role || "").trim();
  const employer = String(raw.employer || "").trim();
  const location = String(raw.location || "").trim();
  const description = raw.description || "";
  const fullText = `${role} ${location} ${description}`;
  if (!role || !employer || !raw.url || EXCLUDE_TITLE.test(role) || !TARGET_TITLE.test(role)) return null;
  if (!raw.trustedEurope && !EUROPE.test(fullText)) return null;

  const track = TRACK_RULES.find(([, pattern]) => pattern.test(fullText))?.[0] || "Motion Design";
  const tools = uniqueMatches(fullText, TOOL_TERMS).slice(0, 5);
  const sectors = uniqueMatches(fullText, SECTOR_TERMS).slice(0, 3);
  const risks = [];
  const strengths = [];
  let score = 52;

  if (SENIORITY.test(role)) { score += 11; strengths.push("seniority aligns with a 20+ year profile"); }
  else risks.push("seniority is not explicit");
  if (/director|head|lead|supervisor/i.test(role)) score += 5;
  if (/remote/i.test(raw.workMode)) { score += 5; strengths.push("remote work is indicated"); }
  if (tools.length) { score += Math.min(10, tools.length * 2); strengths.push(`relevant production tools: ${tools.join(", ")}`); }
  if (sectors.length) { score += Math.min(6, sectors.length * 2); strengths.push(`sector overlap: ${sectors.join(", ")}`); }
  if (["Creative Leadership", "Experiential / Immersive", "Motion Design", "VFX Leadership"].includes(track)) score += 5;

  let hardGap = false;
  if (MANDATORY_FRENCH.test(fullText)) {
    hardGap = true; score = Math.min(score, 48); risks.push("mandatory advanced French appears to be required; current level is foundational");
  } else if (FRENCH.test(fullText)) {
    score += 3; strengths.push("French appears useful rather than clearly mandatory");
    risks.push("confirm the expected working level of French");
  }
  if (MANDATORY_OTHER_LANGUAGE.test(fullText)) {
    hardGap = true; score = Math.min(score, 45); risks.push("another mandatory local-language requirement appears in the listing");
  }
  if (NATIVE_ENGLISH.test(fullText)) {
    hardGap = true; score = Math.min(score, 45); risks.push("native-level English appears mandatory; current certified level is B2/FCE");
  }
  if (UK.test(fullText) && !SPONSORSHIP.test(fullText)) {
    hardGap = true; score = Math.min(score, 44); risks.push("UK work rights or sponsorship are not clear");
  }
  if (raw.salary === "Not stated") risks.push("compensation is not stated");
  risks.push("verify location eligibility and whether the listing is still active");

  score = Math.max(0, Math.min(100, Math.round(score)));
  const fit = strengths.length
    ? `Potential fit because ${strengths.slice(0, 3).join("; ")}. Review the original brief before tailoring the CV.`
    : "Title relevance is promising, but the full brief needs a careful profile comparison.";

  return {
    id: stableId(raw.source, raw.sourceId, employer, role),
    priority: hardGap ? "Watch" : score >= 76 ? "Apply" : score >= 62 ? "Consider" : score >= 50 ? "Stretch" : "Watch",
    score,
    track,
    role,
    employer,
    location: location || "Location not stated",
    workMode: raw.workMode || "Unclear",
    contract: raw.contract || "Not stated",
    salary: raw.salary || "Not stated",
    deadline: "",
    fit,
    risks: risks.join("; "),
    cv: track === "Audiovisual Communications" ? "Audiovisual Communications" : "Creative / Experiential",
    status: "New",
    nextAction: "Open the original listing and verify requirements",
    dateFound: TODAY,
    lastChecked: TODAY,
    publishedAt: raw.publishedAt,
    url: raw.url,
    active: true,
    notes: "",
    source: raw.source,
    hardGap,
  };
}

function daysSince(date) {
  const then = Date.parse(date || "");
  return Number.isFinite(then) ? Math.floor((Date.now() - then) / 86400000) : Number.MAX_SAFE_INTEGER;
}

function deduplicate(jobs) {
  const seen = new Set();
  return jobs.filter((job) => {
    const key = `${job.employer}:${job.role}`.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function readExisting() {
  try { return JSON.parse(await readFile(OUTPUT, "utf8")); }
  catch { return { jobs: [] }; }
}

async function main() {
  const previous = await readExisting();
  const requests = await Promise.allSettled([
    fetchJson("https://jobicy.com/api/v2/remote-jobs?count=100&geo=europe"),
    fetchJson("https://www.arbeitnow.com/api/job-board-api"),
  ]);

  const freshRaw = [
    ...(requests[0].status === "fulfilled" ? fromJobicy(requests[0].value) : []),
    ...(requests[1].status === "fulfilled" ? fromArbeitnow(requests[1].value) : []),
  ];
  const fresh = deduplicate(freshRaw.map(assess).filter(Boolean));
  const freshIds = new Set(fresh.map((job) => job.id));
  const previousById = new Map((previous.jobs || []).map((job) => [job.id, job]));

  for (const job of fresh) {
    const old = previousById.get(job.id);
    if (old) job.dateFound = old.dateFound || job.dateFound;
  }

  const retained = (previous.jobs || [])
    .filter((job) => !freshIds.has(job.id) && daysSince(job.lastChecked || job.dateFound) <= RETENTION_DAYS)
    .map((job) => ({ ...job, active: false, risks: `${job.risks || ""}; no longer present in the latest feed—verify before applying`.replace(/^; /, "") }));

  const jobs = [...fresh, ...retained]
    .sort((a, b) => Number(b.active) - Number(a.active) || b.score - a.score || String(b.publishedAt).localeCompare(String(a.publishedAt)))
    .slice(0, MAX_JOBS);

  const succeededSources = [
    requests[0].status === "fulfilled" ? "Jobicy" : null,
    requests[1].status === "fulfilled" ? "Arbeitnow" : null,
  ].filter(Boolean);
  if (!succeededSources.length) {
    console.warn("Both public feeds failed; preserving the existing file.");
    process.exitCode = 0;
    return;
  }

  await writeFile(OUTPUT, `${JSON.stringify({ generatedAt: new Date().toISOString(), sources: succeededSources, jobs }, null, 2)}\n`, "utf8");
  console.log(`Saved ${jobs.length} scored opportunities from ${succeededSources.join(" and ")}.`);
}

await main();
