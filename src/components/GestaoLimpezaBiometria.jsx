import React, { useCallback, useEffect, useState } from 'react';
import { ScanFace, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatDateBR } from '../lib/gestaoUtils';
import { PageShell, Loading, EmptyState, Notice } from './GestaoShared';
import ConfirmModal from './ConfirmModal';

// Cadastros · Limpeza de biometria (LGPD, minimização). Lista as pessoas
// autorizadas com foto/biometria de famílias que não têm mais aluno ativo
// na escola. Nada é apagado sozinho: a Gestão escolhe e confirma. O
// servidor confere de novo antes de apagar (purge_biometria).
export default function GestaoLimpezaBiometria() {
  const [rows, setRows] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [confirming, setConfirming] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('list_biometria_para_limpar');
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

  const purge = async () => {
    setConfirming(false);
    setIsPurging(true);
    setError('');
    setSuccess('');
    try {
      const { data, error: e } = await supabase.rpc('purge_biometria', { p_person_ids: Array.from(selected) });
      if (e) throw e;
      const paths = (data || []).map(r => r.photo_storage_path).filter(Boolean);
      if (paths.length) {
        const { error: storageErr } = await supabase.storage.from('person-photos').remove(paths);
        if (storageErr) console.warn('[GestaoLimpezaBiometria] Fotos não removidas do armazenamento:', storageErr.message);
      }
      setSuccess(`Biometria apagada de ${(data || []).length} pessoa(s).`);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsPurging(false);
    }
  };

  return (
    <PageShell description="Foto e biometria de pessoas autorizadas de famílias que não têm mais aluno ativo na escola. Pela LGPD, dados que não são mais necessários devem ser apagados.">
      <div className="space-y-4">
        <Notice>{error}</Notice>
        <Notice type="success">{success}</Notice>
        {rows === null ? <Loading /> : rows.length === 0 ? (
          <EmptyState icon={ScanFace} text="Nenhuma biometria para limpar." hint="Todas as fotos e biometrias guardadas pertencem a famílias com aluno ativo." />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="bio-all" className="flex items-center gap-2 text-sm font-medium text-on-surface">
                <input id="bio-all" type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map(r => r.person_id)))} />
                Selecionar todas ({rows.length})
              </label>
              <button
                onClick={() => setConfirming(true)}
                disabled={selected.size === 0 || isPurging}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-zela-md text-sm transition disabled:opacity-50"
              >
                <Trash2 size={15} /> Apagar biometria ({selected.size})
              </button>
            </div>
            <ul className="divide-y divide-outline-variant/60 bg-surface-container-lowest border border-outline-variant rounded-zela-lg">
              {rows.map(r => (
                <li key={r.person_id}>
                  <label htmlFor={`bio-${r.person_id}`} className="flex items-start gap-3 px-4 py-3 cursor-pointer">
                    <input id={`bio-${r.person_id}`} type="checkbox" className="mt-1" checked={selected.has(r.person_id)} onChange={() => toggle(r.person_id)} />
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-on-surface">{r.person_name} · {r.relation}</span>
                      <span className="block text-xs text-on-surface-variant">
                        Família: {r.family_name || 'conta excluída'}{r.biometric_consent_at ? ` · consentimento em ${formatDateBR(r.biometric_consent_at)}` : ''}
                      </span>
                      <span className="block text-xs text-on-surface-variant/80">Alunos: {r.alunos || 'nenhum vinculado'}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {confirming && (
        <ConfirmModal
          title="Apagar biometria?"
          message={`A foto e a biometria de ${selected.size} pessoa(s) serão apagadas. O cadastro (nome e parentesco) continua. Se a família voltar, basta cadastrar a foto de novo.`}
          confirmLabel="Apagar biometria"
          cancelLabel="Voltar"
          onConfirm={purge}
          onCancel={() => setConfirming(false)}
        />
      )}
    </PageShell>
  );
}
