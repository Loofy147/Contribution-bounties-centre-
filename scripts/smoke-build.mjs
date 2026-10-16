import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

const distDirectory = resolve('dist');
const htmlPath = join(distDirectory, 'index.html');
const html = await readFile(htmlPath, 'utf8');
const references = [...html.matchAll(/(?:src|href)="\.\/([^"]+)"/g)]
  .map(match => match[1]);

assert.ok(references.length > 0, 'built HTML must reference at least one generated asset');

const resolvedAssets = references.map(reference => {
  const path = resolve(distDirectory, reference);
  assert.ok(
    path.startsWith(distDirectory + sep),
    'generated asset must remain inside dist: ' + reference,
  );
  return { reference, path };
});

for (const asset of resolvedAssets) {
  const metadata = await stat(asset.path);
  assert.ok(metadata.isFile() && metadata.size > 0, 'generated asset is missing or empty: ' + asset.reference);
}

const javascript = resolvedAssets.filter(asset => asset.reference.endsWith('.js'));
assert.ok(javascript.length > 0, 'built HTML must reference a JavaScript bundle');

const jsSources = await Promise.all(javascript.map(asset => readFile(asset.path, 'utf8')));
assert.ok(
  jsSources.some(source => source.includes('@appdeploy/client')),
  'the local validation build must preserve the AppDeploy-injected client as an external import',
);

console.log(
  'Build artifact smoke passed: index.html, ' +
  resolvedAssets.length +
  ' referenced assets, ' +
  javascript.length +
  ' JavaScript bundle(s), AppDeploy client import retained.',
);
