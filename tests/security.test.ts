import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { randomBytes } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import express from "express";
import { createPortalApp } from "../server";
import { generateCaddyfile } from "../src/server/caddyConfig";
import { validateTool } from "../src/server/validation";
import { amazoniaUnit } from "../src/server/amazoniaDeployment";
import { proxyHeaders } from "../src/server/security";
const tool = (port = 8081) => ({
  id: "amazonia",
  name: "Amazonia",
  description: "test",
  repo: "antoineacquaviva/Amazonia",
  branch: "main",
  commitHash: "test",
  lastUpdated: "test",
  lastSource: "git" as const,
  subpath: "/amazonia",
  port,
  systemdUnit: "amazonia.service",
  vmPath: "/srv/jeu/amazonia",
  stackPreset: "node" as const,
  execStart: "",
  buildCmd: "",
  status: "active" as const,
  logs: [],
});
async function listen(app: any) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  return server as http.Server;
}
const port = (s: http.Server) => (s.address() as any).port as number;
async function close(s: http.Server) {
  s.closeAllConnections();
  await new Promise<void>((r) => s.close(() => r()));
}
const origin = "https://atelier.example";
function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atelier-auth-")),
    key = randomBytes(32).toString("hex");
  fs.writeFileSync(path.join(dir, "key"), key, { mode: 0o600 });
  const old = { ...process.env };
  process.env.ATELIER_INTERNAL_KEY_FILE = path.join(dir, "key");
  process.env.ATELIER_PUBLIC_ORIGINS = origin;
  return {
    dir,
    key,
    done: () => {
      process.env = old;
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
test("configuration validates request-derived targets and preserves Basic Auth on every branch", () => {
  const t = tool();
  const c = generateCaddyfile([t]);
  assert.match(c, /route \{\s+basic_auth/);
  assert.match(c, /admin off/);
  assert.ok(c.indexOf("basic_auth") < c.indexOf("handle_path"));
  assert.match(c, /\{\$ATELIER_BASIC_HASH\}/);
  assert.match(c, /header_up X-Atelier-Internal/);
  for (const patch of [
    { repo: "owner/repo;id" },
    { name: "x\nExecStart=bad" },
    { subpath: "/api" },
    { port: 3000 },
    { vmPath: "/srv/jeu" },
    { branch: "--help" },
    { systemdUnit: "x;id.service" },
  ])
    assert.throws(() => validateTool({ ...t, ...patch }));
  assert.throws(() => generateCaddyfile([t, t]));
  const u = amazoniaUnit(t, "/opt/node24/bin/node");
  assert.match(u, /User=amazonia/);
  assert.match(u, /ExecStart=\/opt\/node24\/bin\/node --import tsx server.ts/);
  assert.match(u, /EnvironmentFile=\/etc\/amazonia\/service.env/);
  assert.ok(!u.includes("http.server"));
});
test("portal rejects direct requests, forged identities, CSRF and arbitrary actions without side effects", async () => {
  const cfg = setup();
  const s = await listen(await createPortalApp([tool()], false));
  const base = `http://127.0.0.1:${port(s)}`;
  try {
    for (const url of [
      "/api/overview",
      "/api/tools/amazonia/action",
      "/api/tools/create",
      "/api/portal/self-update",
      "/amazonia/api/campaigns",
    ]) {
      const r = await fetch(base + url, {
        headers: {
          Authorization: "Basic fake",
          "x-user": "admin",
          "x-atelier-internal": "0".repeat(64),
        },
      });
      assert.equal(r.status, 403);
    }
    const headers = {
      "x-atelier-internal": cfg.key,
      Origin: origin,
      "Content-Type": "application/json",
    };
    assert.equal(
      (await fetch(base + "/api/overview", { headers })).status,
      200,
    );
    assert.equal(
      (
        await fetch(base + "/api/tools/amazonia/action", {
          method: "POST",
          headers: { ...headers, Origin: "https://evil.example" },
          body: '{"action":"stop"}',
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(base + "/api/tools/amazonia/action", {
          method: "POST",
          headers,
          body: '{"action":"stop;id"}',
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(base + "/api/tools/amazonia/deploy-version", {
          method: "POST",
          headers,
          body: '{"source":"zip"}',
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await fetch(base + "/api/tools/create", {
          method: "POST",
          headers,
          body: '{"initialSource":"git","stackPreset":"node","id":"bad;id"}',
        })
      ).status,
      400,
    );
    assert.equal(
      proxyHeaders(
        { "x-atelier-internal": cfg.key, authorization: "Basic secret" },
        false,
      )["x-atelier-internal"],
      undefined,
    );
  } finally {
    await close(s);
    cfg.done();
  }
});
test("portal absent internal configuration fails closed", async () => {
  const old = process.env.ATELIER_INTERNAL_KEY_FILE;
  delete process.env.ATELIER_INTERNAL_KEY_FILE;
  const s = await listen(await createPortalApp([], false));
  try {
    assert.equal(
      (await fetch(`http://127.0.0.1:${port(s)}/api/overview`)).status,
      503,
    );
  } finally {
    await close(s);
    if (old) process.env.ATELIER_INTERNAL_KEY_FILE = old;
  }
});
test(
  "real Caddy Basic Auth, direct and portal proxy paths, campaign persistence without polling",
  { skip: !process.env.CADDY_TEST_BINARY || !process.env.AMAZONIA_TEST_ROOT },
  async () => {
    const cfg = setup();
    const caddy = process.env.CADDY_TEST_BINARY!,
      root = process.env.AMAZONIA_TEST_ROOT!;
    const { CampaignManager } = await import(
      pathToFileURL(path.join(root, "src/server/campaignManager.ts")).href
    );
    const { createApp } = await import(
      pathToFileURL(path.join(root, "server.ts")).href
    );
    const { internalAuthorization } = await import(
      pathToFileURL(path.join(root, "src/server/internalAuthorization.ts")).href
    );
    const { DEFAULT_SWEEP_INPUT: S } = await import(
      pathToFileURL(path.join(root, "src/sim/i18n.ts")).href
    );
    const m = new CampaignManager({
      campaignsDir: path.join(cfg.dir, "data"),
      batchSize: 2,
      pool: { workers: 1, queue: 1 },
    });
    const a = await listen(
      (
        await createApp({
          manager: m,
          web: false,
          authorize: internalAuthorization(),
        })
      ).app,
    );
    const t = tool(port(a));
    const otherApp = express();
    otherApp.use((req, res) => res.json(req.headers));
    const other = await listen(otherApp);
    const otherTool = {
      ...tool(port(other)),
      id: "other",
      repo: "owner/tool",
      subpath: "/other",
      vmPath: "/srv/jeu/other",
      systemdUnit: "other.service",
    };
    const allTools = [t, otherTool];
    const portal = await listen(await createPortalApp(allTools, false));
    const reserve = await listen(express());
    const caddyPort = port(reserve);
    await close(reserve);
    const hash = execFileSync(
      caddy,
      ["hash-password", "--plaintext", "test-password"],
      { encoding: "utf8" },
    ).trim();
    const config = path.join(cfg.dir, "Caddyfile");
    fs.writeFileSync(
      config,
      generateCaddyfile(
        allTools,
        `http://127.0.0.1:${caddyPort}`,
        port(portal),
      ),
    );
    const child = spawn(
      caddy,
      ["run", "--config", config, "--adapter", "caddyfile"],
      {
        env: {
          ...process.env,
          ATELIER_INTERNAL_KEY: cfg.key,
          ATELIER_BASIC_USER: "test-admin",
          ATELIER_BASIC_HASH: hash,
        },
        stdio: "ignore",
      },
    );
    const base = `http://127.0.0.1:${caddyPort}`;
    const basic =
      "Basic " + Buffer.from("test-admin:test-password").toString("base64");
    try {
      const deadline = Date.now() + 10000;
      while (true) {
        try {
          await fetch(base);
          break;
        } catch {
          if (Date.now() > deadline) throw new Error("Caddy failed");
          await new Promise((r) => setTimeout(r, 30));
        }
      }
      for (const url of [
        "/",
        "/api/overview",
        "/api/tools/amazonia/action",
        "/amazonia",
        "/amazonia/api/health",
        "/other/api/echo",
      ]) {
        assert.equal(
          (
            await fetch(base + url, {
              headers: { "x-atelier-internal": cfg.key, "x-user": "admin" },
            })
          ).status,
          401,
        );
        assert.equal(
          (
            await fetch(base + url, {
              headers: {
                Authorization:
                  "Basic " + Buffer.from("test-admin:wrong").toString("base64"),
              },
            })
          ).status,
          401,
        );
      }
      assert.equal(
        (
          await fetch(base + "/api/overview", {
            headers: { Authorization: basic, "x-atelier-internal": "forged" },
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await fetch(base + "/amazonia/api/health", {
            headers: { Authorization: basic },
          })
        ).status,
        200,
      );
      const echo = await (
        await fetch(base + "/other/api/echo", {
          headers: {
            Authorization: basic,
            "x-atelier-internal": cfg.key,
            "x-user": "admin",
          },
        })
      ).json();
      assert.equal(echo["x-atelier-internal"], undefined);
      assert.equal(echo.authorization, undefined);
      assert.equal(echo["x-user"], undefined);
      assert.equal(
        (
          await fetch(`http://127.0.0.1:${port(a)}/api/health`, {
            headers: { Authorization: basic, "x-user": "admin" },
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await fetch(`http://127.0.0.1:${port(portal)}/api/overview`, {
            headers: { Authorization: basic },
          })
        ).status,
        403,
      );
      const headers = {
        Authorization: basic,
        Origin: origin,
        "Content-Type": "application/json",
      };
      const result = await fetch(base + "/amazonia/api/campaigns", {
        method: "POST",
        headers,
        body: JSON.stringify({
          id: "isolated",
          name: "test",
          gamesPerVariantAndTable: 10,
          baseSeed: 42,
          sweep: {
            ...S,
            numPlayersValues: [4],
            numTurnsValues: [8],
            tacticalDefenderCapValues: [2],
            combatThresholdShiftValues: [0],
            parryHsRuleValues: ["SYNERGY_TRAP_SAB"],
          },
          selectedTableConfigs: [
            {
              id: "t",
              name: "test",
              description: "test",
              botProfiles: ["COORD_HYBRID"],
            },
          ],
          includeCalibrationTables: false,
        }),
      });
      assert.equal(result.status, 201);
      await result.body?.cancel(); // No further client requests while workers run.
      const until = Date.now() + 15000;
      while (m.getSystemTelemetry().activeCampaigns) {
        if (Date.now() > until) throw new Error("Campaign timeout");
        await new Promise((r) => setTimeout(r, 20));
      }
      const read = await fetch(base + "/amazonia/api/campaigns/isolated", {
        headers: { Authorization: basic, Connection: "close" },
      });
      assert.equal(read.status, 200);
      assert.equal((await read.json()).progress.completedGames, 10);
      for (const action of ["pause", "resume", "stop"])
        assert.equal(
          (
            await fetch(base + "/amazonia/api/campaigns/isolated/" + action, {
              method: "POST",
              headers,
              body: "{}",
            })
          ).status,
          200,
        );
      // Caddy strips the prefix; portal's fallback proxy receives it, verifies entry proof, forwards only to Amazonia.
      const viaPortal = await fetch(
        `http://127.0.0.1:${port(portal)}/amazonia/api/campaigns/isolated`,
        { headers: { "x-atelier-internal": cfg.key } },
      );
      assert.equal(viaPortal.status, 200);
      assert.equal((await viaPortal.json()).status, "COMPLETED");
      assert.equal(
        (
          await fetch(base + "/amazonia/api/campaigns", {
            method: "POST",
            headers: { ...headers, Origin: "https://evil.example" },
            body: "{}",
          })
        ).status,
        403,
      );
    } finally {
      child.kill("SIGTERM");
      await new Promise((r) => child.once("exit", r));
      await close(portal);
      await close(other);
      await close(a);
      await m.close();
      cfg.done();
    }
  },
);

test("Amazonia runtime refuses missing configuration and verifies the actual Node executable", async () => {
  const { amazoniaRuntime } = await import("../src/server/amazoniaDeployment");
  const old = { ...process.env },
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "atelier-runtime-"));
  try {
    delete process.env.AMAZONIA_NODE_BINARY;
    assert.throws(amazoniaRuntime);
    process.env.AMAZONIA_NODE_BINARY = fs.realpathSync(process.execPath);
    process.env.AMAZONIA_CAMPAIGNS_DIR = dir;
    assert.equal(amazoniaRuntime().node, fs.realpathSync(process.execPath));
    process.env.AMAZONIA_CAMPAIGNS_DIR = dir + "/absent";
    assert.throws(amazoniaRuntime);
  } finally {
    process.env = old;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("clone target preserves existing non-Git data and rejects symbolic paths", async () => {
  const { checkGitTarget } = await import("../src/server/gitTarget");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "git-target-"));
  try {
    checkGitTarget(dir);
    fs.writeFileSync(path.join(dir, "campaign.json"), "preserve");
    assert.throws(() => checkGitTarget(dir), /non vide/);
    assert.equal(
      fs.readFileSync(path.join(dir, "campaign.json"), "utf8"),
      "preserve",
    );
    fs.mkdirSync(path.join(dir, ".git"));
    checkGitTarget(dir);
    fs.symlinkSync(dir, dir + "-link");
    assert.throws(() => checkGitTarget(dir + "-link"), /canonique/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(dir + "-link", { force: true });
  }
});
