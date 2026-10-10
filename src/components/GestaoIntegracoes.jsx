import React, { useEffect, useState } from 'react';
import { CreditCard, BellRing, Activity, CheckCircle2, AlertTriangle, MinusCircle, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PageShell, Loading } from './GestaoShared';

const STATE = {
  ok: { icon: CheckCircle2, cls: 'text-success bg-success/10', label: 'Funcionando' },
  warn: { icon: AlertTriangle, cls: 'text-warning bg-warning/15', label: 'Atenção' },
  off: { icon: MinusCircle, cls: 'text-on-surface-variant bg-surface-container', label: 'Não configurado' },
};

// Integrações: situação das conexões externas da escola. Só leitura; a
// chave do Asaas é cadastrada em Financeiro, Configuração.
export default function GestaoIntegracoes({ currentUser, currentSchool, setGestaoTab }) {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    const sid = currentUser.school_id;
    Promise.all([
      supabase.from('school_gateway_accounts').select('gateway, pix_key_registered, updated_at').eq('school_id', sid),
      supabase.from('payment_webhook_events').select('received_at, processed_at').eq('school_id', sid).order('received_at', { ascending: false }).limit(1),
      supabase.from('push_subscriptions').select('id', { count: 'exact', head: true }),
    ]).then(([gw, wh, push]) => {
      setInfo({ gateway: gw.data || [], lastEvent: wh.data?.[0] || null, pushCount: push.error ? null : push.count || 0 });
    });
  }, [currentUser.school_id]);

  // Financeiro é do plano base desde 01/10/2026 (sempre incluso).
  const financeiroOn = currentSchool?.features_enabled?.financeiro !== false;
  const asaas = info?.gateway.find(g => g.gateway === 'asaas');
  const daysSinceEvent = info?.lastEvent ? Math.floor((Date.now() - new Date(info.lastEvent.received_at)) / 86400000) : null;

  const cards = info && [
    {
      icon: CreditCard, title: 'Asaas (cobranças, PIX e boleto)',
      state: !financeiroOn || !asaas ? 'off' : daysSinceEvent !== null && daysSinceEvent > 45 ? 'warn' : 'ok',
      lines: [
        !financeiroOn ? { text: 'O módulo financeiro não está ativo para esta escola.', warn: true } : asaas ? `Chave cadastrada, atualizada em ${new Date(asaas.updated_at).toLocaleDateString('pt-BR')}` : { text: 'Nenhuma chave do Asaas cadastrada.', warn: true },
        asaas ? (asaas.pix_key_registered ? 'Chave PIX registrada no Asaas.' : { text: 'Chave PIX ainda não registrada no Asaas.', warn: true }) : null,
        info.lastEvent ? `Último aviso de pagamento recebido em ${new Date(info.lastEvent.received_at).toLocaleString('pt-BR')}.` : (asaas ? 'Nenhum aviso de pagamento recebido ainda.' : null),
      ],
      action: financeiroOn ? { label: 'Abrir configuração', tab: 'config-financeiro' } : null,
    },
    {
      icon: BellRing, title: 'Notificações no celular',
      state: 'ok',
      lines: ['Ativas para toda a escola. Cada pessoa autoriza no próprio aparelho.', info.pushCount !== null ? `${info.pushCount} aparelho(s) seus cadastrados para receber avisos.` : null],
    },
    {
      icon: Activity, title: 'Monitoramento de erros',
      state: 'ok',
      lines: ['Falhas do sistema são registradas e acompanhadas pelo suporte do Zela Escola automaticamente.'],
    },
  ];

  return (
    <PageShell description="Conexões do Zela Escola com serviços externos." infoOnMobile>
      {!info ? <Loading /> : (
        <div className="grid gap-3 lg:grid-cols-2 items-start">
          {cards.map(c => {
            const st = STATE[c.state];
            const chip = <span className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-sm text-[11px] font-semibold ${st.cls}`}><st.icon size={12} /> {st.label}</span>;
            return (
              <section key={c.title} className="bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-4 sm:p-5 space-y-3">
                <div className="flex items-start gap-3">
                  <span className="w-10 h-10 shrink-0 rounded-zela-md bg-primary/10 text-primary flex items-center justify-center"><c.icon size={20} /></span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-sm text-on-surface">{c.title}</h3>
                    <div className="mt-1.5 sm:hidden">{chip}</div>
                  </div>
                  <div className="hidden sm:block shrink-0">{chip}</div>
                </div>
                <ul className="space-y-1.5">
                  {c.lines.filter(Boolean).map(l => {
                    const text = typeof l === 'string' ? l : l.text;
                    const warn = typeof l !== 'string' && l.warn;
                    return (
                      <li key={text} className={`flex items-start gap-2 text-sm ${warn ? 'text-warning font-medium' : 'text-on-surface-variant'}`}>
                        <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${warn ? 'bg-warning' : 'bg-outline-variant'}`} />
                        <span className="min-w-0">{text}</span>
                      </li>
                    );
                  })}
                </ul>
                {c.action && (
                  <button onClick={() => setGestaoTab(c.action.tab)} className="w-full sm:w-auto h-10 flex items-center justify-center gap-1 px-4 rounded-zela-md border border-outline-variant bg-surface-container-low hover:bg-primary/10 hover:text-primary text-sm font-bold text-on-surface-variant transition">
                    {c.action.label} <ChevronRight size={16} />
                  </button>
                )}
              </section>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
