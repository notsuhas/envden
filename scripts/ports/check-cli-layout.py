"""Check the proposed CLI package DAG against the file-level TS imports."""
import pathlib
import re
import sys

root = pathlib.Path(__file__).resolve().parents[2]
source = root / 'apps/cli/src'
doc = (root / 'docs/ports/go-cli-layout.md').read_text()
mapping = {}
for name, target in re.findall(r'^\| `([^`]+)` \| `([^`]+)` \|$', doc, re.M):
    if not (source / name).is_file():
        continue
    mapping[name] = str(pathlib.PurePosixPath(target.split(' + ')[0]).parent)
files = sorted(p for p in source.rglob('*.ts') if '__tests__' not in p.parts)
missing = [str(p.relative_to(source)) for p in files if str(p.relative_to(source)) not in mapping]
if missing:
    sys.exit(f'Unmapped files: {missing}')
graph = {mapping[str(p.relative_to(source))]: set() for p in files}
edges = 0
for path in files:
    name = str(path.relative_to(source))
    for match in re.finditer(r'(?:from\s*|import\s*\()(["\'])(\.[^"\']+)\1', path.read_text()):
        target = (path.parent / match[2]).resolve()
        if not target.is_relative_to(source):
            continue
        dep = str(target.relative_to(source))
        if dep not in mapping or target.suffix != '.ts':
            continue
        edges += 1
        if dep == 'adapters.ts':
            continue
        if name == 'output/render/sync/conflicts.ts' and dep in ('sync/resolve.ts', 'sync/local/conflicts.ts'):
            continue
        if name == 'settings/unlock-period.ts' and dep == 'vault/connection.ts':
            continue
        if name == 'client/request.ts' and dep.startswith('updates/'):
            continue
        if name == 'adapters.ts' and dep.startswith(('agent/', 'updates/')):
            continue
        a, b = mapping[name], mapping[dep]
        if a != b:
            graph[a].add(b)
visited, active, levels = set(), [], {}
def visit(node):
    if node in active:
        sys.exit('Package cycle: ' + ' -> '.join(active + [node]))
    if node in visited:
        return levels[node]
    active.append(node)
    rank = max([visit(dep) + 1 for dep in graph[node]] or [0])
    active.pop()
    visited.add(node)
    levels[node] = rank
    return rank
for node in graph:
    visit(node)
print(f'{len(files)} TS files, {edges} imports, {len(graph)} proposed packages: DAG')
if '--layers' in sys.argv:
    for rank in sorted(set(levels.values())):
        print(f'{rank}: ' + ', '.join(sorted(k for k, v in levels.items() if v == rank)))
