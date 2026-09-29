import React, { useCallback, useEffect, useState } from 'react';
import { ScanFace, Trash2, ImageOff } from 'lucide-react';
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

  // Fotos soltas: arquivos de rosto sem nenhum cadastro usando (29/09/2026).
  const [soltas, setSoltas] = useState(null);
  const [confirmandoSoltas, setConfirmandoSoltas] = useState(false);
  const [apagandoSoltas, setApagandoSoltas] = useState(false);

  const loadSoltas = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('list_fotos_soltas');
    if (e) { setError(e.message); setSoltas([]); return; }
    setSoltas(data || []);
  }, []);
  useEffect(() => { loadSoltas(); }, [loadSoltas]);

  const apagarSoltas = async () => {
    setConfirmandoSoltas(false);
    setApagandoSoltas(true);
    setError('');
    setSuccess('');
    try {
      // O servidor confere de novo quais continuam sem cadastro.
      const { data, error: e } = await supabase.rpc('confirmar_fotos_soltas', { p_paths: soltas.map(f => f.path) });
      if (e) throw e;
      const paths = (data || []).map(r => r.path);
      if (paths.length) {
        const { error: storageErr } = await supabase.storage.from('person-photos').remove(paths);
        if (storageErr) throw storageErr;
      }
      setSuccess(`${paths.length} ${paths.length === 1 ? 'foto sem cadastro apagada' : 'fotos sem cadastro apagadas'}.`);
      loadSoltas();
    } catch (err) {
      setError(err.message);
    } finally {
      setApagandoSoltas(false);
    }
  };

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
          <EmptyState icon={ScanFace} text="Nenhuma biometria para limpar." hint="Todas as biometrias de cadastros pertencem a famílias com aluno ativo." />
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

        <section className="pt-4 space-y-3">
          <div>
            <h3 className="text-sm font-bold text-on-surface">Fotos sem cadastro</h3>
            <p className="text-xs text-on-surface-variant">Fotos de rosto guardadas que nenhum cadastro usa mais (de autorizados que já foram apagados). Só aparecem depois de 1 dia, para nunca pegar uma foto que acabou de ser enviada.</p>
          </div>
          {soltas === null ? <Loading /> : soltas.length === 0 ? (
            <p className="text-sm text-on-surface-variant">Nenhuma foto sem cadastro.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-on-surface">{soltas.length} {soltas.length === 1 ? 'foto' : 'fotos'} sem cadastro</p>
                <button
                  onClick={() => setConfirmandoSoltas(true)}
                  disabled={apagandoSoltas}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-zela-md text-sm transition disabled:opacity-50"
                >
                  <Trash2 size={15} /> {apagandoSoltas ? 'Apagando...' : `Apagar ${soltas.length === 1 ? 'a foto' : `as ${soltas.length} fotos`}`}
                </button>
              </div>
              <ul className="divide-y divide-outline-variant/60 bg-surface-container-lowest border border-outline-variant rounded-zela-lg">
                {soltas.map(f => (
                  <li key={f.path} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <ImageOff size={15} className="text-on-surface-variant shrink-0" />
                    <span className="text-on-surface">Enviada em {formatDateBR(f.criada_em)}</span>
                    <span className="text-xs text-on-surface-variant truncate">{f.path.split('/').pop()}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
      {confirmandoSoltas && (
        <ConfirmModal
          title="Apagar fotos sem cadastro?"
          message={`${soltas.length} ${soltas.length === 1 ? 'foto de rosto sem cadastro será apagada' : 'fotos de rosto sem cadastro serão apagadas'} do armazenamento. Nenhum cadastro usa essas fotos, então nada muda no reconhecimento do totem.`}
          confirmLabel="Apagar fotos"
          cancelLabel="Voltar"
          onConfirm={apagarSoltas}
          onCancel={() => setConfirmandoSoltas(false)}
        />
      )}
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
