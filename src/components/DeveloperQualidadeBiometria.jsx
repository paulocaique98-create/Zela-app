import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { situacaoDaFoto, resumoDaQualidade, PROBLEMAS_DA_FOTO, ROTULO_DESCRITOR_HUMAN } from '../lib/qualidadeFoto';

// Portal do Dev · Qualidade da biometria (01/10/2026). Só NÚMEROS: o
// suporte não tem acesso às fotos de rosto (LGPD). A medição é feita pela
// própria escola em Gestão › Cadastros › Qualidade da biometria, ou no
// cadastro do rosto, e fica em authorized_persons.foto_qualidade.

const ROTULO_SITUACAO = { ok: 'Boa', refazer: 'Refazer', sem_analise: 'Sem análise' };
const COR_SITUACAO = { ok: 'text-emerald-400', refazer: 'text-amber-400', sem_analise: 'text-dev-text-muted' };
const ORDEM = { refazer: 0, sem_analise: 1, ok: 2 };

export default function DeveloperQualidadeBiometria() {
  const [escolas, setEscolas] = useState([]);
  const [escolaId, setEscolaId] = useState('');
  const [pessoas, setPessoas] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    supabase.from('schools').select('id, name').order('name').then(({ data }) => {
      setEscolas(data || []);
      if (data?.length) setEscolaId(id => id || data[0].id);
    });
  }, []);

  useEffect(() => {
    if (!escolaId) return;
    let cancelado = false;
    setPessoas(null);
    supabase.from('authorized_persons')
      .select('id, name, relation, foto_qualidade, face_descriptor_v2_status')
      .eq('school_id', escolaId)
      .not('face_descriptor', 'is', null)
      .order('name')
      .then(({ data, error }) => {
        if (cancelado) return;
        if (error) { setErro(error.message); setPessoas([]); return; }
        setErro('');
        setPessoas(data || []);
      });
    return () => { cancelado = true; };
  }, [escolaId]);

  const resumo = useMemo(() => resumoDaQualidade(pessoas || []), [pessoas]);
  const linhas = useMemo(() => (pessoas || [])
    .map(p => ({ ...p, ...situacaoDaFoto(p.foto_qualidade) }))
    .sort((a, b) => ORDEM[a.situacao] - ORDEM[b.situacao] || a.name.localeCompare(b.name)), [pessoas]);

  const card = 'bg-dev-surface border border-dev-border rounded-zela-lg p-4';
  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-4 text-dev-text">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-dev-text-muted">
          Números de qualidade das fotos de rosto. A escola mede em Gestão › Cadastros › Qualidade da biometria; o suporte não acessa as fotos.
        </p>
        <select
          id="dev-biometria-escola"
          value={escolaId}
          onChange={e => setEscolaId(e.target.value)}
          className="bg-dev-bg border border-dev-border rounded-zela-md px-3 py-2 text-sm text-dev-text"
        >
          {escolas.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>

      {erro && <p className="text-sm text-red-400">{erro}</p>}

      {pessoas === null ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-dev-text-muted" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[['Com biometria', resumo.total, ''], ['Fotos boas', resumo.ok, 'text-emerald-400'], ['Convém refazer', resumo.refazer, 'text-amber-400'], ['Sem análise', resumo.sem_analise, '']].map(([rotulo, valor, cor]) => (
              <div key={rotulo} className={card}>
                <p className="text-[11px] font-bold uppercase tracking-wide text-dev-text-muted">{rotulo}</p>
                <p className={`text-2xl font-black mt-1 tabular-nums ${cor}`}>{valor}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className={card}>
              <p className="text-[11px] font-bold uppercase tracking-wide text-dev-text-muted mb-2">Problemas encontrados</p>
              {Object.keys(resumo.problemas).length === 0 ? <p className="text-sm text-dev-text-muted">Nenhum.</p> : (
                <ul className="space-y-1 text-sm">
                  {Object.entries(resumo.problemas).sort((a, b) => b[1] - a[1]).map(([c, n]) => (
                    <li key={c} className="flex justify-between"><span>{PROBLEMAS_DA_FOTO[c] || c}</span><span className="tabular-nums">{n}</span></li>
                  ))}
                </ul>
              )}
            </div>
            <div className={card}>
              <p className="text-[11px] font-bold uppercase tracking-wide text-dev-text-muted mb-2">Descritor do motor Human</p>
              <ul className="space-y-1 text-sm">
                {Object.entries(resumo.descritorHuman).sort((a, b) => b[1] - a[1]).map(([s, n]) => (
                  <li key={s} className="flex justify-between"><span>{ROTULO_DESCRITOR_HUMAN[s] || s}</span><span className="tabular-nums">{n}</span></li>
                ))}
              </ul>
            </div>
          </div>

          <div className="overflow-x-auto border border-dev-border rounded-zela-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase text-dev-text-muted border-b border-dev-border">
                  <th className="p-2">Pessoa</th><th className="p-2">Situação</th><th className="p-2">Motivo</th>
                  <th className="p-2 text-right">Foto</th><th className="p-2 text-right">Rosto</th><th className="p-2 text-right">Brilho</th><th className="p-2 text-right">Nitidez</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(p => (
                  <tr key={p.id} className="border-b border-dev-border/60">
                    <td className="p-2"><span className="font-semibold">{p.name}</span>{p.relation ? <span className="text-dev-text-muted"> · {p.relation}</span> : null}</td>
                    <td className={`p-2 font-bold ${COR_SITUACAO[p.situacao]}`}>{ROTULO_SITUACAO[p.situacao]}</td>
                    <td className="p-2 text-dev-text-muted">{p.codigos.map(c => PROBLEMAS_DA_FOTO[c]).join(' · ') || '·'}</td>
                    <td className="p-2 text-right tabular-nums">{p.foto_qualidade?.largura_px ? `${p.foto_qualidade.largura_px}×${p.foto_qualidade.altura_px}` : '·'}</td>
                    <td className="p-2 text-right tabular-nums">{p.foto_qualidade && !p.foto_qualidade.sem_rosto ? p.foto_qualidade.rosto_px : '·'}</td>
                    <td className="p-2 text-right tabular-nums">{p.foto_qualidade?.brilho ?? '·'}</td>
                    <td className="p-2 text-right tabular-nums">{p.foto_qualidade?.nitidez ?? '·'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
