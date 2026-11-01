"""Container-only source packaging with an allowlist, per-file manifest and archive hash."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import zipfile

root = Path("/workspace")
output = Path("/output")
output.mkdir(parents=True, exist_ok=True)
blocked = {"node_modules", ".next", "target", "coverage", ".git", ".DS_Store", "__pycache__", "data", "docs"}
files = []
for folder in ("source", ".github"):
    for path in (root / folder).rglob("*"):
        relative = path.relative_to(root)
        if path.is_symlink() or not path.is_file() or any(part in blocked for part in relative.parts):
            continue
        if path.name.startswith(".env") and path.name != ".env.example":
            continue
        if path.suffix in {".log", ".tsbuildinfo", ".pyc", ".zip"}:
            continue
        files.append(path)
files.extend(root / name for name in (".gitignore", "README.md"))
files = sorted(set(files), key=lambda p: p.relative_to(root).as_posix())
archive = output / f"material-studio-source-{datetime.now(timezone.utc):%Y-%m-%d}.zip"
manifest = []
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
    for path in files:
        name = path.relative_to(root).as_posix()
        data = path.read_bytes()
        manifest.append(f"{hashlib.sha256(data).hexdigest()}  {name}")
        bundle.writestr(f"material-studio/{name}", data)
    bundle.writestr("material-studio/MANIFEST.sha256", "\n".join(manifest) + "\n")
# Read it back, check every entry, ensure no secret/cache slipped through.
with zipfile.ZipFile(archive) as bundle:
    assert bundle.testzip() is None
    for line in manifest:
        digest, name = line.split("  ", 1)
        assert hashlib.sha256(bundle.read(f"material-studio/{name}")).hexdigest() == digest
    names = bundle.namelist()
    assert "material-studio/.github/workflows/ci.yml" in names
    assert "material-studio/source/.env.example" in names
    assert all(not (Path(name).name.startswith(".env") and Path(name).name != ".env.example") for name in names)
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
archive.with_suffix(".zip.sha256").write_text(f"{digest}  {archive.name}\n")
print(f"Verified {len(files)} source files + MANIFEST.sha256; {archive.name}; SHA-256 {digest}")
