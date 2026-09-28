import React, { useMemo, useState } from 'react';
import {
  RefreshCw, CheckCircle2, Inbox, ShieldCheck, Wallet, Clock, UserPlus, GraduationCap, FileSignature,
  UserX, AlertTriangle, Receipt, FileWarning, ScanFace,
} from 'lucide-react';
import { useGestaoPendencias } from '../hooks/useGestaoPendencias';
import { buildPendencias, PRIORIDADES } from '../lib/pendenciasModel';
import { centsToBRL, todayISO } from '../lib/gestaoUtils';
import { PageShell, Loading, Notice, SecondaryButton } from './GestaoShared';

// Pendências da Gestão · Modelo 4 (aprovado em 28/09/2026): os quatro
// números e as áreas do "Painel por área" + a fila do "Fila por prioridade".
// As regras (o que é urgente, os números, as áreas) ficam em
// src/lib/pendenciasModel.js; aqui é só a apresentação.

const AREA_ICON = { lgpd: ShieldCheck, financeiro: Wallet, presenca: Clock, cadastros: UserPlus, secretaria: GraduationCap, contratos: FileSignature };
const ROW_ICON = {
  exclusao: UserX, biometria: ScanFace, vencidas: AlertTriangle, despesas: Receipt, correcoes: Clock,
  cadastros: UserPlus, matriculas: GraduationCap, documentos: FileWarning, contratos: FileSignature,
};

// Cores por prioridade (texto escuro o bastante sobre o fundo claro).
const TONE = {
  urgente: { title: 'text-error', dot: 'bg-error', tint: 'bg-red-50 text-error', num: 'bg-error text-white', badge: 'bg-red-50 text-error' },
  semana: { title: 'text-amber-800', dot: 'bg-warning', tint: 'bg-amber-50 text-amber-800', num: 'bg-amber-100 text-amber-800', badge: 'bg-amber-50 text-amber-800' },
  acompanhar: { title: 'text-on-surface-variant', dot: 'bg-outline', tint: 'bg-surface-container-low text-primary', num: 'bg-surface-container-low text-primary', badge: 'bg-surface-container-low text-on-surface-variant' },
};

function Kpi({ label, value, hint, valueClass = 'text-on-surface' }) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-zela-lg px-3 py-2.5 md:px-4 md:py-3.5 flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] md:text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">{label}</span>
      <span className={`text-lg md:text-2xl font-black tabular-nums truncate ${valueClass}`}>{value}</span>
      {hint && <span className="hidden md:block text-xs text-on-surface-variant truncate">{hint}</span>}
    </div>
  );
}

