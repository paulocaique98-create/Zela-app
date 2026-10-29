import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Modal, Field, inputCls, PrimaryButton, SecondaryButton, Notice } from './GestaoShared';
import {
  PUBLICOS, TIPOS_PERGUNTA, MAX_PERGUNTAS, perguntaVazia, validarFormulario, validarParaPublicar,
  paraInputLocal, deInputLocal,
} from '../lib/pesquisas';

// Criar e editar pesquisa em rascunho. onSalvar(form, publicar) devolve uma
// promessa; erro vira aviso dentro do modal.
export default function PesquisaForm({ inicial, titulo, turmasDisponiveis = [], onClose, onSalvar }) {
  const [f, setF] = useState(inicial);
  const [erros, setErros] = useState([]);
  const [salvando, setSalvando] = useState(false);

  const set = (campo, valor) => setF(a => ({ ...a, [campo]: valor }));
  const setPergunta = (i, mudanca) => setF(a => ({ ...a, perguntas: a.perguntas.map((p, j) => (j === i ? { ...p, ...mudanca } : p)) }));
  const mover = (i, delta) => setF(a => {
    const ps = [...a.perguntas];
    const j = i + delta;
    if (j < 0 || j >= ps.length) return a;
    [ps[i], ps[j]] = [ps[j], ps[i]];
    return { ...a, perguntas: ps };
  });
  const trocarTipo = (i, tipo) => setPergunta(i, { tipo, opcoes: tipo === 'multipla' ? (f.perguntas[i].opcoes.length >= 2 ? f.perguntas[i].opcoes : ['', '']) : [] });
  const alternarTurma = (t) => set('turmas', f.turmas.includes(t) ? f.turmas.filter(x => x !== t) : [...f.turmas, t]);

  const enviar = async (publicar) => {
    const lista = publicar ? validarParaPublicar(f) : validarFormulario(f);
    setErros(lista);
    if (lista.length) return;
    setSalvando(true);
    try {
      await onSalvar(f, publicar);
    } catch (e) {
      setErros([e.message || 'Não foi possível salvar.']);
      setSalvando(false);
    }
  };

  return (
    <Modal
      wide title={titulo} onClose={salvando ? () => {} : onClose}
      footer={<>
        <SecondaryButton type="button" onClick={onClose} disabled={salvando}>Cancelar</SecondaryButton>
        <SecondaryButton type="button" onClick={() => enviar(false)} disabled={salvando}>Salvar rascunho</SecondaryButton>
        <PrimaryButton type="button" onClick={() => enviar(true)} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar e publicar'}</PrimaryButton>
      </>}
    >
      {erros.length > 0 && <Notice type="error">{erros.map(e => <span key={e} className="block">{e}</span>)}</Notice>}

      <Field label="Título" id="pq-titulo">
        <input id="pq-titulo" className={inputCls} value={f.titulo} maxLength={150} onChange={e => set('titulo', e.target.value)} placeholder="Ex.: Satisfação das famílias 2026" />
      </Field>
      <Field label="Descrição (opcional)" id="pq-desc" hint="Aparece para quem vai responder.">
        <textarea id="pq-desc" className={inputCls} rows={2} maxLength={1000} value={f.descricao} onChange={e => set('descricao', e.target.value)} />
      </Field>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Quem responde" id="pq-publico">
          <select id="pq-publico" className={inputCls} value={f.publico} onChange={e => set('publico', e.target.value)}>
            {Object.entries(PUBLICOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Identificação" id="pq-anonima" hint={f.anonima ? 'O Zela não guarda quem deu cada resposta.' : 'A Gestão vê o nome de quem respondeu.'}>
          <select id="pq-anonima" className={inputCls} value={f.anonima ? 'sim' : 'nao'} onChange={e => set('anonima', e.target.value === 'sim')}>
            <option value="nao">Identificada</option>
            <option value="sim">Anônima</option>
          </select>
        </Field>
      </div>

      {f.publico === 'turmas' && (
        <Field label="Turmas">
          {turmasDisponiveis.length === 0 ? (
            <p className="text-xs text-on-surface-variant">Nenhuma turma com alunos cadastrados.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {turmasDisponiveis.map(t => (
                <label key={t} className={`px-3 py-1.5 rounded-zela-md border text-xs font-semibold cursor-pointer ${f.turmas.includes(t) ? 'bg-primary text-white border-primary' : 'bg-surface-container-low border-outline-variant text-on-surface-variant'}`}>
                  <input type="checkbox" className="sr-only" checked={f.turmas.includes(t)} onChange={() => alternarTurma(t)} />
                  {t}
                </label>
              ))}
            </div>
          )}
        </Field>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Abre em" id="pq-abre">
          <input id="pq-abre" type="datetime-local" className={inputCls} value={paraInputLocal(f.abre_em)} onChange={e => set('abre_em', deInputLocal(e.target.value))} />
        </Field>
        <Field label="Fecha em" id="pq-fecha">
          <input id="pq-fecha" type="datetime-local" className={inputCls} value={paraInputLocal(f.fecha_em)} onChange={e => set('fecha_em', deInputLocal(e.target.value))} />
        </Field>
      </div>

      <div className="pt-2">
        <h3 className="font-bold text-on-surface text-sm mb-2">Perguntas</h3>
        <ol className="space-y-3">
          {f.perguntas.map((p, i) => (
            <li key={i} className="border border-outline-variant rounded-zela-lg p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-on-surface-variant tabular-nums">{i + 1}.</span>
                <select aria-label={`Tipo da pergunta ${i + 1}`} className={`${inputCls} !w-auto`} value={p.tipo} onChange={e => trocarTipo(i, e.target.value)}>
                  {Object.entries(TIPOS_PERGUNTA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <label className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                  <input type="checkbox" checked={p.obrigatoria} onChange={e => setPergunta(i, { obrigatoria: e.target.checked })} />
                  Obrigatória
                </label>
                <div className="ml-auto flex items-center gap-1">
                  <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} className="p-1.5 rounded-zela-md text-on-surface-variant hover:bg-surface-container disabled:opacity-30" aria-label="Subir pergunta"><ArrowUp size={16} /></button>
                  <button type="button" onClick={() => mover(i, 1)} disabled={i === f.perguntas.length - 1} className="p-1.5 rounded-zela-md text-on-surface-variant hover:bg-surface-container disabled:opacity-30" aria-label="Descer pergunta"><ArrowDown size={16} /></button>
                  <button type="button" onClick={() => setF(a => ({ ...a, perguntas: a.perguntas.filter((_, j) => j !== i) }))} className="p-1.5 rounded-zela-md text-on-surface-variant hover:bg-surface-container" aria-label="Remover pergunta"><Trash2 size={16} /></button>
                </div>
              </div>
              <input aria-label={`Enunciado da pergunta ${i + 1}`} className={inputCls} value={p.enunciado} maxLength={300} onChange={e => setPergunta(i, { enunciado: e.target.value })} placeholder="Escreva a pergunta" />
              {p.tipo === 'multipla' && (
                <div className="space-y-1.5">
                  {p.opcoes.map((o, k) => (
                    <div key={k} className="flex items-center gap-2">
                      <input aria-label={`Opção ${k + 1} da pergunta ${i + 1}`} className={inputCls} value={o} maxLength={100} placeholder={`Opção ${k + 1}`}
                        onChange={e => setPergunta(i, { opcoes: p.opcoes.map((x, m) => (m === k ? e.target.value : x)) })} />
                      {p.opcoes.length > 2 && (
                        <button type="button" onClick={() => setPergunta(i, { opcoes: p.opcoes.filter((_, m) => m !== k) })} className="p-1.5 rounded-zela-md text-on-surface-variant hover:bg-surface-container" aria-label="Remover opção"><Trash2 size={16} /></button>
                      )}
                    </div>
                  ))}
                  {p.opcoes.length < 10 && (
                    <SecondaryButton type="button" onClick={() => setPergunta(i, { opcoes: [...p.opcoes, ''] })} className="!px-2.5 !py-1.5 text-xs"><Plus size={14} /> Opção</SecondaryButton>
                  )}
                </div>
              )}
              {p.tipo === 'nps' && <p className="text-[11px] text-on-surface-variant/70">Nota de 0 a 10. O resultado mostra o NPS (promotores menos detratores).</p>}
            </li>
          ))}
        </ol>
        {f.perguntas.length < MAX_PERGUNTAS && (
          <SecondaryButton type="button" onClick={() => setF(a => ({ ...a, perguntas: [...a.perguntas, perguntaVazia('escala5')] }))} className="mt-3"><Plus size={16} /> Adicionar pergunta</SecondaryButton>
        )}
      </div>
    </Modal>
  );
}
