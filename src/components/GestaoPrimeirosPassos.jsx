import React, { useEffect, useState } from 'react';
import { CheckCircle2, Circle, ChevronRight, Rocket } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PageShell, Loading } from './GestaoShared';
import { calcularOnboarding } from '../lib/onboardingChecklist';
import { chaveLigada } from '../lib/perfisGestao';

// Perfis da equipe que contam no passo "Convidar a equipe".
const PAPEIS_EQUIPE = ['admin', 'teacher', 'financeiro', 'gestao_pedagogica'];

// Primeiros passos da escola nova (PLANO_VALORIZACAO_ZELA.md, 1.1). Só
// leitura: conta o que já existe e cada passo abre a tela que já faz aquilo.
export default function GestaoPrimeirosPassos({ currentUser, currentSchool, onAbrirPasso }) {
  const [contagens, setContagens] = useState(null);
  const financeiro = chaveLigada(currentSchool?.features_enabled, 'financeiro');

  useEffect(() => {
    const sid = currentUser.school_id;
    let cancelado = false;
    Promise.all([
      supabase.from('school_plan_prices').select('id', { count: 'exact', head: true }).eq('school_id', sid),
      supabase.from('school_gateway_accounts').select('gateway').eq('school_id', sid).eq('gateway', 'asaas').limit(1),
      supabase.from('users').select('id', { count: 'exact', head: true }).eq('school_id', sid).in('role', PAPEIS_EQUIPE),
    ]).then(([planos, gateway, equipe]) => {
      if (cancelado) return;
      setContagens({
        planos: planos.count || 0,
        gatewayConectado: (gateway.data || []).length > 0,
        equipe: equipe.count || 0,
      });
    });
    return () => { cancelado = true; };
  }, [currentUser.school_id]);

  const r = contagens && calcularOnboarding({
    ...contagens,
    turmas: currentSchool?.turmas,
    billingConfig: currentSchool?.billing_config,
    financeiro,
  });

  return (
    <PageShell description="O que falta para a escola começar a usar o Zela Edu." infoOnMobile>
      {!r ? <Loading /> : (
        <div className="space-y-4 max-w-3xl">
          <section className="bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-4 sm:p-5 space-y-3">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 shrink-0 rounded-zela-md bg-primary/10 text-primary flex items-center justify-center"><Rocket size={20} /></span>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-sm text-on-surface">
                  {r.proximo ? `${r.concluidos} de ${r.total} passos concluídos` : 'Configuração concluída'}
                </h3>
                <p className="text-sm text-on-surface-variant">
                  {r.proximo ? `Próximo: ${r.proximo.titulo.toLowerCase()}.` : 'A escola está pronta para o dia a dia.'}
                </p>
              </div>
              <span className="shrink-0 text-lg font-bold text-primary">{r.percentual}%</span>
            </div>
            <div className="h-2 rounded-full bg-surface-container overflow-hidden" role="progressbar" aria-valuenow={r.percentual} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full bg-primary transition-all" style={{ width: `${r.percentual}%` }} />
            </div>
          </section>

          <ol className="space-y-2">
            {r.passos.map((p, i) => (
              <li key={p.id} className="bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {p.feito
                    ? <CheckCircle2 size={22} className="shrink-0 text-success mt-0.5" />
                    : <Circle size={22} className="shrink-0 text-outline-variant mt-0.5" />}
                  <div className="min-w-0">
                    <h4 className={`font-bold text-sm ${p.feito ? 'text-on-surface-variant' : 'text-on-surface'}`}>{i + 1}. {p.titulo}</h4>
                    <p className="text-sm text-on-surface-variant">{p.desc}</p>
                  </div>
                </div>
                <button onClick={() => onAbrirPasso(p)} className="w-full sm:w-auto shrink-0 h-10 flex items-center justify-center gap-1 px-4 rounded-zela-md border border-outline-variant bg-surface-container-low hover:bg-primary/10 hover:text-primary text-sm font-bold text-on-surface-variant transition">
                  {p.feito ? 'Revisar' : 'Configurar'} <ChevronRight size={16} />
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </PageShell>
  );
}
