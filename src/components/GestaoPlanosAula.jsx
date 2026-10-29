import React, { useEffect, useMemo, useState } from 'react';
import { BookOpenCheck, Check, ExternalLink, Loader2, Paperclip, Undo2 } from 'lucide-react';
import { Modal, Notice, Loading, EmptyState, PrimaryButton, SecondaryButton, Field } from './GestaoShared';
import { listarProfessores, mensagemDeErro } from '../tradicional/lib/estrutura';
import {
  STATUS_PLANO, SECOES_PLANO, dataBR, segundaDaSemana, agruparPorSemana,
  listarPlanosDaEscola, revisarPlano, listarAnexos, linkDoAnexo,
} from '../lib/planoAula';
import { notifyPlanoAula } from '../lib/notifyPlanoAula';

const campo = 'w-full p-2.5 border border-outline-variant rounded-zela-md focus:ring-2 focus:ring-primary bg-surface';
const corDoStatus = {
  rascunho: 'bg-surface-container text-on-surface-variant',
  enviado: 'bg-brass/15 text-brass',
  aprovado: 'bg-primary/10 text-primary',
  devolvido: 'bg-brass/15 text-brass',
};

// Gestão › Acadêmico › Planos de aula. Só gestao e gestao_pedagogica. A tela
// só muda status e comentário; o trigger do banco carimba quem revisou e
// impede qualquer alteração no conteúdo da professora.
export default function GestaoPlanosAula({ currentUser, currentSchool }) {
  const schoolId = currentSchool?.id || currentUser?.school_id;
  const [planos, setPlanos] = useState([]);
  const [professores, setProfessores] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [msg, setMsg] = useState({ tipo: 'error', texto: '' });
  const [filtroStatus, setFiltroStatus] = useState('enviado');
  const [filtroTurma, setFiltroTurma] = useState('');
  const [filtroProfessor, setFiltroProfessor] = useState('');
  const [filtroSemana, setFiltroSemana] = useState('');
  const [aberto, setAberto] = useState(null);
  const [anexos, setAnexos] = useState([]);
  const [comentario, setComentario] = useState('');
  const [erroForm, setErroForm] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const [lista, profs] = await Promise.all([listarPlanosDaEscola(schoolId), listarProfessores(schoolId).catch(() => [])]);
        if (!ativo) return;
        setPlanos(lista);
        setProfessores(profs);
      } catch (e) {
        if (ativo) setMsg({ tipo: 'error', texto: mensagemDeErro(e) });
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => { ativo = false; };
  }, [schoolId]);

  const nomeDe = (id) => professores.find(p => p.id === id)?.name || 'Professor(a)';
  const paraRevisar = planos.filter(p => p.status === 'enviado').length;
  const turmas = useMemo(() => [...new Set(planos.map(p => p.turma))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [planos]);
  const semanas = useMemo(() => agruparPorSemana(planos).map(g => g.segunda), [planos]);
  const visiveis = useMemo(() => planos.filter(p => (
    (!filtroStatus || p.status === filtroStatus)
    && (!filtroTurma || p.turma === filtroTurma)
    && (!filtroProfessor || p.teacher_id === filtroProfessor)
    && (!filtroSemana || segundaDaSemana(p.periodo_inicio) === filtroSemana)
  )), [planos, filtroStatus, filtroTurma, filtroProfessor, filtroSemana]);
  const grupos = useMemo(() => agruparPorSemana(visiveis), [visiveis]);

  const abrir = async (p) => {
    setAberto(p); setComentario(p.comentario_coordenacao || ''); setErroForm(''); setAnexos([]);
    try { setAnexos(await listarAnexos(schoolId, p.id)); } catch { setAnexos([]); }
  };
  const fechar = () => { setAberto(null); setErroForm(''); };

  const abrirAnexo = async (a) => {
    try { window.open(await linkDoAnexo(a.caminho), '_blank', 'noopener'); } catch (err) { setErroForm(mensagemDeErro(err)); }
  };

  const decidir = async (status) => {
    if (status === 'devolvido' && !comentario.trim()) { setErroForm('Escreva o comentário para a professora ao devolver.'); return; }
    setSalvando(true); setErroForm('');
    try {
      const salvo = await revisarPlano(schoolId, aberto.id, status, comentario.trim());
      setPlanos(ps => ps.map(p => (p.id === salvo.id ? salvo : p)));
      if (status === 'devolvido') notifyPlanoAula(salvo.id);
      setMsg({ tipo: 'success', texto: status === 'aprovado' ? 'Plano aprovado.' : 'Plano devolvido para a professora.' });
      fechar();
    } catch (e) {
      setErroForm(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) return <Loading />;

  const revisavel = aberto && (aberto.status === 'enviado' || aberto.status === 'aprovado');

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2 flex-wrap">
        <BookOpenCheck size={22} className="text-primary" />
        <h2 className="text-xl font-bold text-on-surface flex-1">Planos de aula</h2>
      </div>
      {msg.texto && <Notice type={msg.tipo}>{msg.texto}</Notice>}
      {paraRevisar > 0 && (
        <p className="text-sm font-medium text-brass border border-brass/40 bg-brass/10 rounded-zela-md p-2.5">
          {paraRevisar === 1 ? '1 plano aguarda a sua revisão.' : `${paraRevisar} planos aguardam a sua revisão.`}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className={campo} aria-label="Filtrar por situação">
          <option value="enviado">Para revisar{paraRevisar ? ` (${paraRevisar})` : ''}</option>
          <option value="">Todas as situações</option>
          {Object.entries(STATUS_PLANO).filter(([v]) => v !== 'enviado' && v !== 'rascunho').map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={filtroTurma} onChange={e => setFiltroTurma(e.target.value)} className={campo} aria-label="Filtrar por turma">
          <option value="">Todas as turmas</option>
          {turmas.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filtroProfessor} onChange={e => setFiltroProfessor(e.target.value)} className={campo} aria-label="Filtrar por professora">
          <option value="">Todas as professoras</option>
          {professores.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={filtroSemana} onChange={e => setFiltroSemana(e.target.value)} className={campo} aria-label="Filtrar por semana">
          <option value="">Todas as semanas</option>
          {semanas.map(s => <option key={s} value={s}>Semana de {dataBR(s)}</option>)}
        </select>
      </div>

      {grupos.length === 0 ? (
        <EmptyState icon={BookOpenCheck} text={filtroStatus === 'enviado' ? 'Nenhum plano para revisar.' : 'Nenhum plano encontrado.'} />
      ) : grupos.map(g => (
        <section key={g.segunda} className="space-y-2">
          <h3 className="text-sm font-bold text-on-surface-variant">Semana de {dataBR(g.segunda)}</h3>
          {g.itens.map(p => (
            <button key={p.id} onClick={() => abrir(p)} className="w-full text-left bg-surface-container-low rounded-zela-md p-4 flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-on-surface break-words">{p.turma}</p>
                <p className="text-xs text-on-surface-variant">{nomeDe(p.teacher_id)} · {dataBR(p.periodo_inicio)} a {dataBR(p.periodo_fim)}</p>
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-zela-md ${corDoStatus[p.status]}`}>{STATUS_PLANO[p.status]}</span>
            </button>
          ))}
        </section>
      ))}

      {aberto && (
        <Modal
          wide
          title={`Plano de aula · ${aberto.turma}`}
          onClose={fechar}
          footer={revisavel ? (
            <>
              <SecondaryButton onClick={fechar}>Fechar</SecondaryButton>
              <SecondaryButton onClick={() => decidir('devolvido')} disabled={salvando}><Undo2 size={16} /> Devolver</SecondaryButton>
              {aberto.status === 'enviado' && (
                <PrimaryButton onClick={() => decidir('aprovado')} disabled={salvando}>
                  {salvando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Aprovar
                </PrimaryButton>
              )}
            </>
          ) : <SecondaryButton onClick={fechar}>Fechar</SecondaryButton>}
        >
          <div className="space-y-3">
            <Notice type="error">{erroForm}</Notice>
            <p className="text-sm text-on-surface-variant">
              {nomeDe(aberto.teacher_id)} · {dataBR(aberto.periodo_inicio)} a {dataBR(aberto.periodo_fim)} ·{' '}
              <span className="font-bold">{STATUS_PLANO[aberto.status]}</span>
            </p>
            {[...SECOES_PLANO, ['habilidades', 'Habilidades']].map(([chave, rotulo]) => (aberto[chave] ? (
              <div key={chave}>
                <p className="text-xs font-semibold text-on-surface-variant">{rotulo}</p>
                <p className="text-sm text-on-surface whitespace-pre-wrap break-words">{aberto[chave]}</p>
              </div>
            ) : null))}
            {anexos.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-on-surface-variant">Anexos</p>
                {anexos.map(a => (
                  <div key={a.caminho} className="flex items-center gap-2 text-sm bg-surface-container-low rounded-zela-md px-3 py-2">
                    <Paperclip size={14} className="text-on-surface-variant shrink-0" />
                    <span className="flex-1 min-w-0 truncate">{a.nome.replace(/^\d+-/, '')}</span>
                    <button onClick={() => abrirAnexo(a)} aria-label="Abrir anexo" className="p-1 text-on-surface-variant"><ExternalLink size={14} /></button>
                  </div>
                ))}
              </div>
            )}
            {revisavel ? (
              <Field label="Comentário para a professora" id="plano-comentario" hint="Obrigatório para devolver.">
                <textarea id="plano-comentario" rows={3} maxLength={2000} value={comentario} onChange={e => setComentario(e.target.value)} className={campo} />
              </Field>
            ) : aberto.comentario_coordenacao && (
              <p className="text-sm text-brass whitespace-pre-wrap break-words">Coordenação: {aberto.comentario_coordenacao}</p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
