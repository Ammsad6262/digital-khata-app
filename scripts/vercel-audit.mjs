/**
 * Read-only Vercel audit for this project.
 *
 * Prints project settings, protection, domains, recent deployments and a scan of
 * the latest build log. Never prints secret values: env vars are listed by name
 * and connection strings are reduced to host/port/database.
 *
 * Usage: node scripts/vercel-audit.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const p = path.resolve(process.cwd(), file);
    if (!existsSync(p)) continue;
    for (const raw of readFileSync(p, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
}
loadEnv();

const token = process.env.VERCEL_TOKEN;
if (!token) {
  console.error("VERCEL_TOKEN is not set");
  process.exit(1);
}

const API = "https://api.vercel.com";
async function api(pathname) {
  const res = await fetch(API + pathname, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 300);
  }
  if (!res.ok) {
    const err = new Error(`${res.status} ${body?.error?.code ?? ""} ${body?.error?.message ?? ""}`.trim());
    err.body = body;
    throw err;
  }
  return body;
}

function redactUrl(value) {
  try {
    const u = new URL(value);
    return {
      host: u.hostname,
      port: u.port || null,
      database: u.pathname.replace(/^\//, ""),
      user: u.username ? u.username.replace(/\.([a-z0-9]+)$/i, ".<ref>") : null,
      passwordSet: Boolean(u.password),
      params: Object.fromEntries(u.searchParams.entries()),
    };
  } catch {
    return { unparsable: true };
  }
}

(async () => {
  const projects = await api("/v9/projects?limit=50");
  const list = projects.projects ?? [];
  console.log(`=== PROJECTS (${list.length}) ===`);
  for (const p of list) console.log(`  ${p.name} (${p.id})${p.accountId ? ` team=${p.accountId}` : ""}`);

  const project = list.find((p) => p.name === "digital-khata-app");
  if (!project) {
    console.log("digital-khata-app not visible to this token");
    return;
  }
  const teamId = project.accountId;
  const T = teamId ? `?teamId=${teamId}` : "";

  console.log("\n=== PROJECT SETTINGS ===");
  const detail = await api(`/v9/projects/${project.id}${T}`);
  console.log(
    JSON.stringify(
      {
        name: detail.name,
        framework: detail.framework,
        nodeVersion: detail.nodeVersion,
        rootDirectory: detail.rootDirectory ?? ".",
        buildCommand: detail.buildCommand,
        installCommand: detail.installCommand,
        outputDirectory: detail.outputDirectory,
        regions: detail.regions,
        gitRepo: detail.link ? `${detail.link.type}:${detail.link.org}/${detail.link.repo}` : null,
        productionBranch: detail.link?.productionBranch ?? null,
        ssoProtection: detail.ssoProtection ?? null,
        passwordProtection: detail.passwordProtection ?? null,
        gitForkProtection: detail.gitForkProtection,
        publicSource: detail.publicSource,
        directoryListing: detail.directoryListing,
        autoExposeSystemEnvs: detail.autoExposeSystemEnvs,
      },
      null,
      2,
    ),
  );

  console.log("\n=== ENV VARS (names only) ===");
  const envs = (await api(`/v9/projects/${project.id}/env?limit=100${teamId ? `&teamId=${teamId}` : ""}`)).envs ?? [];
  for (const e of envs.sort((a, b) => a.key.localeCompare(b.key))) {
    const targets = Array.isArray(e.target) ? e.target.join(",") : String(e.target);
    console.log(`  ${e.key} [${targets}] type=${e.type}`);
  }

  console.log("\n=== DECRYPTABLE CONNECTION SHAPES ===");
  try {
    const readable = (await api(`/v9/projects/${project.id}/env?decrypt=true&limit=100${teamId ? `&teamId=${teamId}` : ""}`)).envs ?? [];
    let shown = 0;
    for (const e of readable) {
      if (!["DATABASE_URL", "DIRECT_URL"].includes(e.key) || !e.value) continue;
      const targets = Array.isArray(e.target) ? e.target.join(",") : String(e.target);
      console.log(`  ${e.key} [${targets}] ${JSON.stringify(redactUrl(e.value))}`);
      shown += 1;
    }
    if (shown === 0) console.log("  values are marked sensitive and cannot be read (host/port hidden)");
  } catch (e) {
    console.log(`  decrypt unavailable: ${e.message}`);
  }

  console.log("\n=== DOMAINS ===");
  try {
    const doms = await api(`/v9/projects/${project.id}/domains${T}`);
    for (const d of doms.domains ?? []) {
      console.log(`  ${d.name} verified=${d.verified} redirect=${d.redirect ?? null} branch=${d.gitBranch ?? null}`);
    }
  } catch (e) {
    console.log(`  domains unavailable: ${e.message}`);
  }

  console.log("\n=== RECENT DEPLOYMENTS ===");
  const deps = (await api(`/v6/deployments?projectId=${project.id}&limit=12${teamId ? `&teamId=${teamId}` : ""}`)).deployments ?? [];
  for (const d of deps) {
    const sha = (d.meta?.githubCommitSha ?? "-").slice(0, 7);
    const dur = d.buildingAt && d.ready ? `${Math.round((d.ready - d.buildingAt) / 1000)}s` : "-";
    console.log(`  ${new Date(d.createdAt).toISOString().slice(0, 16)} ${d.state.padEnd(10)} ${dur.padStart(5)} ${sha} ${d.target ?? "-"} ${d.url}`);
  }

  const latest = deps[0];
  if (latest) {
    const deploymentId = latest.uid ?? latest.id;
    console.log(`\n=== BUILD LOG SCAN (${deploymentId}) ===`);
    try {
      const events = await api(`/v3/deployments/${deploymentId}/events?direction=backward&limit=2000${teamId ? `&teamId=${teamId}` : ""}`);
      const listEvents = Array.isArray(events) ? events : events.events ?? [];
      const lines = listEvents
        .map((e) => e.text ?? e.payload?.text)
        .filter((t) => typeof t === "string")
        .flatMap((t) => t.split("\n"))
        .map((l) => l.trim())
        .filter(Boolean);
      const flagged = lines.filter((l) => /error|warn|fail|retry|ddl|timeout|deprecat/i.test(l));
      console.log(`  lines=${lines.length} flagged=${flagged.length}`);
      for (const l of flagged.slice(-20)) console.log(`  | ${l.slice(0, 220)}`);
      console.log("  tail:");
      for (const l of lines.slice(-5)) console.log(`  > ${l.slice(0, 220)}`);
    } catch (e) {
      console.log(`  build log unavailable: ${e.message}`);
    }
  }
})().catch((e) => {
  console.error("AUDIT FAILED:", e.message);
  if (e.body) console.error(JSON.stringify(e.body).slice(0, 400));
  process.exit(1);
});