import fs from "node:fs";
import path from "node:path";
import { generateCaddyfile } from "../src/server/caddyConfig";
const [registry, output] = process.argv.slice(2);
if (
  !registry ||
  !output ||
  !path.isAbsolute(registry) ||
  !path.isAbsolute(output)
)
  throw new Error(
    "Usage : tsx scripts/prepare-caddy.ts REGISTRE_ABSOLU SORTIE_NOUVELLE_ABSOLUE",
  );
const tools = JSON.parse(fs.readFileSync(registry, "utf8"));
fs.writeFileSync(output, generateCaddyfile(tools), { flag: "wx", mode: 0o600 });
