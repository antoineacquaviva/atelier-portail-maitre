import type { ToolItem } from "../types";
export const actions = new Set([
  "start",
  "stop",
  "restart",
  "clear-logs",
  "delete",
  "diagnose",
]);
export const isAmazonia = (t: Pick<ToolItem, "id" | "repo">) =>
  t.id === "amazonia" || t.repo.toLowerCase() === "antoineacquaviva/amazonia";
export function validateTool(t: ToolItem) {
  if (
    !/^[a-z0-9][a-z0-9-]{0,63}$/.test(t.id) ||
    !/^[-\p{L}\p{N} _.]{1,100}$/u.test(t.name) ||
    !/^\/[a-z0-9][a-z0-9-]{0,63}$/.test(t.subpath) ||
    ["/api", "/assets"].includes(t.subpath) ||
    !Number.isInteger(t.port) ||
    t.port < 1024 ||
    t.port > 65535 ||
    t.port === 3000 ||
    !/^[-A-Za-z0-9_.]+\/[-A-Za-z0-9_.]+$/.test(t.repo) ||
    !t.repo.split("/").every((p) => p !== "." && p !== "..") ||
    !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,100}$/.test(t.branch) ||
    t.branch.includes("..") ||
    !/^[-A-Za-z0-9_]+\.service$/.test(t.systemdUnit) ||
    !/^\/(srv\/jeu|home\/opc)\/[a-z0-9][a-z0-9-]{0,63}$/.test(t.vmPath)
  )
    throw new Error("Configuration outil invalide");
}
