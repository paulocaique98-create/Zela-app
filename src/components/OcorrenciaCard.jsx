import React, { useState } from 'react';
import { Paperclip, History, Pencil, CheckCircle2, Clock } from 'lucide-react';
import { TIPOS, GRAVIDADES, MEDIDAS, GRAVIDADE_TOM, dataBR, listarAnexos, linkDoAnexo, listarVersoes } from '../lib/ocorrencias';

// Cartão de uma ocorrência (tabela student_incidents).
//  * schoolId + comAnexos: mostra "Anexos" (quem registrou e a Gestão).
//  * comVersoes: mostra "Versões anteriores" (só Gestão).
//  * onEditar: botão de edição (só Gestão).
export default function OcorrenciaCard({ o, schoolId, comAnexos = false, comVersoes = false, onEditar, mostrarAluno = true }) {
  const [anexos, setAnexos] = useState(null);
  const [versoes, setVersoes] = useState(null);
  const [erro, setErro] = useState('');

  const abrirAnexos = async () => {
    try { setAnexos(await listarAnexos(schoolId, o.id)); } catch { setErro('Não foi possível carregar os anexos.'); }
  };
  const abrirArquivo = async (caminho) => {
    try { window.open(await linkDoAnexo(caminho), '_blank', 'noopener'); } catch { setErro('Não foi possível abrir o arquivo.'); }
  };
  const abrirVersoes = async () => {
    try { setVersoes(await listarVersoes(schoolId, o.id)); } catch { setErro('Não foi possível carregar as versões.'); }
  };

  return (
    <li className="bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {mostrarAluno && <p className="text-sm font-bold text-on-surface truncate">{o.students?.name || 'Aluno'}</p>}
          {mostrarAluno && o.students?.turma && <p className="text-xs text-on-surface-variant mt-0.5 truncate">{o.students.turma}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-semibold text-on-surface-variant tabular-nums">{dataBR(o.ocorrido_em)}</span>
          {onEditar && <button onClick={() => onEditar(o)} aria-label="Editar ocorrência" className="p-1 text-on-surface-variant hover:text-primary"><Pencil size={14} /></button>}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-sm bg-primary/10 text-primary">{TIPOS[o.tipo] || o.tipo}</span>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-sm ${GRAVIDADE_TOM[o.gravidade] || ''}`}>{GRAVIDADES[o.gravidade] || o.gravidade}</span>
        {o.medida && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-sm bg-warning/15 text-warning">{MEDIDAS[o.medida]}{o.medida_inicio ? `, ${dataBR(o.medida_inicio)}${o.medida_fim ? ` a ${dataBR(o.medida_fim)}` : ''}` : ''}</span>}
        {o.visivel_familia && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-sm bg-surface-container text-on-surface-variant">Família vê</span>}
        {o.exige_ciencia && (o.ciencia_em
          ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-sm bg-success/10 text-success"><CheckCircle2 size={11} /> Ciência em {dataBR(o.ciencia_em)}</span>
          : <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-sm bg-warning/15 text-warning"><Clock size={11} /> Aguardando ciência</span>)}
      </div>
      <p className="text-sm text-on-surface mt-2 whitespace-pre-wrap break-words">{o.descricao}</p>
      {o.providencias && <p className="text-xs text-on-surface-variant mt-2 whitespace-pre-wrap break-words"><span className="font-semibold">Providências:</span> {o.providencias}</p>}

      {(comAnexos || comVersoes) && (
        <div className="flex gap-3 mt-2.5 text-xs font-semibold text-primary">
          {comAnexos && anexos === null && <button onClick={abrirAnexos} className="inline-flex items-center gap-1 hover:underline"><Paperclip size={12} /> Anexos</button>}
          {comVersoes && versoes === null && <button onClick={abrirVersoes} className="inline-flex items-center gap-1 hover:underline"><History size={12} /> Versões anteriores</button>}
        </div>
      )}
      {erro && <p className="text-xs text-error mt-1">{erro}</p>}
      {anexos && (anexos.length === 0
        ? <p className="text-xs text-on-surface-variant mt-2">Sem anexos.</p>
        : <ul className="mt-2 space-y-0.5">{anexos.map(a => <li key={a.caminho}><button onClick={() => abrirArquivo(a.caminho)} className="text-xs text-primary hover:underline truncate max-w-full">{a.nome.replace(/^\d+-/, '')}</button></li>)}</ul>)}
      {versoes && (versoes.length === 0
        ? <p className="text-xs text-on-surface-variant mt-2">Nunca foi editada.</p>
        : <ul className="mt-2 space-y-2">{versoes.map(v => (
          <li key={v.id} className="text-xs bg-surface-container rounded-zela-md p-2">
            <p className="font-semibold text-on-surface-variant">Versão {v.versao}, até {new Date(v.created_at).toLocaleString('pt-BR')}</p>
            <p className="mt-0.5 whitespace-pre-wrap break-words">{v.snapshot?.descricao}</p>
            {v.snapshot?.providencias && <p className="mt-0.5 text-on-surface-variant whitespace-pre-wrap break-words">Providências: {v.snapshot.providencias}</p>}
          </li>))}</ul>)}
    </li>
  );
}
