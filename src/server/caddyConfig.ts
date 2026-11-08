import type { ToolItem } from "../types";
import { isAmazonia, validateTool } from "./validation";
export function generateCaddyfile(
  tools: ToolItem[],
  site = "atelierconceptionjeu.fr, www.atelierconceptionjeu.fr",
  portalPort = 3000,
) {
  const seen = new Set<string>(),
    ports = new Set<number>();
  for (const t of tools) {
    validateTool(t);
    if (seen.has(t.subpath) || ports.has(t.port))
      throw new Error("Collision outil");
    seen.add(t.subpath);
    ports.add(t.port);
  }
  const upstream = (
    port: number,
    proof: boolean,
  ) => `reverse_proxy 127.0.0.1:${port} {
          header_up -Authorization
          ${proof ? "header_up -Cookie" : ""}
          header_up -X-User
          header_up -X-Forwarded-User
          header_up -Remote-User
          ${proof ? "header_up X-Atelier-Internal {$ATELIER_INTERNAL_KEY}" : "header_up -X-Atelier-Internal"}
        }`;
  return `{
    admin off
}
${site} {
    route {
      basic_auth {
        {$ATELIER_BASIC_USER} {$ATELIER_BASIC_HASH}
      }
${tools
  .map(
    (t) => `      redir ${t.subpath} ${t.subpath}/
      handle_path ${t.subpath}/* {
        ${upstream(t.port, isAmazonia(t))}
      }`,
  )
  .join("\n")}
      handle {
        ${upstream(portalPort, true)}
      }
    }
}
`;
}
