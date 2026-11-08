import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { prepareToolDirectory } from "../src/server/toolDirectory";
function snapshot(root: string): unknown {
  const stat = fs.lstatSync(root);
  return {
    uid: stat.uid,
    gid: stat.gid,
    mode: stat.mode,
    contents: stat.isDirectory()
      ? Object.fromEntries(
          fs
            .readdirSync(root)
            .sort()
            .map((name) => [name, snapshot(path.join(root, name))]),
        )
      : fs.readFileSync(root, "utf8"),
  };
}
test("preparing one tool preserves sibling owners/modes/content, shared parent and existing target metadata", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tool-permissions-"));
  try {
    for (const name of ["amazonia", "lora", "lab"]) {
      const dir = path.join(root, name);
      fs.mkdirSync(dir, { mode: 0o750 });
      fs.mkdirSync(path.join(dir, "nested"), { mode: 0o700 });
      fs.writeFileSync(path.join(dir, "nested", "checkpoint"), "unchanged", {
        mode: 0o640,
      });
    }
    const before = snapshot(root) as any;
    const target = path.join(root, "selected");
    prepareToolDirectory(target);
    const after = snapshot(root) as any;
    delete after.contents.selected;
    assert.deepEqual(after, before);
    fs.chmodSync(target, 0o700);
    const targetBefore = snapshot(target);
    prepareToolDirectory(target);
    assert.deepEqual(snapshot(target), targetBefore);
    for (const name of ["amazonia", "lora", "lab"])
      assert.deepEqual(snapshot(path.join(root, name)), before.contents[name]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("missing shared parent and symbolic targets fail without altering other tools", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tool-permissions-"));
  try {
    assert.throws(() =>
      prepareToolDirectory(path.join(root, "missing", "tool")),
    );
    assert.equal(fs.existsSync(path.join(root, "missing")), false);
    const sibling = path.join(root, "amazonia");
    fs.mkdirSync(sibling, { mode: 0o700 });
    fs.writeFileSync(path.join(sibling, "checkpoint"), "preserve");
    const before = snapshot(sibling);
    fs.symlinkSync(sibling, path.join(root, "link"));
    assert.throws(() => prepareToolDirectory(path.join(root, "link")));
    assert.deepEqual(snapshot(sibling), before);
    const source = fs.readFileSync(
      new URL("../server.ts", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(source, /chown\s+-R|ensureSrvJeuPermissions/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
