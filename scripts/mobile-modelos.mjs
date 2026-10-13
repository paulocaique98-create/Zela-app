// Só para o build do app: o servidor local do Capacitor entrega arquivos sem
// extensão (os pedaços "-shardN" do face-api) com a codificação errada e os
// pesos chegam truncados ("tensor should have 512 values but has 290").
// Renomeia cada shard para ".bin" e ajusta o manifesto. A Web não é afetada.
import { readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join('dist', 'models');
for (const f of readdirSync(dir)) {
  if (/-shard\d+$/.test(f)) renameSync(join(dir, f), join(dir, `${f}.bin`));
}
for (const f of readdirSync(dir).filter((n) => n.endsWith('-weights_manifest.json'))) {
  const p = join(dir, f);
  const m = JSON.parse(readFileSync(p, 'utf8'));
  for (const g of m) g.paths = g.paths.map((x) => (x.endsWith('.bin') ? x : `${x}.bin`));
  writeFileSync(p, JSON.stringify(m));
}
console.log('[mobile] shards do face-api renomeados para .bin');
