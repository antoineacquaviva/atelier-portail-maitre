import fs from "node:fs";
import path from "node:path";
/** Prepare only the selected checkout. Provision shared parents/owners manually. */
export function prepareToolDirectory(target: string) {
  const parent = path.dirname(target);
  if (
    !path.isAbsolute(target) ||
    path.resolve(target) !== target ||
    target === parent
  )
    throw new Error("Chemin outil absolu canonique requis");
  if (!fs.statSync(parent).isDirectory() || fs.realpathSync(parent) !== parent)
    throw new Error(
      "Parent existant canonique requis, à préparer manuellement",
    );
  // Nonrecursive mkdir: never create/change the shared parent or siblings.
  try {
    fs.mkdirSync(target, { mode: 0o755 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  if (!fs.lstatSync(target).isDirectory() || fs.realpathSync(target) !== target)
    throw new Error("Répertoire outil symbolique interdit");
  fs.accessSync(
    target,
    fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK,
  );
  // No chmod/chown: existing ownership (including amazonia) is preserved.
}
