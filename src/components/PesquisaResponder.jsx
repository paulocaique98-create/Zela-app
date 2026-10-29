import React, { useEffect, useState } from 'react';
import { ClipboardList, Loader2, CheckCircle2, ChevronLeft, ShieldCheck } from 'lucide-react';
import {
  ROTULO_ESCALA, pesquisasAbertas, pesquisaParaResponder, responderPesquisa, obrigatoriasFaltando,
} from '../lib/pesquisas';
import { formatDateBR } from '../lib/gestaoUtils';

const opcaoCls = (ativa) => `min-h-[44px] px-3 rounded-zela-md border text-sm font-semibold transition ${ativa ? 'bg-primary text-white border-primary' : 'bg-surface-container-lowest border-outline-variant text-on-surface hover:border-primary'}`;

// Família e Professor › Pesquisas (módulo `avaliacao_institucional`). Lista as
// pesquisas abertas para o público do usuário e grava as respostas pela RPC
// pesquisa_responder (uma resposta por pessoa; o banco confere público e prazo).
export default function PesquisaResponder({ onMudou = () => {} }) {
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState('');
  const [aberta, setAberta] = useState(null); // pesquisa carregada para responder
  const [respostas, setRespostas] = useState({});
  const [faltando, setFaltando] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [agradecimento, setAgradecimento] = useState(false);

  const carregar = () => pesquisasAbertas()
    .then(l => { setErro(''); setLista(l); })
    .catch(e => { setErro(e.message); setLista([]); });
  useEffect(() => { carregar(); }, []);

  const abrir = async (p) => {
    setErro(''); setAgradecimento(false);
    try { setAberta(await pesquisaParaResponder(p.id)); setRespostas({}); setFaltando([]); } catch (e) { setErro(e.message); carregar(); }
  };

  const enviar = async () => {
    const f = obrigatoriasFaltando(aberta.perguntas, respostas);
    setFaltando(f);
    if (f.length) { setErro('Responda as perguntas marcadas com asterisco.'); return; }
    setEnviando(true); setErro('');
    try {
      await responderPesquisa(aberta.id, aberta.perguntas, respostas);
      setAberta(null); setAgradecimento(true);
      await carregar(); onMudou();
    } catch (e) { setErro(e.message); }
    setEnviando(false);
  };

  if (lista === null) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" /></div>;

  if (aberta) {
    const set = (id, v) => { setRespostas(r => ({ ...r, [id]: v })); setFaltando(f => f.filter(x => x !== id)); };
    return (
      <div className="space-y-4 p-4">
        <button type="button" onClick={() => { setAberta(null); setErro(''); }} className="inline-flex items-center gap-1 text-sm font-semibold text-primary"><ChevronLeft size={16} /> Voltar</button>
        <div>
          <h2 className="text-xl font-bold text-on-surface">{aberta.titulo}</h2>
          {aberta.descricao && <p className="text-sm text-on-surface-variant mt-1 whitespace-pre-wrap">{aberta.descricao}</p>}
          {aberta.anonima && (
            <p className="text-xs font-semibold text-success mt-2 inline-flex items-center gap-1"><ShieldCheck size={14} /> Pesquisa anônima: a escola não vê quem respondeu.</p>
          )}
        </div>
        {erro && <p className="text-sm text-warning">{erro}</p>}
        <ol className="space-y-4">
          {aberta.perguntas.map(p => (
            <li key={p.id} className={`bg-surface-container-lowest border rounded-zela-lg p-3.5 space-y-3 ${faltando.includes(p.id) ? 'border-brass' : 'border-outline-variant'}`}>
              <p className="font-semibold text-on-surface text-sm">{p.ordem}. {p.enunciado}{p.obrigatoria && <span className="text-brass" aria-label="obrigatória"> *</span>}</p>
              {p.tipo === 'nps' && (
                <>
                  <div className="grid grid-cols-6 sm:grid-cols-11 gap-1.5" role="group" aria-label="Nota de 0 a 10">
                    {Array.from({ length: 11 }, (_, i) => (
                      <button key={i} type="button" aria-pressed={respostas[p.id] === String(i)} onClick={() => set(p.id, String(i))} className={`${opcaoCls(respostas[p.id] === String(i))} tabular-nums`}>{i}</button>
                    ))}
                  </div>
                  <p className="flex justify-between text-[11px] text-on-surface-variant"><span>0 nada provável</span><span>10 muito provável</span></p>
                </>
              )}
              {p.tipo === 'escala5' && (
                <div className="grid grid-cols-5 gap-1.5" role="group" aria-label="Escala de 1 a 5">
                  {[1, 2, 3, 4, 5].map(i => (
                    <button key={i} type="button" aria-pressed={respostas[p.id] === String(i)} onClick={() => set(p.id, String(i))} className={`${opcaoCls(respostas[p.id] === String(i))} flex flex-col items-center justify-center py-1.5`}>
                      <span className="tabular-nums">{i}</span>
                      <span className="text-[10px] font-medium leading-tight">{ROTULO_ESCALA[i]}</span>
                    </button>
                  ))}
                </div>
              )}
              {p.tipo === 'multipla' && (
                <div className="grid gap-1.5" role="radiogroup" aria-label={p.enunciado}>
                  {p.opcoes.map(o => (
                    <button key={o} type="button" role="radio" aria-checked={respostas[p.id] === o} onClick={() => set(p.id, o)} className={`${opcaoCls(respostas[p.id] === o)} text-left`}>{o}</button>
                  ))}
                </div>
              )}
              {p.tipo === 'texto' && (
                <textarea aria-label={p.enunciado} rows={3} maxLength={2000} value={respostas[p.id] || ''} onChange={e => set(p.id, e.target.value)}
                  className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-zela-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              )}
            </li>
          ))}
        </ol>
        <button type="button" onClick={enviar} disabled={enviando}
          className="w-full sm:w-auto px-5 py-2.5 bg-primary hover:bg-primary-container text-white font-semibold rounded-zela-md text-sm disabled:opacity-60">
          {enviando ? 'Enviando...' : 'Enviar respostas'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <ClipboardList size={22} className="text-primary" />
        <h2 className="text-xl font-bold text-on-surface">Pesquisas</h2>
      </div>
      {agradecimento && <p className="text-sm font-semibold text-success inline-flex items-center gap-1.5"><CheckCircle2 size={16} /> Obrigado! Suas respostas foram enviadas.</p>}
      {erro && <p className="text-sm text-warning">{erro}</p>}
      {lista.length === 0 && !erro ? (
        <p className="text-sm text-on-surface-variant">Nenhuma pesquisa aberta no momento.</p>
      ) : (
        <ul className="space-y-2">
          {lista.map(p => (
            <li key={p.id} className={`bg-surface-container-lowest border rounded-zela-lg p-3.5 ${p.respondida ? 'border-outline-variant' : 'border-brass'}`}>
              <p className="font-semibold text-on-surface">{p.titulo}</p>
              {p.descricao && <p className="text-xs text-on-surface-variant mt-1 line-clamp-2">{p.descricao}</p>}
              <p className="text-xs text-on-surface-variant mt-1 tabular-nums">Até {formatDateBR(p.fecha_em)}{p.anonima ? ' · Anônima' : ''}</p>
              {p.respondida ? (
                <p className="mt-2 text-xs font-semibold text-success inline-flex items-center gap-1"><CheckCircle2 size={13} /> Você já respondeu</p>
              ) : (
                <button type="button" onClick={() => abrir(p)} className="mt-3 w-full sm:w-auto px-4 py-2 bg-primary hover:bg-primary-container text-white font-semibold rounded-zela-md text-sm">Responder</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
