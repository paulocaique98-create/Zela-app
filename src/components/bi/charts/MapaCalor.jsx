import React from 'react';
import { CORES_SEQUENCIAIS } from '../../../lib/bi/coresEntidade';

// Mapa de calor turma × semana em grade HTML (sem Recharts): uma cor só, do claro ao escuro.
// dados: [{ turma, semana: 'AAAA-MM-DD', valor }]. faixas: limites inferiores de cada cor, em ordem.
const FAIXAS = [0, 60, 75, 85, 95];
const faixaDe = (v) => FAIXAS.reduce((acc, limite, i) => (v >= limite ? i : acc), 0);
const diaMes = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);

export default function MapaCalor({ dados, formatar, onSelecionar, selecionados = new Set() }) {
  const semanas = [...new Set(dados.map(d => d.semana))].sort();
  const turmas = [...new Set(dados.map(d => d.turma))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const valor = new Map(dados.map(d => [`${d.turma}|${d.semana}`, d.valor]));
  const temSelecao = selecionados.size > 0;

  return (
    <div className="h-full overflow-auto">
      <div className="grid gap-1 text-[11px] min-w-max" style={{ gridTemplateColumns: `minmax(90px, 120px) repeat(${semanas.length}, minmax(44px, 1fr))` }}>
        <div />
        {semanas.map(s => <div key={s} className="text-center text-on-surface-variant">{diaMes(s)}</div>)}
        {turmas.map(t => (
          <React.Fragment key={t}>
            <button
              type="button"
              onClick={onSelecionar ? () => onSelecionar(t) : undefined}
              className={`text-left truncate pr-2 text-on-surface ${temSelecao && !selecionados.has(t) ? 'opacity-50' : ''}`}
              title={t}
            >
              {t}
            </button>
            {semanas.map(s => {
              const v = valor.get(`${t}|${s}`);
              if (v === undefined || v === null) return <div key={s} className="h-7 rounded bg-surface-container" aria-label={`${t}, semana de ${diaMes(s)}: sem registros`} />;
              const i = faixaDe(v);
              return (
                <div
                  key={s}
                  className="h-7 rounded flex items-center justify-center font-medium"
                  style={{ background: CORES_SEQUENCIAIS[i], color: i >= 3 ? '#fff' : 'var(--color-on-surface)', opacity: temSelecao && !selecionados.has(t) ? 0.5 : 1 }}
                  title={`${t}, semana de ${diaMes(s)}: ${formatar(v)}`}
                >
                  {formatar(v)}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-3 text-[11px] text-on-surface-variant" aria-hidden="true">
        <span>Menos presença</span>
        {CORES_SEQUENCIAIS.map((c, i) => <span key={i} className="h-3 w-6 rounded-sm" style={{ background: c }} />)}
        <span>Mais presença</span>
      </div>
    </div>
  );
}
