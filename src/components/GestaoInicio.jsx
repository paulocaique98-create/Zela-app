import React, { useEffect, useState } from 'react';
import { ArrowRight, Wallet, Clock, ClipboardCheck, GraduationCap, FileText, Users, School, Bell, Receipt, FileSignature, BarChart3, LayoutDashboard, CalendarDays, Megaphone, UserCheck, AlertOctagon, Banknote, BookOpen, UtensilsCrossed, Soup } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useGestaoPendencias } from '../hooks/useGestaoPendencias';
import { centsToBRL, monthRange } from '../lib/gestaoUtils';
import { StatCard } from './GestaoShared';
import { agruparEventosPorDia, calcularCobrancaDoDia, mergeBillingConfig, getBrasiliaDateStr } from '../utils/attendanceUtils';
import { podeAbrirAba, chaveLigada, recursosDoPerfil, rotuloDoPerfil } from '../lib/perfisGestao';

// Início da Gestão: números do dia no topo (cada um leva à tela onde se
// resolve) e atalhos abaixo.
// Acesso rápido: só 6 atalhos, os mais usados por esta conta primeiro
// (mesma regra dos outros portais: ordem por clickCounts; empate mantém a
// ordem abaixo, que é o padrão de quem ainda não usou nada).
const MAX_ATALHOS = 6;

export default function GestaoInicio({ currentUser, currentSchool, setGestaoTab, clickCounts = {} }) {
  const features = currentSchool?.features_enabled || {};
  const recursos = recursosDoPerfil(currentUser?.role);
  // Coordenação e Direção nunca veem valores (29/09/2026).
  const showFinanceiro = chaveLigada(features, 'financeiro') && recursos.financeiro;
  const showCheckin = chaveLigada(features, 'checkin');
  const { data: pend } = useGestaoPendencias(currentUser);
  const [fin, setFin] = useState(null);
  const [ops, setOps] = useState(null);

  // Horas extras do mês (mesmo cálculo da tela Horas Extras).
  useEffect(() => {
    const schoolId = currentUser?.school_id;
    if (!schoolId || !showFinanceiro || !showCheckin) return;
    (async () => {
      const { data } = await supabase.from('attendance_logs')
        .select('id, event_type, event_time, student_id, students:student_id (name, contracted_entry_time, contracted_exit_time, weekly_schedule, isento_hora_extra)')
        .eq('school_id', schoolId)
        .gte('event_time', `${monthRange(0).start}T00:00:00-03:00`)
        .lte('event_time', `${getBrasiliaDateStr()}T23:59:59-03:00`)
        .order('student_id').order('event_time');
      const cfg = mergeBillingConfig(currentSchool?.billing_config);
      let extrasCents = 0;
      let extrasMinutos = 0;
      agruparEventosPorDia(data || []).forEach(d => {
        const st = d.studentData || {};
        const r = calcularCobrancaDoDia({ entryIso: d.entryLog?.event_time || null, exitIso: d.exitLog?.event_time || null, contractedEntryTime: st.contracted_entry_time, contractedExitTime: st.contracted_exit_time, weeklySchedule: st.weekly_schedule, billingConfig: cfg, isentoHoraExtra: st.isento_hora_extra });
        if (r.valor > 0) { extrasCents += Math.round(r.valor * 100); extrasMinutos += r.minutos_excedentes || 0; }
      });
      setOps({ extrasCents, extrasMinutos });
    })();
  }, [showFinanceiro, showCheckin, currentUser?.school_id, currentSchool?.billing_config]);

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
    { key: 'relatorios-painel', label: 'Dashboard', icon: LayoutDashboard, tab: 'relatorios-painel' },
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
    <div className="h-full -m-3 sm:m-0 bg-surface p-2.5 sm:p-4 md:p-5 lg:p-6 overflow-y-auto lg:overflow-hidden flex flex-col">
      <div className="w-full mt-0">
        <div className="mb-2 shrink-0">
          <h1 className="text-h1-mobile md:text-h1 text-on-surface tracking-tight">Painel da {rotuloDoPerfil(currentUser)}</h1>
        </div>

        {showFinanceiro && (
          <>
            <h2 className="text-sm font-bold text-on-surface-variant mb-1.5">Financeiro</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-3">
              <StatCard compact label="Recebido no mês" value={fin ? centsToBRL(fin.recebido) : '·'} tone="good" hint={fin ? `de ${centsToBRL(fin.previsto)} previstos` : ''} onClick={() => setGestaoTab('financeiro-visao')} />
              <StatCard compact label="A receber no mês" value={fin ? centsToBRL(Math.max(fin.previsto - fin.recebido, 0)) : '·'} tone="warn" hint="mensalidades em aberto" onClick={() => setGestaoTab('financeiro-cobrancas')} />
              <StatCard compact label="Em atraso" value={pend ? centsToBRL(pend.vencidasTotal) : '·'} tone={pend?.vencidasTotal ? 'bad' : 'good'} hint={pend ? `${pend.vencidas.length} cobrança(s)` : ''} onClick={() => setGestaoTab('financeiro-inadimplencia')} />
              {showCheckin ? (
                <StatCard compact label="A receber de horas extras" value={ops ? centsToBRL(ops.extrasCents) : '·'} tone={ops?.extrasCents ? 'warn' : 'good'} hint={ops ? `${ops.extrasMinutos} minutos no mês` : ''} onClick={() => setGestaoTab('horas-extras')} />
              ) : (
                <StatCard compact label="Contas a pagar" value={pend ? pend.despesas.length : '·'} tone={pend?.despesasAtrasadas.length ? 'bad' : 'default'} hint="vencem em até 7 dias" onClick={() => setGestaoTab('financeiro-despesas')} />
              )}
            </div>
          </>
        )}

        <h2 className="text-sm font-bold text-on-surface-variant mb-1.5">Operacional</h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
          {menus.map(menu => (
            <button
              key={menu.key}
              onClick={() => setGestaoTab(menu.tab)}
              className={`bg-surface-container-lowest px-3 py-2 rounded-zela-lg shadow-sm hover:shadow-md transition-all flex items-center gap-3 text-left ${menu.badge ? 'ring-2 ring-brass' : ''}`}
            >
              <div className="w-8 h-8 shrink-0 rounded-zela-md bg-primary/10 text-primary flex items-center justify-center">
                <menu.icon size={20} />
              </div>
              <div>
                <span className="text-label text-on-surface block">{menu.label}</span>
                <span className="text-caption text-on-surface-variant flex items-center gap-1 mt-0.5">Acessar <ArrowRight size={11} />{menu.badge && (
                  <span className="ml-1.5 bg-brass text-[#1a1405] text-[10px] leading-none font-semibold rounded-sm min-w-[16px] h-4 px-1 flex items-center justify-center shrink-0">{menu.badge}</span>
                )}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
