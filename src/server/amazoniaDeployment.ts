import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { ToolItem } from "../types";
export function amazoniaRuntime() {
  const node = process.env.AMAZONIA_NODE_BINARY;
  const data = process.env.AMAZONIA_CAMPAIGNS_DIR;
  if (
    !node ||
    !/^\/[a-zA-Z0-9_./-]+$/.test(node) ||
    fs.realpathSync(node) !== node ||
    !fs.statSync(node).isFile()
  )
    throw new Error("Binaire Node absolu canonique requis");
  execFileSync(
    node,
    [
      "-e",
      "if(Number(process.versions.node.split('.')[0])<24)process.exit(1); require('node:sqlite');",
    ],
    { stdio: "pipe" },
  );
  if (
    !data ||
    !path.isAbsolute(data) ||
    fs.realpathSync(data) !== data ||
    !fs.statSync(data).isDirectory() ||
    data.startsWith("/srv/jeu/") ||
    data.startsWith("/home/opc/")
  )
    throw new Error("Stockage externe canonique existant requis");
  return { node, data };
}
export function amazoniaUnit(tool: ToolItem, node: string) {
  return `[Unit]
Description=Amazonia Node backend
After=network.target
[Service]
Type=simple
User=amazonia
WorkingDirectory=${tool.vmPath}
Environment=NODE_ENV=production
Environment=PORT=${tool.port}
EnvironmentFile=/etc/amazonia/service.env
ExecStart=${node} --import tsx server.ts
Restart=on-failure
RestartSec=3
UMask=0077
NoNewPrivileges=true
[Install]
WantedBy=multi-user.target
`;
}
