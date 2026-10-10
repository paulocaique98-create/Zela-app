import React, { useEffect, useState } from 'react';
import { ArrowRight, Wallet, Clock, ClipboardCheck, GraduationCap, FileText, Users, School, Bell, Receipt, FileSignature, BarChart3, CalendarDays, Megaphone, UserCheck, AlertOctagon, Banknote, BookOpen, UtensilsCrossed, Soup } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useGestaoPendencias } from '../hooks/useGestaoPendencias';
import { centsToBRL, monthRange } from '../lib/gestaoUtils';
import { StatCard } from './GestaoShared';
import { podeAbrirAba, chaveLigada, recursosDoPerfil, rotuloDoPerfil } from '../lib/perfisGestao';

// Início da Gestão: números do dia no topo (cada um leva à tela onde se
// resolve) e atalhos abaixo.
// Acesso rápido: só 8 atalhos, os mais usados por esta conta primeiro
// (mesma regra dos outros portais: ordem por clickCounts; empate mantém a
// ordem abaixo, que é o padrão de quem ainda não usou nada).
const MAX_ATALHOS = 8;

export default function GestaoInicio({ currentUser, currentSchool, setGestaoTab, clickCounts = {} }) {
  const features = currentSchool?.features_enabled || {};
  const recursos = recursosDoPerfil(currentUser?.role);
  // Coordenação e Direção nunca veem valores (29/09/2026).
  const showFinanceiro = chaveLigada(features, 'financeiro') && recursos.financeiro;
  const showCheckin = chaveLigada(features, 'checkin');
  const { data: pend } = useGestaoPendencias(currentUser);
  const [fin, setFin] = useState(null);

  useEffect(() => {
    if (!showFinanceiro || !currentUser?.school_id) return;
    const { start, end } = monthRange(0);
    (async () => {
      const [{ data: due }, { data: paid }] = await Promise.all([
        supabase.from('financial_charges').select('amount_cents, status').eq('school_id', currentUser.school_id).gte('due_date', start).lte('due_date', end).neq('status', 'CANCELLED'),
        supabase.from('financial_charges').select('amount_cents').eq('school_id', currentUser.school_id).eq('status', 'PAID').gte('paid_at', `${start}T00:00:00`).lte('paid_at', `${end}T23:59:59`),
      ]);
      setFin({
        previsto: (due || []).reduce((s, c) => s + c.amount_cents, 0),
        recebido: (paid || []).reduce((s, c) => s + c.amount_cents, 0),
      });
    })();
  }, [showFinanceiro, currentUser?.school_id]);

  const pendTotal = pend
    ? pend.cadastros.length + pend.matriculas.length
      + (recursos.aprovarCorrecaoQueGeraCobranca ? pend.correcoes.length + pend.contratos.length + pend.exclusoes.length : 0)
    : null;

  const menus = [
    { key: 'pendencias', label: 'Pendências', icon: Bell, tab: 'pendencias', badge: pendTotal || null },
    { key: 'secretaria-alunos', label: 'Alunos', icon: GraduationCap, tab: 'secretaria-alunos' },
    { key: 'secretaria-matriculas', label: 'Matrículas', icon: FileText, tab: 'secretaria-matriculas', badge: pend?.matriculas.length || null },
    { key: 'contratos-lista', label: 'Contratos', icon: FileSignature, tab: 'contratos-lista' },
    showFinanceiro && { key: 'financeiro-visao', label: 'Visão Financeira', icon: Wallet, tab: 'financeiro-visao' },
    showFinanceiro && { key: 'financeiro-cobrancas', label: 'Cobranças', icon: Receipt, tab: 'financeiro-cobrancas' },
    showCheckin && { key: 'attendance-corrections', label: 'Correções de Presença', icon: ClipboardCheck, tab: 'attendance-corrections', badge: pend?.correcoes.length || null },
    showCheckin && { key: 'horas-extras', label: 'Horas Extras', icon: Clock, tab: 'horas-extras' },
    { key: 'cadastros-usuarios', label: 'Usuários', icon: Users, tab: 'cadastros-usuarios', badge: pend?.cadastros.length || null },
    { key: 'cadastros-turmas', label: 'Turmas', icon: School, tab: 'cadastros-turmas' },
    { key: 'relatorios-gestao', label: 'Relatórios', icon: BarChart3, tab: 'relatorios-gestao' },
    showFinanceiro && { key: 'financeiro-inadimplencia', label: 'Inadimplência', icon: AlertOctagon, tab: 'financeiro-inadimplencia' },
    { key: 'financeiro-despesas', label: 'Despesas', icon: Banknote, tab: 'financeiro-despesas' },
    showCheckin && { key: 'presenca-dia', label: 'Presença do Dia', icon: UserCheck, tab: 'presenca-dia' },
    { key: 'calendario', label: 'Calendário', icon: CalendarDays, tab: 'calendario' },
    { key: 'comunicacao-comunicados', label: 'Comunicados', icon: Megaphone, tab: 'comunicacao-comunicados' },
    { key: 'academico-relatorios', label: 'Pedagógico', icon: BookOpen, tab: 'academico-relatorios' },
    { key: 'academico-cardapio', label: 'Cardápio', icon: UtensilsCrossed, tab: 'academico-cardapio' },
    { key: 'academico-diario', label: 'Diário', icon: Soup, tab: 'academico-diario' },
  ]
    .filter(Boolean)
    // Mesmo filtro do menu: cada perfil só tem atalho para o que vê.
    .filter(m => podeAbrirAba(currentUser?.role, m.tab, features))
    .map((m, index) => ({ ...m, index }))
    .sort((a, b) => ((clickCounts[b.tab] || 0) - (clickCounts[a.tab] || 0)) || (a.index - b.index))
    .slice(0, MAX_ATALHOS);

  return (
    <div className="h-full bg-surface p-4 md:p-6 lg:p-8 xl:p-10 overflow-y-auto flex flex-col">
      <div className="w-full mt-0">
        <div className="mb-6 shrink-0">
          <h1 className="text-h1-mobile md:text-h1 text-on-surface tracking-tight">Painel da {rotuloDoPerfil(currentUser)}</h1>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          <StatCard label="Pendências" value={pendTotal ?? '·'} tone={pendTotal ? 'warn' : 'good'} hint={recursos.financeiro ? 'cadastros, matrículas, correções, contratos e exclusões' : 'cadastros e matrículas'} onClick={() => setGestaoTab('pendencias')} />
          <StatCard label="Documentos faltando" value={pend ? pend.documentos.length : '·'} tone={pend?.documentos.length ? 'warn' : 'good'} hint="alunos ativos" onClick={() => setGestaoTab('secretaria-documentos')} />
          {showFinanceiro && (
            <>
              <StatCard label="Recebido no mês" value={fin ? centsToBRL(fin.recebido) : '·'} tone="good" hint={fin ? `de ${centsToBRL(fin.previsto)} previstos` : ''} onClick={() => setGestaoTab('financeiro-visao')} />
              <StatCard label="Em atraso" value={pend ? centsToBRL(pend.vencidasTotal) : '·'} tone={pend?.vencidasTotal ? 'bad' : 'good'} hint={pend ? `${pend.vencidas.length} cobrança(s)` : ''} onClick={() => setGestaoTab('financeiro-inadimplencia')} />
            </>
          )}
        </div>

        <h2 className="text-sm font-bold text-on-surface-variant mb-3">Acesso rápido</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {menus.map(menu => (
            <button
              key={menu.key}
              onClick={() => setGestaoTab(menu.tab)}
              className="bg-surface-container-lowest p-4 rounded-zela-lg shadow-sm hover:shadow-md hover:-translate-y-1 transition-all flex flex-col items-start gap-3 text-left relative"
            >
              {menu.badge && (
                <span className="absolute top-3 right-3 bg-error text-white text-[10px] font-semibold rounded-sm min-w-[20px] h-5 px-1.5 flex items-center justify-center shadow-md">
                  {menu.badge}
                </span>
              )}
              <div className="w-10 h-10 rounded-zela-md bg-primary/10 text-primary flex items-center justify-center">
                <menu.icon size={20} />
              </div>
              <div>
                <span className="text-label text-on-surface block">{menu.label}</span>
                <span className="text-caption text-on-surface-variant flex items-center gap-1 mt-0.5">Acessar <ArrowRight size={11} /></span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
