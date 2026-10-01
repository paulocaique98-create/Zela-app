import React, { useEffect, useState } from 'react';
import { CreditCard, BellRing, Activity, CheckCircle2, AlertTriangle, MinusCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PageShell, Loading } from './GestaoShared';

const STATE = {
  ok: { icon: CheckCircle2, cls: 'text-emerald-700 bg-emerald-50 border-emerald-200', label: 'Funcionando' },
  warn: { icon: AlertTriangle, cls: 'text-amber-700 bg-amber-50 border-amber-200', label: 'Atenção' },
  off: { icon: MinusCircle, cls: 'text-on-surface-variant bg-surface-container-low border-outline-variant', label: 'Não configurado' },
};

// Integrações: situação das conexões externas da escola. Só leitura; a
// chave do Asaas é cadastrada em Financeiro · Configuração.
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
        !financeiroOn ? 'O módulo financeiro não está ativo para esta escola.' : asaas ? `Chave cadastrada · atualizada em ${new Date(asaas.updated_at).toLocaleDateString('pt-BR')}` : 'Nenhuma chave do Asaas cadastrada.',
        asaas ? (asaas.pix_key_registered ? 'Chave PIX registrada no Asaas.' : 'Chave PIX ainda não registrada no Asaas.') : null,
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
      lines: ['Falhas do sistema são registradas e acompanhadas pelo suporte do Zela automaticamente.'],
    },
  ];

  return (
    <PageShell description="Conexões do Zela com serviços externos.">
      {!info ? <Loading /> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {cards.map(c => {
            const st = STATE[c.state];
            return (
              <section key={c.title} className="bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-sm text-on-surface flex items-center gap-2"><c.icon size={16} className="text-primary" /> {c.title}</h3>
                  <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${st.cls}`}><st.icon size={12} /> {st.label}</span>
                </div>
                {c.lines.filter(Boolean).map(l => <p key={l} className="text-sm text-on-surface-variant">{l}</p>)}
                {c.action && <button onClick={() => setGestaoTab(c.action.tab)} className="text-sm font-bold text-primary hover:underline">{c.action.label}</button>}
              </section>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
