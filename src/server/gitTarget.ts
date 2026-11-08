import fs from "node:fs";
import path from "node:path";
// Never clear a non-repository directory to make room for a clone.
export function checkGitTarget(target: string) {
  const parent = path.dirname(target);
  if (fs.existsSync(parent) && fs.realpathSync(parent) !== parent)
    throw new Error("Parent symbolique interdit");
  if (fs.existsSync(target)) {
    if (
      !fs.statSync(target).isDirectory() ||
      fs.realpathSync(target) !== target
    )
      throw new Error("Répertoire Git non canonique");
    if (fs.existsSync(path.join(target, ".git"))) {
      if (
        fs.lstatSync(path.join(target, ".git")).isSymbolicLink() ||
        !fs.statSync(path.join(target, ".git")).isDirectory()
      )
        throw new Error("Métadonnées Git non sûres");
    } else if (fs.readdirSync(target).length)
      throw new Error(
        "Répertoire non vide sans Git : intervention manuelle requise",
      );
  }
}
