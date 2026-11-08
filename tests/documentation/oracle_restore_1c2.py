#!/usr/bin/env python3
"""Exercise the runbook's marked snippets on disposable fixtures, never Oracle.

Requires Python >=3.9, Node >=24, tsx and a clean checkout of the pinned Amazonia
commit. Does not install dependencies, start HTTP services or create secrets.
Only fake Oracle paths, the tsx loader, report names, the read-only manager's
worker limit (one for small test hosts) and sudo in selected filesystem snippets
are substituted. Commands are taken from the document, not reimplemented.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile


AMAZONIA_SHA = "efdb787ad3edad845dfc60c6124f6bca2cd4dd6e"
DOC = Path(__file__).resolve().parents[2] / "docs/DEPLOIEMENT_ORACLE_1C2.md"


def snapshot(root):
    """No atime assertion: reading bytes can update access time on some mounts."""
    result = {}
    for p in [root, *sorted(root.rglob("*"))]:
        st = p.lstat()
        content = p.read_bytes() if p.is_file() and not p.is_symlink() else b""
        result[str(p.relative_to(root))] = (
            st.st_mode, st.st_uid, st.st_gid, st.st_size, st.st_mtime_ns,
            hashlib.sha256(content).hexdigest(),
        )
    return result


def files(root):
    return {str(p.relative_to(root)): p.read_bytes()
            for p in root.rglob("*") if p.is_file()}


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--amazonia-root", required=True, type=Path)
    parser.add_argument("--tsx-loader", required=True, type=Path)
    parser.add_argument("--node", default=shutil.which("node"), type=Path)
    args = parser.parse_args()
    code, loader, node = (p.resolve(strict=True) for p in
                          (args.amazonia_root, args.tsx_loader, args.node))
    head = subprocess.check_output(["git", "-C", str(code), "rev-parse", "HEAD"], text=True).strip()
    require(head == AMAZONIA_SHA, "Wrong Amazonia commit")
    require(not subprocess.check_output(["git", "-C", str(code), "status", "--porcelain"]),
            "Amazonia checkout must be unchanged")
    version = subprocess.check_output([str(node), "--version"], text=True).strip()
    require(int(version[1:].split(".")[0]) >= 24, "Node >=24 required")
    document = DOC.read_text()

    def snippet(name):
        m = re.search(r"<!-- 1c2:" + re.escape(name) + r" -->\n```bash\n(.*?)\n```",
                      document, re.S)
        require(m is not None, "Missing documentary snippet: " + name)
        return m[1]

    results = []
    with tempfile.TemporaryDirectory(prefix="amazonia-1c2-fixtures-") as temp:
        base = Path(temp).resolve()
        stage = base / "stage"
        stage.mkdir(mode=0o700)
        (stage / "reports").mkdir()
        (stage / "amazonia.next").symlink_to(code, target_is_directory=True)
        backup = base / "original-backup"
        data = backup / "data"
        campaigns = data / "campaigns"
        campaigns.mkdir(parents=True)
        for i in range(2):
            c = {"id": f"compatible-{i}", "status": "COMPLETED",
                 "startedAt": f"2026-11-0{i+1}T12:00:00Z",
                 "config": {"type": "MONTE_CARLO_SWEEP",
                            "sweep": {"parryHsRuleValues": ["SYNERGY_TRAP_SAB"]}},
                 "progress": {"completedGames": 10 * (i + 1), "totalGames": 10 * (i + 1)},
                 "variantResults": []}
            (campaigns / (c["id"] + ".json")).write_text(json.dumps(c))
        for i in range(7):
            (campaigns / f"incompatible-{i}.json").write_text(json.dumps({"historical": i}))
        for i in range(2):
            (campaigns / f"empty-{i}.json").write_bytes(b"")
        for i in range(5):
            (data / f"metadata-{i}.json").write_text(json.dumps({"outsideCampaigns": i}))
        original = snapshot(backup)
        original_files = files(data)
        require(len(original_files) == 16, "Fixture count")
        env = {k: v for k, v in os.environ.items()
               if not k.startswith(("AMAZONIA_", "ATELIER_", "NODE_"))}
        env.update(STAGE=str(stage), NODE_BIN=str(node),
                   SOURCE_DATA=str(data), RESTORE_DATA=str(stage / "restore-json/data"),
                   RESTORE_CAMPAIGNS=str(stage / "restore-json/data/campaigns"))

        def run(body, *, values=None, success=True):
            # Only known fixture paths; no arbitrary runbook block is executed.
            body = body.replace("/home/opc/amazonia-data-backup-20261108-125739", str(backup))
            body = body.replace("/srv/jeu/amazonia/data", str(data))
            body = body.replace("--import tsx", "--import \"" + str(loader) + "\"")
            body = body.replace("AMAZONIA_WORKERS=2", "AMAZONIA_WORKERS=1")
            body = re.sub(r"(?m)^sudo (?=(?:python3|cp |tar ))", "", body)
            require("sudo " not in body and "systemctl" not in body and "curl " not in body,
                    "Non-fixture operation refused")
            cp = subprocess.run(["bash", "--noprofile", "--norc", "-e", "-u", "-o", "pipefail", "-c", body],
                                cwd=code, env=env | (values or {}), capture_output=True,
                                text=True, timeout=60)
            if success:
                logs = "\n".join(p.read_text() for p in (stage / "reports").glob("*.log"))
                require(cp.returncode == 0, cp.stdout + cp.stderr + logs)
            else:
                require(cp.returncode != 0, "Expected explicit refusal, got success")
            return cp

        def unchanged():
            require(snapshot(backup) == original, "Original fixture changed")

        def legacy_preserved(root):
            require(all((root / name).read_bytes() == content
                        for name, content in original_files.items()), "Legacy bytes/path changed")
            require((root / "campaigns/empty-0.json").stat().st_size == 0 and
                    (root / "campaigns/empty-1.json").stat().st_size == 0, "Empty JSON changed")

        expected = [{"id": "compatible-1", "status": "COMPLETED",
                     "progress": {"completedGames": 20, "totalGames": 20}},
                    {"id": "compatible-0", "status": "COMPLETED",
                     "progress": {"completedGames": 10, "totalGames": 10}}]

        run(snippet("p12-copy"))
        run(snippet("verify-json-copy"))
        require(files(stage / "restore-json/data") == original_files, "Copy altered tree")
        results.append("P12: actual cp preserves data/campaigns, 16 files, 11 campaign JSON and two empty JSON")

        # Negative tests run the document's guards, not an alternate validator.
        for bad in (stage / "restore-json/campaigns", stage / "restore-json/data", campaigns):
            run(snippet("load-restored"), values={"RESTORE_CAMPAIGNS": str(bad)}, success=False)
        require(not (stage / "restore-json/campaigns").exists(), "Wrong root silently created")
        require(not (campaigns / "orchestration.sqlite").exists(), "Original DB created")
        (stage / "linked-root").symlink_to(stage / "restore-json/data/campaigns", target_is_directory=True)
        run(snippet("load-restored"), values={"RESTORE_CAMPAIGNS": str(stage / "linked-root")}, success=False)
        results.append("P12 refuses missing root, data root, original root and symbolic root before manager construction")

        restored_data = stage / "restore-json/data"
        (restored_data / "unexpected.json").write_text("{}")
        run(snippet("verify-json-copy"), success=False)
        (restored_data / "unexpected.json").unlink()
        run(snippet("verify-json-copy"), values={"RESTORE_DATA": str(stage / "absent")}, success=False)
        (restored_data / "linked.json").symlink_to(data / "metadata-0.json")
        run(snippet("verify-json-copy"), success=False)
        (restored_data / "linked.json").unlink()
        empty = restored_data / "campaigns/empty-0.json"
        empty.write_text("{}")
        run(snippet("verify-json-copy"), success=False)
        empty.write_bytes(b"")
        results.append("JSON validation refuses missing tree, extra file, nested symlink and altered empty JSON")

        run(snippet("load-restored"))
        report = stage / "reports/restored-campaigns.private.json"
        require(json.loads(report.read_text()) == expected, "Wrong compatible campaigns/counters")
        require((restored_data / "campaigns/orchestration.sqlite").is_file(), "No actual SQLite")
        legacy_preserved(restored_data)
        unchanged()
        results.append("Pinned CampaignManager actually loads two compatible historical campaigns; originals and empty files unchanged")

        run(snippet("sqlite-roundtrip"))
        sqlite_archive = stage / "sqlite-test-backup"
        sqlite_copy = stage / "sqlite-test-restored"
        manifest = json.loads((sqlite_archive / "backup-manifest.json").read_text())
        require(manifest["software"]["softwareCommit"] == AMAZONIA_SHA, "Backup provenance")
        archive_before = snapshot(sqlite_archive)
        loaded_sqlite = snippet("load-restored").replace('"$STAGE" json', '"$STAGE" sqlite')
        loaded_sqlite = loaded_sqlite.replace("restored-campaigns.private.json", "sqlite-campaigns.private.json")
        loaded_sqlite = loaded_sqlite.replace("restored-loader.private.log", "sqlite-loader.private.log")
        run(loaded_sqlite, values={"RESTORE_CAMPAIGNS": str(sqlite_copy)})
        require(json.loads((stage / "reports/sqlite-campaigns.private.json").read_text()) == expected,
                "SQLite roundtrip campaigns differ")
        require(snapshot(sqlite_archive) == archive_before, "Archive changed by manager")
        require(not (sqlite_copy / "data").exists() and not (sqlite_copy / "campaigns").exists(),
                "SQLite restore was wrongly nested")
        require(all((sqlite_copy / p.name).read_bytes() == p.read_bytes() for p in campaigns.glob("*.json")),
                "SQLite restore lost historical JSON")
        run(loaded_sqlite, values={"RESTORE_CAMPAIGNS": str(restored_data)}, success=False)
        unchanged()
        results.append("Real scripts/backup.ts backup + restore pass integrity/manifest; direct campaigns root reloads same IDs/states/counters")

        backup_cli = '"$NODE_BIN" --import tsx scripts/backup.ts '
        run(backup_cli + 'restore "$STAGE/sqlite-test-backup" "$STAGE/sqlite-test-restored"', success=False)
        run(backup_cli + 'restore "$STAGE/sqlite-test-backup" "$STAGE/restore-json/data/campaigns"', success=False)
        # Tampered archive is a disposable copy; never modify the valid archive.
        shutil.copytree(sqlite_archive, stage / "tampered")
        with (stage / "tampered/compatible-0.json").open("a") as f:
            f.write(" ")
        run(backup_cli + 'restore "$STAGE/tampered" "$STAGE/tampered-restored"', success=False)
        require(not (stage / "tampered-restored").exists(), "Corrupted archive restored")
        results.append("SQLite restore refuses existing destination, existing campaigns and tampered checksum")

        # B02 uses the exact tar creation command from the document, fixture path only.
        tar_command = next(line for line in document.splitlines()
                           if line.startswith("sudo tar ") and '"$STAGE/data.final.tar" -C' in line)
        tar_command = tar_command.replace("-C /srv/jeu/amazonia data", '-C "' + str(backup) + '" data')
        run(tar_command)
        members = subprocess.check_output(["tar", "-tf", str(stage / "data.final.tar")], text=True).splitlines()
        require(all(m == "data/" or m.startswith("data/") for m in members), "Unexpected tar tree")
        run(snippet("b02-extract"))
        final_values = {"RESTORE_DATA": str(stage / "restore-final/data"),
                        "RESTORE_CAMPAIGNS": str(stage / "restore-final/data/campaigns")}
        run(snippet("verify-json-copy"), values=final_values)
        run(snippet("load-restored"), values=final_values)
        require(json.loads(report.read_text()) == expected, "Cold archive campaigns differ")
        legacy_preserved(stage / "restore-final/data")
        run(snippet("b02-extract"), success=False)
        results.append("B02: actual tar -C parent data and extraction produce restore-final/data/campaigns; repeated extraction refused")

        new_data = base / "persistent-data"
        (new_data / "campaigns").mkdir(parents=True)
        migration_values = {"DATA_NEW": str(new_data), "CAMPAIGNS_NEW": str(new_data / "campaigns")}
        preflight = snippet("b03-preflight")
        run(preflight, values=migration_values)
        run(preflight, values=migration_values | {"CAMPAIGNS_NEW": str(new_data)}, success=False)
        run(preflight, values={"DATA_NEW": str(data), "CAMPAIGNS_NEW": str(campaigns)}, success=False)
        (new_data / "stray.json").write_text("{}")
        run(preflight, values=migration_values, success=False)
        (new_data / "stray.json").unlink()
        (new_data / "broken").symlink_to(base / "absent")
        run(preflight, values=migration_values, success=False)
        (new_data / "broken").unlink()
        bad_source = base / "bad-source"
        shutil.copytree(data, bad_source)
        (bad_source / "campaigns/link.json").symlink_to(bad_source / "metadata-0.json")
        run(preflight.replace('/srv/jeu/amazonia/data', str(bad_source)),
            values=migration_values, success=False)
        run(preflight, values=migration_values)
        migration = snippet("b03-copy")
        cp_line = migration.splitlines()[0]
        run(cp_line, values=migration_values)
        # The comparison Python is run unchanged; do not run chown/chmod here.
        comparison = migration[migration.index("sudo python3 -"):]
        comparison = comparison.split("\nPY\n", 1)[0] + "\nPY"
        run(comparison, values=migration_values)
        require(files(new_data) == original_files, "B03 changed 16-file tree")
        require(not (new_data / "data").exists(), "B03 introduced extra data level")
        run(preflight, values=migration_values, success=False)
        unchanged()
        results.append("B03: actual cp data/. preserves 16 files without data/data; guards refuse wrong, same, nonempty or linked roots")

        rollback = stage / "rollback-json"
        rollback.mkdir()
        rollback_command = next(line for line in document.splitlines()
                                if line.startswith("sudo tar ") and '"$STAGE/data.final.tar" -C "$STAGE/rollback-json"' in line)
        run(rollback_command)
        rb_values = {"RESTORE_DATA": str(rollback / "data"),
                     "RESTORE_CAMPAIGNS": str(rollback / "data/campaigns")}
        run(snippet("verify-json-copy"), values=rb_values)
        run(snippet("load-restored"), values=rb_values)
        require(json.loads(report.read_text()) == expected, "Rollback copy campaigns differ")
        legacy_preserved(rollback / "data")
        unchanged()
        results.append("RB03: actual archive extraction reloads rollback-json/data/campaigns, originals unchanged")

    require(not subprocess.check_output(["git", "-C", str(code), "status", "--porcelain"]),
            "Amazonia checkout was modified")
    print("Amazonia", head, "| Node", version)
    for result in results:
        print("PASS:", result)
    print(f"PASS: {len(results)} validation groups; disposable fixtures only; no service/network/secret operation")


if __name__ == "__main__":
    main()
