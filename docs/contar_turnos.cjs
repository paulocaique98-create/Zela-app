// Conta turnos por sessão do Claude Code para a pasta atual (somente leitura).
// Uso (da raiz do projeto): node docs/contar_turnos.js
const fs = require('fs');
const path = require('path');
const os = require('os');

const pasta = process.cwd().replace(/[^a-zA-Z0-9]/g, '-');
const base = path.join(os.homedir(), '.claude', 'projects');
const dir = fs.readdirSync(base).find((d) => d.toLowerCase() === pasta.toLowerCase());
if (!dir) {
    console.log('Pasta de logs não encontrada para:', process.cwd());
    process.exit(1);
}

const dp = path.join(base, dir);
for (const f of fs.readdirSync(dp).filter((x) => x.endsWith('.jsonl'))) {
    const vistos = new Set();
    let ctxMax = 0;
    for (const l of fs.readFileSync(path.join(dp, f), 'utf8').split('\n')) {
        if (!l) continue;
        let o;
        try { o = JSON.parse(l); } catch { continue; }
        const m = o.message;
        if (o.type === 'assistant' && m && m.usage && m.model !== '<synthetic>') {
            const u = m.usage;
            vistos.add((m.id || o.uuid) + u.output_tokens + u.cache_read_input_tokens);
            const ctx = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
            if (ctx > ctxMax) ctxMax = ctx;
        }
    }
    console.log(f.slice(0, 8), 'turnos:', vistos.size, '| contexto máximo:', ctxMax);
}