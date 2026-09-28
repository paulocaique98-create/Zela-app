import React from 'react';
import { RefreshCw, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useGestaoPendencias } from '../hooks/useGestaoPendencias';
import { centsToBRL, formatDateBR } from '../lib/gestaoUtils';
import { PageShell, Loading, Notice, SecondaryButton } from './GestaoShared';

// Caixa única do que depende da Gestão. Cada grupo leva à tela onde a
// pendência é resolvida.
export default function GestaoPendencias({ currentUser, setGestaoTab }) {
  const { isLoading, data, error, refresh } = useGestaoPendencias(currentUser);

  const groups = data ? [
    {
      key: 'cadastros', title: 'Cadastros aguardando aprovação', tab: 'cadastros-usuarios', items: data.cadastros,
      render: u => `${u.name} · ${u.role === 'teacher' ? 'Professor' : 'Responsável'}`,
    },
    {
      key: 'matriculas', title: 'Matrículas e rematrículas para decidir', tab: 'secretaria-matriculas', items: data.matriculas,
      render: m => `${(m.criancas || []).map(c => c.nome).join(', ') || 'Solicitação'} · enviada em ${formatDateBR(m.submitted_at)}`,
    },
    {
      key: 'exclusoes', title: 'Pedidos de exclusão de conta (prazo de 30 dias)', tab: 'cadastros-exclusoes', items: data.exclusoes,
      render: r => `${r.user_name} · pedido em ${formatDateBR(r.requested_at)}`,
    },
    {
      key: 'biometria', title: 'Biometria de famílias sem aluno ativo', tab: 'cadastros-biometria', items: data.biometria,
      render: b => `${b.person_name} · família ${b.family_name || 'excluída'}`,
    },
    {
      key: 'correcoes', title: 'Correções de presença para aprovar', tab: 'attendance-corrections', items: data.correcoes,
      render: c => `${c.students?.name || 'Aluno'} · pedida em ${formatDateBR(c.requested_at)}`,
    },
    {
      key: 'documentos', title: 'Alunos com documentos faltando', tab: 'secretaria-documentos', items: data.documentos,
      render: s => `${s.name} · falta ${s.missing.map(m => m.label).join(', ')}`,
    },
    {
      key: 'vencidas', title: `Cobranças vencidas (${centsToBRL(data.vencidasTotal)})`, tab: 'financeiro-inadimplencia', items: data.vencidas,
      render: c => `${c.students?.name || 'Aluno'} · ${centsToBRL(c.amount_cents)} · venceu em ${formatDateBR(c.due_date)}`,
    },
    {
      key: 'contratos', title: 'Contratos aguardando assinatura', tab: 'contratos-assinaturas', items: data.contratos,
      render: c => `${c.students?.name || 'Aluno'} · ${c.title} · enviado em ${formatDateBR(c.sent_at)}`,
    },
    {
      key: 'despesas', title: 'Despesas vencendo em até 7 dias', tab: 'financeiro-despesas', items: data.despesas,
      render: d => `${d.description} · ${centsToBRL(d.amount_cents)} · vence em ${formatDateBR(d.due_date)}`,
    },
  ] : [];

  const total = groups.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <PageShell
      description="Tudo o que depende da Gestão, num lugar só."
      actions={<SecondaryButton onClick={refresh}><RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} /> Atualizar</SecondaryButton>}
    >
      <Notice>{error}</Notice>
      {isLoading && !data ? <Loading /> : data && (
        total === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-16">
            <CheckCircle2 size={36} className="text-emerald-500 mb-2" />
            <p className="font-bold text-on-surface">Nenhuma pendência no momento.</p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {groups.filter(g => g.items.length > 0).map(g => (
              <section key={g.key} className="bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h3 className="font-bold text-on-surface text-sm">{g.title}</h3>
                  <span className="text-xs font-black text-white bg-red-500 rounded-full min-w-[22px] h-[22px] px-1.5 flex items-center justify-center">{g.items.length}</span>
                </div>
                <ul className="space-y-1 mb-3">
                  {g.items.slice(0, 6).map((item, idx) => (
                    <li key={item.id || idx} className="text-sm text-on-surface-variant truncate">{g.render(item)}</li>
                  ))}
                  {g.items.length > 6 && <li className="text-xs text-on-surface-variant/70">e mais {g.items.length - 6}</li>}
                </ul>
                <button onClick={() => setGestaoTab(g.tab)} className="text-xs font-bold text-primary flex items-center gap-1 hover:underline">
                  Resolver <ArrowRight size={12} />
                </button>
              </section>
            ))}
          </div>
        )
      )}
    </PageShell>
  );
}
