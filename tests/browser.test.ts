import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import https from "node:https";
import express from "express";
import { randomBytes } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { generateCaddyfile } from "../src/server/caddyConfig";
const enabled = !!(
  process.env.CADDY_TEST_BINARY &&
  process.env.AMAZONIA_TEST_ROOT &&
  process.env.PLAYWRIGHT_TEST_MODULE &&
  process.env.CHROMIUM_TEST_BINARY
);
test(
  "HTTPS browser authenticated, fully closed, then second browser reads completed durable campaign",
  { skip: !enabled },
  async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atelier-browser-")),
      old = { ...process.env };
    const listen = async (app: any) => {
      const s = app.listen(0, "127.0.0.1");
      await new Promise<void>((r) => s.once("listening", r));
      return s;
    };
    const reserve = await listen(express()),
      port = reserve.address().port;
    await new Promise<void>((r) => reserve.close(() => r()));
    const origin = `https://127.0.0.1:${port}`,
      key = randomBytes(32).toString("hex");
    fs.writeFileSync(path.join(dir, "key"), key, { mode: 0o600 });
    process.env.ATELIER_INTERNAL_KEY_FILE = path.join(dir, "key");
    process.env.ATELIER_PUBLIC_ORIGINS = origin;
    const root = process.env.AMAZONIA_TEST_ROOT!,
      caddy = process.env.CADDY_TEST_BINARY!;
    const { createApp } = await import(
      pathToFileURL(path.join(root, "server.ts")).href
    );
    const { CampaignManager } = await import(
      pathToFileURL(path.join(root, "src/server/campaignManager.ts")).href
    );
    const { internalAuthorization } = await import(
      pathToFileURL(path.join(root, "src/server/internalAuthorization.ts")).href
    );
    const { DEFAULT_SWEEP_INPUT: S } = await import(
      pathToFileURL(path.join(root, "src/sim/i18n.ts")).href
    );
    const { chromium } = await import(process.env.PLAYWRIGHT_TEST_MODULE!);
    const m = new CampaignManager({
      campaignsDir: path.join(dir, "data"),
      batchSize: 2,
      pool: { workers: 1, queue: 1 },
    });
    const backend = await listen(
      (
        await createApp({
          manager: m,
          web: false,
          authorize: internalAuthorization(),
        })
      ).app,
    );
    const t = {
      id: "amazonia",
      name: "Amazonia",
      repo: "antoineacquaviva/Amazonia",
      branch: "main",
      subpath: "/amazonia",
      port: backend.address().port,
      systemdUnit: "amazonia.service",
      vmPath: "/srv/jeu/amazonia",
    } as any;
    const config = generateCaddyfile([t], origin, backend.address().port)
      .replace("admin off", "admin off\n    skip_install_trust")
      .replace(`${origin} {`, `${origin} {\n    tls internal`);
    fs.writeFileSync(path.join(dir, "Caddyfile"), config);
    const hash = execFileSync(
      caddy,
      ["hash-password", "--plaintext", "browser-test-password"],
      { encoding: "utf8" },
    ).trim();
    const child = spawn(
      caddy,
      [
        "run",
        "--config",
        path.join(dir, "Caddyfile"),
        "--adapter",
        "caddyfile",
      ],
      {
        env: {
          ...process.env,
          XDG_DATA_HOME: path.join(dir, "caddy-data"),
          XDG_CONFIG_HOME: path.join(dir, "caddy-config"),
          ATELIER_INTERNAL_KEY: key,
          ATELIER_BASIC_USER: "browser-test-admin",
          ATELIER_BASIC_HASH: hash,
        },
        stdio: "ignore",
      },
    );
    let browser: any;
    try {
      const deadline = Date.now() + 10000;
      while (true) {
        try {
          await new Promise<void>((resolve, reject) => {
            https
              .get(origin, { rejectUnauthorized: false }, (r) => {
                r.resume();
                resolve();
              })
              .on("error", reject);
          });
          break;
        } catch {
          if (Date.now() > deadline) throw new Error("TLS Caddy failed");
          await new Promise((r) => setTimeout(r, 30));
        }
      }
      const options = {
        executablePath: process.env.CHROMIUM_TEST_BINARY!,
        headless: true,
        args: ["--no-sandbox"],
      };
      const contextOptions = {
        ignoreHTTPSErrors: true,
        httpCredentials: {
          username: "browser-test-admin",
          password: "browser-test-password",
        },
      };
      browser = await chromium.launch(options);
      let context = await browser.newContext(contextOptions),
        page = await context.newPage();
      assert.equal(
        (await page.goto(origin + "/amazonia/api/health"))!.status(),
        200,
      );
      const config = {
        id: "browser",
        name: "browser",
        gamesPerVariantAndTable: 40,
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
      };
      const status = await page.evaluate(
        async (body: unknown) =>
          (
            await fetch("/amazonia/api/campaigns", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            })
          ).status,
        config,
      );
      assert.equal(status, 201);
      assert.equal(m.getCampaign("browser")!.status, "RUNNING");
      await browser.close();
      browser = undefined;
      const until = Date.now() + 20000;
      while (m.getSystemTelemetry().activeCampaigns) {
        if (Date.now() > until)
          throw new Error("Browser independent campaign timeout");
        await new Promise((r) => setTimeout(r, 20));
      }
      browser = await chromium.launch(options);
      context = await browser.newContext(contextOptions);
      page = await context.newPage();
      const response = await page.goto(
        origin + "/amazonia/api/campaigns/browser",
      );
      assert.equal(response!.status(), 200);
      const record = await response!.json();
      assert.equal(record.status, "COMPLETED");
      assert.equal(record.progress.completedGames, 40);
    } finally {
      await browser?.close();
      child.kill("SIGTERM");
      await new Promise((r) => child.once("exit", r));
      backend.closeAllConnections();
      await new Promise<void>((r) => backend.close(() => r()));
      await m.close();
      process.env = old;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
);
