import React, { useCallback, useEffect, useState } from 'react';
import { Users, Merge, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PageShell, Loading, EmptyState, Notice } from './GestaoShared';
import ConfirmModal from './ConfirmModal';

// Cadastros · Unificar responsáveis (29/09/2026). O outro pai/mãe que foi
// cadastrado como Autorizado "Pai/Mãe" na conta do titular, antes de ter
// conta própria, passa a ser um cadastro só, na conta dele. Nada é feito
// sozinho: a Gestão escolhe e confirma; o servidor recalcula a lista na hora
// de aplicar (apply_unificar_responsaveis).
const ACAO = {
  mover: {
    titulo: 'Passar a biometria para a conta da pessoa',
    texto: (r) => `A foto e a biometria que estão em Autorizados de ${r.titular_name} passam para a conta de ${r.guardian_name}. O cadastro vazio da conta dela é apagado.`,
  },
  remover_antigo: {
    titulo: 'Tirar dos autorizados do titular',
    texto: (r) => `${r.guardian_name} já tem biometria na própria conta. O cadastro repetido em Autorizados de ${r.titular_name} é apagado e libera uma vaga de autorizado.`,
  },
  remover_duplicado: {
    titulo: 'Apagar cadastro repetido',
    texto: (r) => `Cadastro "${r.legacy_relation}" vazio que repete ${r.guardian_name} dentro da própria conta.`,
  },
  autorizado_repetido: {
    titulo: 'Autorizado repetido na mesma família',
    texto: (r) => `${r.legacy_name} está nos autorizados de ${r.titular_name} e de ${r.guardian_name}. Fica um cadastro só, em ${r.guardian_name}, que continua buscando as mesmas crianças.`,
  },
};

export default function GestaoUnificarResponsaveis() {
  const [rows, setRows] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [confirming, setConfirming] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('list_unificar_responsaveis');
    if (e) { setError(e.message); setRows([]); return; }
    setRows(data || []);
    setSelected(new Set());
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allSelected = rows?.length > 0 && selected.size === rows.length;

  const apply = async () => {
    setConfirming(false);
    setIsApplying(true);
    setError('');
    setSuccess('');
    try {
      const { data, error: e } = await supabase.rpc('apply_unificar_responsaveis', { p_legacy_ids: Array.from(selected) });
      if (e) throw e;
      // Fotos dos cadastros antigos apagados (a biometria que fica é a da conta).
      const paths = (data || []).map(r => r.photo_storage_path).filter(Boolean);
      if (paths.length) {
        const { error: storageErr } = await supabase.storage.from('person-photos').remove(paths);
        if (storageErr) console.warn('[GestaoUnificarResponsaveis] Fotos não removidas do armazenamento:', storageErr.message);
      }
      const n = (data || []).length;
      setSuccess(`${n} ${n === 1 ? 'cadastro unificado' : 'cadastros unificados'}.`);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <PageShell description="Pais e mães que também estão cadastrados como autorizados na conta do titular. Unificar deixa um cadastro só, na conta da própria pessoa, com a biometria dela.">
      <div className="space-y-4">
        <Notice>{error}</Notice>
        <Notice type="success">{success}</Notice>
        {rows === null ? <Loading /> : rows.length === 0 ? (
          <EmptyState icon={Users} text="Nada para unificar." hint="Cada responsável tem um cadastro só, na própria conta." />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="unif-all" className="flex items-center gap-2 text-sm font-medium text-on-surface min-h-[40px]">
                <input id="unif-all" type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map(r => r.legacy_id)))} />
                Selecionar todos ({rows.length})
              </label>
              <button
                onClick={() => setConfirming(true)}
                disabled={selected.size === 0 || isApplying}
                className="flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] bg-primary hover:bg-primary-container text-white font-bold rounded-zela-md text-sm transition disabled:opacity-50"
              >
                <Merge size={15} /> Unificar selecionados ({selected.size})
              </button>
            </div>
            <ul className="divide-y divide-outline-variant/60 bg-surface-container-lowest border border-outline-variant rounded-zela-lg">
              {rows.map(r => {
                const acao = ACAO[r.acao] || ACAO.remover_antigo;
                return (
                  <li key={r.legacy_id}>
                    <label htmlFor={`unif-${r.legacy_id}`} className="flex items-start gap-3 px-4 py-3 cursor-pointer">
                      <input id={`unif-${r.legacy_id}`} type="checkbox" className="mt-1" checked={selected.has(r.legacy_id)} onChange={() => toggle(r.legacy_id)} />
                      <span className="min-w-0 flex flex-col gap-0.5">
                        <span className="text-sm font-bold text-on-surface">{r.acao === 'autorizado_repetido' ? r.legacy_name : r.guardian_name}</span>
                        <span className="text-xs font-bold text-primary">{acao.titulo}</span>
                        <span className="text-xs text-on-surface-variant">{acao.texto(r)}</span>
                        {!r.nome_igual && (
                          <span className="mt-1 flex items-start gap-1.5 text-xs font-semibold text-amber-800">
                            <AlertTriangle size={13} className="shrink-0 mt-px" />
                            Nome diferente: em Autorizados está "{r.legacy_name}". Confira se é a mesma pessoa antes de unificar.
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
      {confirming && (
        <ConfirmModal
          title="Unificar cadastros?"
          message={`${selected.size} ${selected.size === 1 ? 'pessoa passa' : 'pessoas passam'} a ter um cadastro só, na própria conta. Quem busca quem no totem não muda, e o histórico de entradas e saídas continua igual.`}
          confirmLabel="Unificar"
          cancelLabel="Voltar"
          danger={false}
          onConfirm={apply}
          onCancel={() => setConfirming(false)}
        />
      )}
    </PageShell>
  );
}
