"""Package current connector sources so dashboard downloads match this checkout."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root = Path(__file__).resolve().parent.parent
for source, name in [('chrome-extension', 'contexa-chrome-extension.zip'), ('vscode-extension', 'contexa-vscode-extension.zip')]:
    output = root / 'public' / 'downloads' / name
    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
        for path in sorted((root / source).rglob('*')):
            if path.is_file() and not any(part in ('node_modules', '.git', '.DS_Store') for part in path.parts) and path.suffix != '.vsix':
                archive.write(path, path.relative_to(root / source))
    print(f'Packaged {source}: {output.relative_to(root)}')
# Preserve the older download URL as an alias.
(root / 'public' / 'contexa-chrome-extension.zip').write_bytes((root / 'public' / 'downloads' / 'contexa-chrome-extension.zip').read_bytes())
