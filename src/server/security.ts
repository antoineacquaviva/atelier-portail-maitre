import fs from "node:fs";
import path from "node:path";
import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
export function internalGuard(
  jsonRequired: (requestPath: string) => boolean = () => true,
): RequestHandler {
  const file = process.env.ATELIER_INTERNAL_KEY_FILE;
  const origins = (process.env.ATELIER_PUBLIC_ORIGINS ?? "")
    .split(",")
    .filter(Boolean);
  let key = "";
  if (file && origins.length) {
    if (!path.isAbsolute(file) || fs.realpathSync(file) !== file)
      throw new Error("Chemin de clé canonique absolu requis");
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 0o077)
      throw new Error("Permissions de clé interne invalides");
    key = fs.readFileSync(file, "utf8").trim();
    if (!/^[a-f0-9]{64,128}$/.test(key))
      throw new Error("Clé interne invalide");
    for (const origin of origins) {
      const u = new URL(origin);
      if (u.origin !== origin || u.protocol !== "https:")
        throw new Error("Origine HTTPS exacte requise");
    }
  }
  return (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    if (!key) {
      res.status(503).json({ error: "Entrée authentifiée non configurée" });
      return;
    }
    const proof = req.headers["x-atelier-internal"];
    if (
      typeof proof !== "string" ||
      !/^[a-f0-9]{64,128}$/.test(proof) ||
      proof.length !== key.length ||
      !timingSafeEqual(Buffer.from(proof), Buffer.from(key))
    ) {
      res.status(403).json({ error: "Accès refusé" });
      return;
    }
    if (
      req.headers["sec-fetch-site"] === "cross-site" ||
      (!["GET", "HEAD"].includes(req.method) &&
        (!origins.includes(String(req.headers.origin ?? "")) ||
          (jsonRequired(req.path) &&
            req.is("application/json") !== "application/json")))
    ) {
      res.status(403).json({ error: "Origine ou contenu refusé" });
      return;
    }
    if (!jsonRequired(req.path)) res.removeHeader("Cache-Control");
    next();
  };
}
// Never pass the entry credential or browser Basic credentials to unrelated tools.
export function proxyHeaders(headers: Record<string, any>, amazonia: boolean) {
  const result = { ...headers };
  for (const key of [
    "authorization",
    "x-atelier-internal",
    "x-user",
    "x-forwarded-user",
    "remote-user",
  ])
    delete result[key];
  if (amazonia) delete result.cookie;
  if (amazonia && process.env.ATELIER_INTERNAL_KEY_FILE)
    result["x-atelier-internal"] = fs
      .readFileSync(process.env.ATELIER_INTERNAL_KEY_FILE, "utf8")
      .trim();
  return result;
}
