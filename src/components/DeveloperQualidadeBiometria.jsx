import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { situacaoDaFoto, resumoDaQualidade, PROBLEMAS_DA_FOTO, ROTULO_DESCRITOR_HUMAN } from '../lib/qualidadeFoto';

// Portal do Dev · Qualidade da biometria (01/10/2026). Só NÚMEROS: o
// suporte não tem acesso às fotos de rosto (LGPD). A medição é feita pela
// própria escola em Gestão › Cadastros › Qualidade da biometria, ou no
// cadastro do rosto, e fica em authorized_persons.foto_qualidade.

const ROTULO_SITUACAO = { ok: 'Boa', refazer: 'Refazer', sem_analise: 'Sem análise' };
const COR_SITUACAO = { ok: 'text-success', refazer: 'text-warning', sem_analise: 'text-dev-text-muted' };
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
  const pct = (n) => (resumo.total ? Math.round((n / resumo.total) * 100) : 0);
  const estatisticas = [
    ['Com biometria', resumo.total, '', 'bg-dev-primary'],
    ['Fotos boas', resumo.ok, 'text-success', 'bg-success'],
    ['Convém refazer', resumo.refazer, 'text-warning', 'bg-warning'],
    ['Sem análise', resumo.sem_analise, 'text-dev-text-muted', 'bg-dev-text-muted'],
  ];
  const Contagem = ({ itens, vazio }) => {
    const maior = Math.max(1, ...itens.map(i => i[1]));
    return itens.length === 0 ? <p className="text-sm text-dev-text-muted">{vazio}</p> : (
      <ul className="divide-y divide-dev-border">
        {itens.map(([rotulo, n]) => (
          <li key={rotulo} className="py-2 first:pt-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 break-words">{rotulo}</span>
              <span className="font-bold tabular-nums shrink-0">{n}</span>
            </div>
            <div className="h-1 mt-1.5 rounded-full bg-dev-surface-high overflow-hidden"><div className="h-full rounded-full bg-dev-primary" style={{ width: `${(n / maior) * 100}%` }} /></div>
          </li>
        ))}
      </ul>
    );
  };
  const medidas = (p) => [
    ['Foto', p.foto_qualidade?.largura_px ? `${p.foto_qualidade.largura_px}×${p.foto_qualidade.altura_px}` : '·'],
    ['Rosto', p.foto_qualidade && !p.foto_qualidade.sem_rosto ? p.foto_qualidade.rosto_px : '·'],
    ['Brilho', p.foto_qualidade?.brilho ?? '·'],
    ['Nitidez', p.foto_qualidade?.nitidez ?? '·'],
  ];
  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-4 text-dev-text pb-24">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <p className="text-sm text-dev-text-muted md:max-w-xl">
          Números de qualidade das fotos de rosto. A escola mede em Gestão › Cadastros › Qualidade da biometria; o suporte não acessa as fotos.
        </p>
        <div className="w-full md:w-72 shrink-0">
          <label htmlFor="dev-biometria-escola" className="block text-[11px] font-bold text-dev-text-muted mb-1">Escola</label>
          <select
            id="dev-biometria-escola"
            value={escolaId}
            onChange={e => setEscolaId(e.target.value)}
            className="w-full min-h-[44px] md:min-h-0 bg-dev-surface border border-dev-border rounded-zela-md px-3 py-2 text-base md:text-sm font-medium text-dev-text"
          >
            {escolas.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
      </div>

      {erro && <p className="text-sm text-error">{erro}</p>}

      {pessoas === null ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-dev-text-muted" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {estatisticas.map(([rotulo, valor, cor, barra], i) => (
              <div key={rotulo} className={card}>
                <p className="text-[11px] font-bold text-dev-text-muted">{rotulo}</p>
                <p className={`text-3xl font-black mt-1 tabular-nums leading-none ${cor}`}>{valor}</p>
                {i > 0 ? (
                  <div className="mt-3">
                    <div className="h-1 rounded-full bg-dev-surface-high overflow-hidden"><div className={`h-full rounded-full ${barra}`} style={{ width: `${pct(valor)}%` }} /></div>
                    <p className="text-[11px] text-dev-text-muted mt-1">{pct(valor)}% do total</p>
                  </div>
                ) : <p className="text-[11px] text-dev-text-muted mt-3">pessoas com rosto</p>}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
            <div className={card}>
              <p className="text-sm font-bold mb-3">Problemas encontrados</p>
              <Contagem vazio="Nenhum." itens={Object.entries(resumo.problemas).sort((a, b) => b[1] - a[1]).map(([c, n]) => [PROBLEMAS_DA_FOTO[c] || c, n])} />
            </div>
            <div className={card}>
              <p className="text-sm font-bold mb-3">Descritor do motor Human</p>
              <Contagem vazio="Sem dados." itens={Object.entries(resumo.descritorHuman).sort((a, b) => b[1] - a[1]).map(([k, n]) => [ROTULO_DESCRITOR_HUMAN[k] || k, n])} />
            </div>
          </div>

          {/* Pessoas: cartões no celular, tabela a partir do tablet */}
          <div className="md:hidden space-y-2">
            {linhas.map(p => (
              <div key={p.id} className={card}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold min-w-0 break-words">{p.name}{p.relation ? <span className="font-normal text-dev-text-muted"> · {p.relation}</span> : null}</p>
                  <span className={`text-xs font-bold shrink-0 ${COR_SITUACAO[p.situacao]}`}>{ROTULO_SITUACAO[p.situacao]}</span>
                </div>
                {p.codigos.length > 0 && <p className="text-xs text-dev-text-muted mt-1">{p.codigos.map(c => PROBLEMAS_DA_FOTO[c]).join(' · ')}</p>}
                <dl className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-dev-border text-xs">
                  {medidas(p).map(([k, v]) => (
                    <div key={k}><dt className="text-[11px] text-dev-text-muted">{k}</dt><dd className="font-bold tabular-nums">{v}</dd></div>
                  ))}
                </dl>
              </div>
            ))}
          </div>

          <div className="hidden md:block overflow-x-auto border border-dev-border rounded-zela-lg bg-dev-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-dev-text-muted bg-dev-surface-high border-b border-dev-border">
                  <th className="p-3">Pessoa</th><th className="p-3">Situação</th><th className="p-3">Motivo</th>
                  <th className="p-3 text-right">Foto</th><th className="p-3 text-right">Rosto</th><th className="p-3 text-right">Brilho</th><th className="p-3 text-right">Nitidez</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(p => (
                  <tr key={p.id} className="border-b border-dev-border/60 last:border-0">
                    <td className="p-3"><span className="font-semibold">{p.name}</span>{p.relation ? <span className="text-dev-text-muted"> · {p.relation}</span> : null}</td>
                    <td className={`p-3 font-bold ${COR_SITUACAO[p.situacao]}`}>{ROTULO_SITUACAO[p.situacao]}</td>
                    <td className="p-3 text-dev-text-muted">{p.codigos.map(c => PROBLEMAS_DA_FOTO[c]).join(' · ') || '·'}</td>
                    {medidas(p).map(([k, v]) => <td key={k} className="p-3 text-right tabular-nums">{v}</td>)}
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
