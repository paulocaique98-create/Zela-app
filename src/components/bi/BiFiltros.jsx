import React, { useEffect, useRef } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { Field, inputCls as inputBase, Notice } from '../GestaoShared';
import { PRESETS_PERIODO, COMPARACOES, validarPeriodo } from '../../lib/bi/periodos';

// Barra de filtros do painel (controlada). Uma linha; no celular rola na horizontal.
// valor: { preset, inicio, fim, comparacao, turmas: [], turno, serie, metodo }
// opcoes: { turmas: [], turnos: [], series: [], metodos: [] }  (listas de texto)
// Quem usa decide a persistência (sessionStorage por usuário) e chama a RPC.
// Controles compactos da barra do topo.
const inputCls = `${inputBase} !py-1 !px-2 !text-xs !w-auto`;

export const FILTROS_VAZIOS = { turmas: [], turno: '', serie: '', metodo: '' };

function SelectUnico({ id, label, valor, opcoes, onChange }) {
  if (!opcoes?.length) return null;
  return (
    <div className="shrink-0">
      <Field label={label} id={id}>
        <select id={id} value={valor} onChange={e => onChange(e.target.value)} className={inputCls}>
          <option value="">Todos</option>
          {opcoes.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </Field>
    </div>
  );
}

function SelectTurmas({ valor, opcoes, onChange }) {
  const ref = useRef(null);
  // Fecha a lista ao clicar fora ou apertar Esc, mesmo sem marcar nada.
  useEffect(() => {
    const fechar = (e) => {
      const el = ref.current;
      if (el?.open && (e.type === 'keydown' ? e.key === 'Escape' : !el.contains(e.target))) el.open = false;
    };
    document.addEventListener('pointerdown', fechar);
    document.addEventListener('keydown', fechar);
    return () => {
      document.removeEventListener('pointerdown', fechar);
      document.removeEventListener('keydown', fechar);
    };
  }, []);
  if (!opcoes?.length) return null;
  const alternar = (t) => onChange(valor.includes(t) ? valor.filter(x => x !== t) : [...valor, t]);
  return (
    <div className="shrink-0 min-w-36 relative">
      <p className="block text-[11px] font-semibold text-on-surface-variant mb-0.5">Turma</p>
      <details ref={ref} className="group">
        <summary className={`${inputCls} flex items-center justify-between cursor-pointer list-none`}>
          <span className="whitespace-nowrap">{valor.length ? `${valor.length} selecionada${valor.length > 1 ? 's' : ''}` : 'Todas'}</span>
          <ChevronDown size={16} className="shrink-0 transition group-open:rotate-180" />
        </summary>
        <ul className="absolute z-20 mt-1 min-w-full w-max max-h-60 overflow-y-auto bg-surface-container-lowest border border-outline-variant rounded-zela-md shadow-lg p-1">
          {opcoes.map(t => (
            <li key={t}>
              <label className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-zela-md hover:bg-surface-container cursor-pointer">
                <input type="checkbox" checked={valor.includes(t)} onChange={() => alternar(t)} className="accent-primary" />
                <span className="whitespace-nowrap">{t}</span>
              </label>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function Chip({ children, onRemover }) {
  return (
    <span className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 text-xs font-semibold text-primary bg-primary/10 rounded-zela-md shrink-0">
      {children}
      <button type="button" onClick={onRemover} className="p-0.5 rounded hover:bg-primary/15" aria-label={`Remover filtro ${children}`}><X size={12} /></button>
    </span>
  );
}

export default function BiFiltros({ valor, opcoes = {}, onChange }) {
  const mudar = (patch) => onChange({ ...valor, ...patch });

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="shrink-0">
        <Field label="Período" id="bi-periodo">
          <select id="bi-periodo" value={valor.preset} onChange={e => mudar({ preset: e.target.value })} className={inputCls}>
            {PRESETS_PERIODO.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </Field>
      </div>
      {valor.preset === 'personalizado' && (
        <>
          <div className="shrink-0 w-36"><Field label="De" id="bi-inicio"><input id="bi-inicio" type="date" value={valor.inicio || ''} onChange={e => mudar({ inicio: e.target.value })} className={inputCls} /></Field></div>
          <div className="shrink-0 w-36"><Field label="Até" id="bi-fim"><input id="bi-fim" type="date" value={valor.fim || ''} onChange={e => mudar({ fim: e.target.value })} className={inputCls} /></Field></div>
        </>
      )}
      <div className="shrink-0">
        <Field label="Comparar com" id="bi-comparar">
          <select id="bi-comparar" value={valor.comparacao} onChange={e => mudar({ comparacao: e.target.value })} className={inputCls}>
            {COMPARACOES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </Field>
      </div>
      <SelectTurmas valor={valor.turmas} opcoes={opcoes.turmas} onChange={turmas => mudar({ turmas })} />
      <SelectUnico id="bi-turno" label="Turno" valor={valor.turno} opcoes={opcoes.turnos} onChange={turno => mudar({ turno })} />
      <SelectUnico id="bi-serie" label="Série" valor={valor.serie} opcoes={opcoes.series} onChange={serie => mudar({ serie })} />
      <SelectUnico id="bi-metodo" label="Método" valor={valor.metodo} opcoes={opcoes.metodos} onChange={metodo => mudar({ metodo })} />
    </div>
  );
}

// Aviso de período inválido e chips dos filtros ativos; fica abaixo da barra, no corpo da tela.
export function BiFiltrosResumo({ valor, onChange, onLimpar }) {
  const erroPeriodo = valor.preset === 'personalizado' ? validarPeriodo(valor) : null;
  const temFiltro = valor.turmas.length > 0 || valor.turno || valor.serie || valor.metodo;
  const mudar = (patch) => onChange({ ...valor, ...patch });
  if (!erroPeriodo && !temFiltro) return null;
  return (
    <div className="space-y-3">
      {erroPeriodo && <Notice type="error">{erroPeriodo}</Notice>}

      {temFiltro && (
        <div className="flex items-center gap-2 flex-wrap">
          {valor.turmas.map(t => <Chip key={t} onRemover={() => mudar({ turmas: valor.turmas.filter(x => x !== t) })}>{t}</Chip>)}
          {valor.turno && <Chip onRemover={() => mudar({ turno: '' })}>{valor.turno}</Chip>}
          {valor.serie && <Chip onRemover={() => mudar({ serie: '' })}>{valor.serie}</Chip>}
          {valor.metodo && <Chip onRemover={() => mudar({ metodo: '' })}>{valor.metodo}</Chip>}
          <button type="button" onClick={onLimpar} className="text-xs font-semibold text-primary hover:underline">Limpar filtros</button>
        </div>
      )}
    </div>
  );
}