export default function GestaoPendencias({ currentUser, setGestaoTab }) {
  const { isLoading, data, error, refresh } = useGestaoPendencias(currentUser);
  const [area, setArea] = useState('todas');
  const model = useMemo(() => buildPendencias(data, todayISO()), [data]);
  const rows = area === 'todas' ? model.rows : model.rows.filter(r => r.area === area);

  const areaButtons = [{ key: 'todas', label: 'Todas as áreas', count: model.rows.length, resumo: `${model.rows.length} pendência${model.rows.length === 1 ? '' : 's'}` }, ...model.areas];

  return (
    <PageShell
      description="Tudo o que depende da Gestão: o resumo, as áreas e a fila por prioridade."
      actions={<SecondaryButton onClick={refresh}><RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} /> Atualizar</SecondaryButton>}
    >
      <Notice>{error}</Notice>
      {isLoading && !data ? <Loading /> : data && (
        <div className="flex flex-col gap-4 md:gap-5">
          {/* Números do topo */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3">
            <Kpi label="Precisam de ação hoje" value={model.kpis.hoje} hint={model.kpis.hojeHint} valueClass={model.kpis.hoje ? 'text-error' : 'text-emerald-700'} />
            <Kpi label="Para esta semana" value={model.kpis.semana} hint={model.kpis.semanaHint} valueClass={model.kpis.semana ? 'text-amber-800' : 'text-emerald-700'} />
            <Kpi label="Valor em atraso" value={centsToBRL(model.kpis.atrasoCents)} hint={model.kpis.atrasoHint} />
            <Kpi label="Prazo mais próximo" value={model.kpis.prazo} hint={model.kpis.prazoHint} />
          </div>

          {model.rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-16">
              <CheckCircle2 size={36} className="text-emerald-600 mb-2" />
              <p className="font-bold text-on-surface">Nenhuma pendência no momento.</p>
            </div>
          ) : (
            <>
              {/* Áreas · celular: botões que deslizam */}
              <div className="md:hidden flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filtrar por área">
                {areaButtons.map(a => (
                  <button
                    key={a.key}
                    onClick={() => setArea(a.key)}
                    aria-pressed={area === a.key}
                    className={`shrink-0 flex items-center gap-2 min-h-[44px] rounded-full border px-3.5 text-sm font-bold whitespace-nowrap ${area === a.key ? 'bg-on-surface border-on-surface text-white' : 'bg-surface-container-lowest border-outline-variant text-on-surface'}`}
                  >
                    {a.key === 'todas' ? `Todas · ${a.count}` : a.label}
                    {a.key !== 'todas' && <span className={`min-w-[22px] h-[22px] px-1.5 rounded-full text-[11px] font-black flex items-center justify-center ${TONE[a.worst].num}`}>{a.count}</span>}
                  </button>
                ))}
              </div>

              {/* Áreas · tablet: grade de cartões */}
              <div className="hidden md:grid lg:hidden grid-cols-3 gap-2" role="group" aria-label="Filtrar por área">
                {areaButtons.map(a => (
                  <AreaButton key={a.key} a={a} active={area === a.key} onClick={() => setArea(a.key)} compact />
                ))}
              </div>

              <div className="flex gap-6 items-start">
                {/* Áreas · computador: coluna à esquerda */}
                <aside className="hidden lg:flex w-72 shrink-0 flex-col gap-0.5" aria-label="Filtrar por área">
                  <p className="ml-3 mb-1.5 text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">Por área</p>
                  {areaButtons.map(a => (
                    <AreaButton key={a.key} a={a} active={area === a.key} onClick={() => setArea(a.key)} />
                  ))}
                </aside>

                {/* Fila por prioridade */}
                <div className="flex-1 min-w-0 flex flex-col gap-4">
                  {PRIORIDADES.map(p => {
                    const items = rows.filter(r => r.priority === p.key);
                    if (items.length === 0) return null;
                    const tone = TONE[p.key];
                    return (
                      <section key={p.key} className="flex flex-col gap-2">
                        <h2 className={`m-0 flex items-center gap-2 text-xs md:text-[13px] font-black uppercase tracking-wide ${tone.title}`}>
                          <span className={`w-2 h-2 rounded-full ${tone.dot}`} />{p.label}
                        </h2>
                        <div className="flex flex-col gap-2 md:gap-0 md:bg-surface-container-lowest md:border md:border-outline-variant md:rounded-zela-lg md:divide-y md:divide-outline-variant/50">
                          {items.map(r => {
                            const Icon = ROW_ICON[r.icon] || Inbox;
                            return (
                              <div key={r.key} className="bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-3.5 flex flex-col gap-3 md:border-0 md:rounded-none md:bg-transparent md:flex-row md:items-center md:gap-3.5 md:px-4 md:py-3">
                                <div className="flex items-start md:items-center gap-3 flex-1 min-w-0">
                                  <div className={`w-9 h-9 rounded-zela-md flex items-center justify-center shrink-0 ${tone.tint}`}><Icon size={18} /></div>
                                  <div className="min-w-0">
                                    <p className="text-[15px] md:text-sm font-bold text-on-surface">{r.title}</p>
                                    {r.meta && <p className="text-[13px] md:text-xs text-on-surface-variant">{r.meta}</p>}
                                  </div>
                                </div>
                                {r.badge && <span className={`hidden lg:inline-block text-xs font-bold rounded-full px-2.5 py-1 whitespace-nowrap ${tone.badge}`}>{r.badge}</span>}
                                <button
                                  onClick={() => setGestaoTab(r.tab)}
                                  className={`w-full md:w-auto min-h-[44px] md:min-h-0 rounded-zela-md px-3.5 py-2.5 md:py-2 text-sm md:text-[13px] font-bold whitespace-nowrap ${p.key === 'urgente' ? 'bg-primary text-white hover:bg-primary-container' : 'bg-surface-container-low text-primary hover:bg-primary/10'}`}
                                >
                                  {r.action}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                  {rows.length === 0 && <p className="text-sm text-on-surface-variant">Nenhuma pendência nesta área.</p>}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </PageShell>
  );
}

function AreaButton({ a, active, onClick, compact = false }) {
  const Icon = a.key === 'todas' ? Inbox : AREA_ICON[a.key];
  const tone = a.worst ? TONE[a.worst] : null;
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`w-full flex items-center gap-3 text-left rounded-zela-lg border transition min-h-[52px] ${compact ? 'px-3 py-2' : 'px-3 py-2.5'} ${
        active
          ? (compact ? 'bg-on-surface border-on-surface' : 'bg-surface-container-lowest border-outline-variant')
          : (compact ? 'bg-surface-container-lowest border-outline-variant hover:border-primary/40' : 'border-transparent hover:bg-surface-container-low')
      }`}
    >
      {!compact && (
        <span className={`w-8 h-8 rounded-zela-md flex items-center justify-center shrink-0 ${tone ? tone.tint : 'bg-surface-container-high text-primary'}`}><Icon size={17} /></span>
      )}
      <span className="flex-1 min-w-0">
        <span className={`block text-sm font-bold truncate ${compact && active ? 'text-white' : 'text-on-surface'}`}>{a.label}</span>
        {a.resumo && <span className={`block text-[11px] md:text-xs truncate ${compact && active ? 'text-white/80' : 'text-on-surface-variant'}`}>{a.resumo}</span>}
      </span>
      {a.key !== 'todas' && tone && (
        <span className={`min-w-[24px] h-6 px-2 rounded-full text-xs font-black flex items-center justify-center shrink-0 ${tone.num}`}>{a.count}</span>
      )}
    </button>
  );
}
