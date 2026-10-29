import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Copy, Link2, MessageCircle, Plus, RefreshCw, UserPlus, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ConfirmModal from './ConfirmModal';
import { useSchoolConfig } from '../lib/schoolConfig';
import { PageShell, Loading, Notice, EmptyState, Modal, Field, PrimaryButton, SecondaryButton, StatCard, inputCls } from './GestaoShared';
import { formatIdade } from '../lib/sugestaoTurma';
import {
  ETAPAS, ETAPAS_ABERTAS, ORIGENS, TIPOS_INTERACAO,
  diasSemContato, filaPorTurma, leadAberto, linkFormulario, linkWhatsapp,
  rotuloEtapa, rotuloFila, rotuloInteracao, rotuloOrigem, rotuloVisita, textoBusca,
} from '../lib/captacao';

const AdminUserRegistration = lazy(() => import('./AdminUserRegistration'));
const FunilCaptacao = lazy(() => import('./bi/FunilCaptacao'));

const COLUNAS_LEAD = 'id, responsavel_nome, telefone, email, crianca_nome, crianca_nascimento, interesse, origem, etapa, motivo_perda, responsavel_id, consentimento_em, created_at, anonimizado_em';
const DIAS_ALERTA = 7;

const fmtDataHora = (iso) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
const fmtData = (iso) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const hojeISO = () => new Date().toISOString().slice(0, 10);

function idadeTexto(nascimento) {
  if (!nascimento) return '';
  const d = new Date(`${nascimento}T00:00:00`);
  const h = new Date();
  let meses = (h.getFullYear() - d.getFullYear()) * 12 + h.getMonth() - d.getMonth();
  if (h.getDate() < d.getDate()) meses -= 1;
  return meses >= 0 ? formatIdade(meses) : '';
}

// Captação (módulo `captacao`). Gestão, Coordenação e Direção; cada aba é um item do menu.
// O banco barra o resto: RLS por escola e perfil, etapa e motivo da perda por gatilho,
// posição da fila e anonimização LGPD (leads_anonimizar_perdidos).
export default function GestaoCaptacao({ currentUser, currentSchool, aba }) {
  const schoolId = currentUser.school_id;
  const { turmas } = useSchoolConfig(schoolId);
  const [leads, setLeads] = useState(null);
  const [interacoes, setInteracoes] = useState([]);
  const [visitas, setVisitas] = useState([]);
  const [fila, setFila] = useState([]);
  const [equipe, setEquipe] = useState({});
  const [alunos, setAlunos] = useState({});
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  const carregar = useCallback(async () => {
    const [ld, it, vs, wl, us] = await Promise.all([
      supabase.from('leads').select(COLUNAS_LEAD).eq('school_id', schoolId).order('created_at', { ascending: false }).limit(2000),
      supabase.from('lead_interactions').select('id, lead_id, tipo, nota, ocorrida_em, registrado_por').eq('school_id', schoolId).order('ocorrida_em', { ascending: false }).limit(3000),
      supabase.from('lead_visits').select('id, lead_id, agendada_para, status, observacao').eq('school_id', schoolId).order('agendada_para', { ascending: false }).limit(1500),
      supabase.from('waitlist').select('id, lead_id, student_id, turma, posicao, status, observacao').eq('school_id', schoolId).order('posicao').limit(2000),
      supabase.from('users').select('id, name').eq('school_id', schoolId).in('role', ['gestao', 'gestao_pedagogica', 'admin']).limit(200),
    ]);
    if (ld.error || it.error || vs.error || wl.error) { setErro('Não foi possível carregar a Captação.'); setLeads([]); return; }
    setErro('');
    setLeads(ld.data);
    setInteracoes(it.data);
    setVisitas(vs.data);
    setFila(wl.data);
    setEquipe(Object.fromEntries((us.data || []).map(u => [u.id, u.name])));

    const ids = [...new Set(wl.data.map(w => w.student_id).filter(Boolean))];
    if (ids.length) {
      const { data } = await supabase.from('students').select('id, name').eq('school_id', schoolId).in('id', ids).limit(500);
      setAlunos(Object.fromEntries((data || []).map(s => [s.id, s.name])));
    }
  }, [schoolId]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { setAviso(''); }, [aba]);

  const porId = useMemo(() => Object.fromEntries((leads || []).map(l => [l.id, l])), [leads]);
  const ultimaPorLead = useMemo(() => {
    const m = {};
    for (const i of interacoes) if (!m[i.lead_id]) m[i.lead_id] = i.ocorrida_em;
    return m;
  }, [interacoes]);

  const ctx = {
    currentUser, currentSchool, schoolId, turmas, leads, porId, interacoes, visitas, fila, equipe, alunos,
    ultimaPorLead, carregar, setErro, setAviso,
  };

  return (
    <PageShell>
      <div className="space-y-3">
        <Notice type="error">{erro}</Notice>
        <Notice type="success">{aviso}</Notice>
        {leads === null ? <Loading /> : (
          <>
            {aba === 'captacao-quadro' && <Quadro {...ctx} />}
            {aba === 'captacao-visitas' && <Visitas {...ctx} />}
            {aba === 'captacao-espera' && <ListaEspera {...ctx} />}
            {aba === 'captacao-funil' && <Funil {...ctx} />}
          </>
        )}
      </div>
    </PageShell>
  );
}

// ───────────────────────── Quadro ─────────────────────────
function Quadro(ctx) {
  const { currentUser, leads, ultimaPorLead, equipe, schoolId, carregar, setErro, setAviso } = ctx;
  const [busca, setBusca] = useState('');
  const [filtroResp, setFiltroResp] = useState('');
  const [encerrados, setEncerrados] = useState(false);
  const [abertoId, setAbertoId] = useState(null);
  const [novo, setNovo] = useState(false);
  const [perdendo, setPerdendo] = useState(null);
  const [links, setLinks] = useState(false);
  const [arrastando, setArrastando] = useState(null);

  const visiveis = useMemo(() => {
    const q = textoBusca(busca);
    return leads.filter(l => !l.anonimizado_em
      && (!filtroResp || l.responsavel_id === filtroResp)
      && (!q || textoBusca(`${l.responsavel_nome} ${l.crianca_nome} ${l.telefone} ${l.email}`).includes(q)));
  }, [leads, busca, filtroResp]);

  const abertos = visiveis.filter(leadAberto);
  const parados = abertos.filter(l => diasSemContato(l, ultimaPorLead[l.id]) >= DIAS_ALERTA).length;
  const matriculados = leads.filter(l => l.etapa === 'matriculado').length;

  const mover = async (lead, etapa) => {
    if (lead.etapa === etapa) return;
    if (etapa === 'perdido') return setPerdendo(lead);
    const { error } = await supabase.from('leads').update({ etapa }).eq('id', lead.id).eq('school_id', schoolId);
    if (error) { setAviso(''); return setErro('Não foi possível mudar a etapa.'); }
    setErro('');
    carregar();
  };

  const soltar = (etapa) => {
    const lead = leads.find(l => l.id === arrastando);
    setArrastando(null);
    if (lead) mover(lead, etapa);
  };

  const card = (l) => {
    const dias = diasSemContato(l, ultimaPorLead[l.id]);
    const parado = leadAberto(l) && dias >= DIAS_ALERTA;
    const idade = idadeTexto(l.crianca_nascimento);
    return (
      <div
        key={l.id}
        draggable
        onDragStart={(e) => { setArrastando(l.id); e.dataTransfer.setData('text/plain', l.id); }}
        onDragEnd={() => setArrastando(null)}
        className={`bg-surface-container-lowest border rounded-zela-md p-3 space-y-1.5 ${parado ? 'border-warning/60' : 'border-outline-variant'} ${arrastando === l.id ? 'opacity-50' : ''}`}
      >
        <button type="button" onClick={() => setAbertoId(l.id)} className="text-left w-full">
          <p className="font-semibold text-sm text-on-surface">{l.responsavel_nome}</p>
          {l.crianca_nome && <p className="text-xs text-on-surface-variant">{l.crianca_nome}{idade ? `, ${idade}` : ''}</p>}
          {l.interesse && <p className="text-xs text-on-surface-variant">Interesse: {l.interesse}</p>}
        </button>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-on-surface-variant">
          <span>{rotuloOrigem(l.origem)}</span>
          {l.responsavel_id && equipe[l.responsavel_id] && <span>{equipe[l.responsavel_id]}</span>}
          {leadAberto(l) && <span className={parado ? 'text-warning font-semibold' : ''}>{dias === 0 ? 'Contato hoje' : `${dias} ${dias === 1 ? 'dia' : 'dias'} sem contato`}</span>}
          {l.etapa === 'perdido' && l.motivo_perda && <span>Motivo: {l.motivo_perda}</span>}
        </div>
        <select
          aria-label={`Etapa de ${l.responsavel_nome}`}
          className={`${inputCls} !py-1 text-xs`}
          value={l.etapa}
          onChange={e => mover(l, e.target.value)}
        >
          {ETAPAS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
      </div>
    );
  };

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <StatCard compact label="Em andamento" value={abertos.length} />
        <StatCard compact label="Sem contato há 7 dias" value={parados} tone={parados ? 'warn' : 'default'} />
        <StatCard compact label="Matriculados" value={matriculados} tone={matriculados ? 'good' : 'default'} />
        <StatCard compact label="Total de interessados" value={leads.filter(l => !l.anonimizado_em).length} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input className={`${inputCls} sm:max-w-xs`} placeholder="Buscar por nome ou contato" aria-label="Buscar interessado" value={busca} onChange={e => setBusca(e.target.value)} />
        <select className={`${inputCls} sm:max-w-[12rem]`} aria-label="Filtrar por responsável" value={filtroResp} onChange={e => setFiltroResp(e.target.value)}>
          <option value="">Toda a equipe</option>
          {Object.entries(equipe).map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-on-surface-variant">
          <input type="checkbox" checked={encerrados} onChange={e => setEncerrados(e.target.checked)} /> Mostrar encerrados
        </label>
        <div className="flex gap-2 sm:ml-auto">
          <SecondaryButton onClick={() => setLinks(true)}><Link2 size={14} /> Link do formulário</SecondaryButton>
          <PrimaryButton onClick={() => setNovo(true)}><Plus size={14} /> Novo interessado</PrimaryButton>
        </div>
      </div>

      {leads.length === 0 ? (
        <EmptyState icon={UserPlus} text="Nenhum interessado ainda" hint="Cadastre um interessado ou divulgue o link do formulário." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 items-start">
          {ETAPAS_ABERTAS.map(e => {
            const itens = visiveis.filter(l => l.etapa === e.id);
            return (
              <section
                key={e.id}
                aria-label={e.label}
                onDragOver={ev => ev.preventDefault()}
                onDrop={() => soltar(e.id)}
                className="bg-surface-container-low rounded-zela-lg p-2.5 space-y-2 min-h-[5rem]"
              >
                <h3 className="text-xs font-bold text-on-surface-variant flex justify-between px-1"><span>{e.label}</span><span>{itens.length}</span></h3>
                {itens.map(card)}
              </section>
            );
          })}
        </div>
      )}

      {encerrados && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
          {['matriculado', 'perdido'].map(id => (
            <section key={id} aria-label={rotuloEtapa(id)} onDragOver={ev => ev.preventDefault()} onDrop={() => soltar(id)} className="bg-surface-container-low rounded-zela-lg p-2.5 space-y-2 min-h-[5rem]">
              <h3 className="text-xs font-bold text-on-surface-variant flex justify-between px-1"><span>{rotuloEtapa(id)}</span><span>{visiveis.filter(l => l.etapa === id).length}</span></h3>
              {visiveis.filter(l => l.etapa === id).map(card)}
            </section>
          ))}
        </div>
      )}

      {abertoId && ctx.porId[abertoId] && <ModalLead {...ctx} lead={ctx.porId[abertoId]} onClose={() => setAbertoId(null)} onPerder={setPerdendo} />}
      {novo && <ModalNovoLead currentUser={currentUser} equipe={equipe} onClose={() => setNovo(false)} onSalvo={() => { setNovo(false); setAviso('Interessado cadastrado.'); carregar(); }} />}
      {perdendo && <ModalPerda lead={perdendo} schoolId={schoolId} onClose={() => setPerdendo(null)} onFeito={() => { setPerdendo(null); setAviso('Interessado marcado como perdido.'); carregar(); }} />}
      {links && <ModalLinks schoolCode={ctx.currentSchool?.school_code} onClose={() => setLinks(false)} />}
    </>
  );
}

function ModalLinks({ schoolCode, onClose }) {
  const [copiado, setCopiado] = useState('');
  const opcoes = [['site', 'Geral'], ['instagram', 'Instagram'], ['google', 'Google'], ['indicacao', 'Indicação']];
  const copiar = async (origem) => {
    try { await navigator.clipboard.writeText(linkFormulario(schoolCode, origem)); setCopiado(origem); setTimeout(() => setCopiado(''), 2000); } catch { /* sem permissão de área de transferência */ }
  };
  return (
    <Modal title="Link do formulário" onClose={onClose} footer={<SecondaryButton onClick={onClose}>Fechar</SecondaryButton>}>
      {!schoolCode ? <Notice type="error">A escola ainda não tem código. Fale com o suporte.</Notice> : (
        <>
          <p className="text-sm text-on-surface-variant">Divulgue o link onde a escola aparece. Cada link marca de onde o interessado veio.</p>
          {opcoes.map(([origem, rotulo]) => (
            <div key={origem} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-on-surface">{rotulo}</p>
                <p className="text-[11px] text-on-surface-variant truncate">{linkFormulario(schoolCode, origem)}</p>
              </div>
              <SecondaryButton onClick={() => copiar(origem)}><Copy size={14} /> {copiado === origem ? 'Copiado' : 'Copiar'}</SecondaryButton>
            </div>
          ))}
        </>
      )}
    </Modal>
  );
}

function ModalNovoLead({ currentUser, equipe, onClose, onSalvo }) {
  const [f, setF] = useState({ responsavel_nome: '', telefone: '', email: '', crianca_nome: '', crianca_nascimento: '', interesse: '', origem: 'visita', responsavel_id: currentUser.id });
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState('');
  const set = (k) => (e) => setF(v => ({ ...v, [k]: e.target.value }));

  const salvar = async () => {
    setMsg('');
    if (!f.responsavel_nome.trim()) return setMsg('Informe o nome do responsável.');
    if (!f.telefone.trim() && !f.email.trim()) return setMsg('Informe um telefone ou um e-mail.');
    setSalvando(true);
    const { error } = await supabase.from('leads').insert({
      school_id: currentUser.school_id,
      responsavel_nome: f.responsavel_nome.trim(),
      telefone: f.telefone.trim() || null,
      email: f.email.trim().toLowerCase() || null,
      crianca_nome: f.crianca_nome.trim() || null,
      crianca_nascimento: f.crianca_nascimento || null,
      interesse: f.interesse.trim() || null,
      origem: f.origem,
      responsavel_id: f.responsavel_id || null,
    });
    setSalvando(false);
    if (error) return setMsg('Não foi possível salvar o interessado.');
    onSalvo();
  };

  return (
    <Modal title="Novo interessado" onClose={onClose} footer={<>
      <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
      <PrimaryButton onClick={salvar} disabled={salvando}>Salvar</PrimaryButton>
    </>}>
      <Notice type="error">{msg}</Notice>
      <CamposLead f={f} set={set} equipe={equipe} idp="nl" />
    </Modal>
  );
}

function CamposLead({ f, set, equipe, idp }) {
  return (
    <>
      <Field label="Nome do responsável" id={`${idp}-nome`}><input id={`${idp}-nome`} className={inputCls} maxLength={120} value={f.responsavel_nome} onChange={set('responsavel_nome')} /></Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Telefone ou WhatsApp" id={`${idp}-tel`}><input id={`${idp}-tel`} className={inputCls} maxLength={30} inputMode="tel" value={f.telefone} onChange={set('telefone')} /></Field>
        <Field label="E-mail" id={`${idp}-email`}><input id={`${idp}-email`} className={inputCls} type="email" maxLength={160} value={f.email} onChange={set('email')} /></Field>
        <Field label="Nome da criança" id={`${idp}-crianca`}><input id={`${idp}-crianca`} className={inputCls} maxLength={120} value={f.crianca_nome} onChange={set('crianca_nome')} /></Field>
        <Field label="Nascimento da criança" id={`${idp}-nasc`}><input id={`${idp}-nasc`} className={inputCls} type="date" max={hojeISO()} value={f.crianca_nascimento} onChange={set('crianca_nascimento')} /></Field>
        <Field label="Turma ou ano de interesse" id={`${idp}-int`}><input id={`${idp}-int`} className={inputCls} maxLength={120} value={f.interesse} onChange={set('interesse')} /></Field>
        <Field label="Origem" id={`${idp}-orig`}>
          <select id={`${idp}-orig`} className={inputCls} value={f.origem} onChange={set('origem')}>
            {ORIGENS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Quem cuida deste contato" id={`${idp}-resp`}>
          <select id={`${idp}-resp`} className={inputCls} value={f.responsavel_id || ''} onChange={set('responsavel_id')}>
            <option value="">Ninguém ainda</option>
            {Object.entries(equipe).map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
          </select>
        </Field>
      </div>
    </>
  );
}

function ModalPerda({ lead, schoolId, onClose, onFeito }) {
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState('');
  const sugestoes = ['Escolheu outra escola', 'Preço', 'Distância', 'Sem retorno', 'Mudou de cidade', 'Desistiu'];

  const confirmar = async () => {
    if (!motivo.trim()) return setMsg('Informe o motivo da perda.');
    setSalvando(true);
    const { error } = await supabase.from('leads').update({ etapa: 'perdido', motivo_perda: motivo.trim() }).eq('id', lead.id).eq('school_id', schoolId);
    setSalvando(false);
    if (error) return setMsg('Não foi possível registrar a perda.');
    onFeito();
  };

  return (
    <Modal title="Marcar como perdido" onClose={onClose} footer={<>
      <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
      <PrimaryButton onClick={confirmar} disabled={salvando}>Confirmar</PrimaryButton>
    </>}>
      <Notice type="error">{msg}</Notice>
      <p className="text-sm text-on-surface-variant">{lead.responsavel_nome}. O dado pessoal é apagado automaticamente 12 meses depois, e o motivo fica no relatório.</p>
      <Field label="Motivo" id="perda-motivo">
        <input id="perda-motivo" className={inputCls} list="perda-sugestoes" maxLength={200} value={motivo} onChange={e => setMotivo(e.target.value)} />
        <datalist id="perda-sugestoes">{sugestoes.map(s => <option key={s} value={s} />)}</datalist>
      </Field>
    </Modal>
  );
}

// ───────────────────────── Ficha do interessado ─────────────────────────
function ModalLead({ currentUser, schoolId, turmas, lead, interacoes, visitas, fila, equipe, carregar, setErro, setAviso, onClose, onPerder }) {
  const [f, setF] = useState({
    responsavel_nome: lead.responsavel_nome || '', telefone: lead.telefone || '', email: lead.email || '',
    crianca_nome: lead.crianca_nome || '', crianca_nascimento: lead.crianca_nascimento || '', interesse: lead.interesse || '',
    origem: lead.origem, responsavel_id: lead.responsavel_id || '',
  });
  const [msg, setMsg] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [tipo, setTipo] = useState('ligacao');
  const [nota, setNota] = useState('');
  const [quando, setQuando] = useState('');
  const [obsVisita, setObsVisita] = useState('');
  const [turmaFila, setTurmaFila] = useState('');
  const [convertendo, setConvertendo] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const set = (k) => (e) => setF(v => ({ ...v, [k]: e.target.value }));

  const minhas = interacoes.filter(i => i.lead_id === lead.id);
  const minhasVisitas = visitas.filter(v => v.lead_id === lead.id);
  const naFila = fila.filter(w => w.lead_id === lead.id && w.status === 'aguardando');
  const wa = linkWhatsapp(lead.telefone);

  const rodar = async (promessa, ok, falha) => {
    setMsg('');
    const { error } = await promessa;
    if (error) { setMsg(falha); return false; }
    if (ok) setAviso(ok);
    await carregar();
    return true;
  };

  const salvar = async () => {
    if (!f.responsavel_nome.trim()) return setMsg('Informe o nome do responsável.');
    if (!f.telefone.trim() && !f.email.trim()) return setMsg('Informe um telefone ou um e-mail.');
    setSalvando(true);
    await rodar(supabase.from('leads').update({
      responsavel_nome: f.responsavel_nome.trim(), telefone: f.telefone.trim() || null, email: f.email.trim().toLowerCase() || null,
      crianca_nome: f.crianca_nome.trim() || null, crianca_nascimento: f.crianca_nascimento || null,
      interesse: f.interesse.trim() || null, origem: f.origem, responsavel_id: f.responsavel_id || null,
    }).eq('id', lead.id).eq('school_id', schoolId), 'Dados salvos.', 'Não foi possível salvar os dados.');
    setSalvando(false);
  };

  const registrar = async () => {
    if (!nota.trim()) return setMsg('Escreva o que foi combinado ou conversado.');
    if (await rodar(supabase.from('lead_interactions').insert({ school_id: schoolId, lead_id: lead.id, tipo, nota: nota.trim() }), null, 'Não foi possível registrar o contato.')) setNota('');
  };

  const agendar = async () => {
    if (!quando) return setMsg('Escolha o dia e a hora da visita.');
    if (await rodar(supabase.from('lead_visits').insert({
      school_id: schoolId, lead_id: lead.id, agendada_para: new Date(quando).toISOString(), observacao: obsVisita.trim() || null,
    }), 'Visita agendada.', 'Não foi possível agendar a visita.')) { setQuando(''); setObsVisita(''); }
  };

  const entrarNaFila = async () => {
    if (!turmaFila.trim()) return setMsg('Informe a turma da lista de espera.');
    if (await rodar(supabase.from('waitlist').insert({ school_id: schoolId, lead_id: lead.id, turma: turmaFila.trim(), posicao: 1 }),
      `Entrou na lista de espera de ${turmaFila.trim()}.`, 'Já está na fila desta turma ou não foi possível entrar.')) setTurmaFila('');
  };

  const excluir = async () => {
    setExcluindo(false);
    const { error } = await supabase.from('leads').delete().eq('id', lead.id).eq('school_id', schoolId);
    if (error) { setAviso(''); setErro('Não foi possível excluir o interessado.'); return; }
    setErro(''); setAviso('Interessado e histórico excluídos.'); carregar(); onClose();
  };

  return (
    <>
      <Modal title={lead.responsavel_nome} wide onClose={onClose} footer={<>
        {currentUser.role === 'gestao' && <SecondaryButton onClick={() => setExcluindo(true)} className="mr-auto">Excluir</SecondaryButton>}
        {leadAberto(lead) && <SecondaryButton onClick={() => { onClose(); onPerder(lead); }}>Marcar como perdido</SecondaryButton>}
        {leadAberto(lead) && <SecondaryButton onClick={() => setConvertendo(true)}><UserPlus size={14} /> Converter em matrícula</SecondaryButton>}
        <PrimaryButton onClick={salvar} disabled={salvando}>Salvar dados</PrimaryButton>
      </>}>
        <Notice type="error">{msg}</Notice>
        <p className="text-xs text-on-surface-variant">
          Etapa: <strong>{rotuloEtapa(lead.etapa)}</strong>{lead.motivo_perda ? `, motivo: ${lead.motivo_perda}` : ''}.
          Chegou em {fmtData(lead.created_at)}{lead.consentimento_em ? `, com autorização de contato em ${fmtData(lead.consentimento_em)}` : ', cadastrado pela equipe'}.
          {wa && <> <a href={wa} target="_blank" rel="noopener noreferrer" className="text-primary font-semibold inline-flex items-center gap-1"><MessageCircle size={12} /> Abrir WhatsApp</a></>}
        </p>
        <CamposLead f={f} set={set} equipe={equipe} idp="ml" />

        <section className="border-t border-outline-variant pt-3 space-y-2">
          <h4 className="text-sm font-bold text-on-surface">Contatos</h4>
          <div className="grid grid-cols-1 sm:grid-cols-[10rem_1fr_auto] gap-2">
            <select aria-label="Tipo de contato" className={inputCls} value={tipo} onChange={e => setTipo(e.target.value)}>
              {TIPOS_INTERACAO.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <input aria-label="O que foi conversado" className={inputCls} maxLength={1000} placeholder="O que foi conversado ou combinado" value={nota} onChange={e => setNota(e.target.value)} />
            <SecondaryButton onClick={registrar}>Registrar</SecondaryButton>
          </div>
          {minhas.length === 0 ? <p className="text-xs text-on-surface-variant">Nenhum contato registrado.</p> : (
            <ul className="space-y-1.5">
              {minhas.map(i => (
                <li key={i.id} className="text-xs text-on-surface bg-surface-container-low rounded-zela-md px-2.5 py-1.5">
                  <span className="font-semibold">{rotuloInteracao(i.tipo)}</span> · {fmtDataHora(i.ocorrida_em)}{equipe[i.registrado_por] ? ` · ${equipe[i.registrado_por]}` : ''}
                  <br />{i.nota}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="border-t border-outline-variant pt-3 space-y-2">
          <h4 className="text-sm font-bold text-on-surface">Visitas</h4>
          <div className="grid grid-cols-1 sm:grid-cols-[13rem_1fr_auto] gap-2">
            <input aria-label="Dia e hora da visita" className={inputCls} type="datetime-local" value={quando} onChange={e => setQuando(e.target.value)} />
            <input aria-label="Observação da visita" className={inputCls} maxLength={500} placeholder="Observação (opcional)" value={obsVisita} onChange={e => setObsVisita(e.target.value)} />
            <SecondaryButton onClick={agendar}><CalendarClock size={14} /> Agendar</SecondaryButton>
          </div>
          {minhasVisitas.map(v => (
            <p key={v.id} className="text-xs text-on-surface">{fmtDataHora(v.agendada_para)} · {rotuloVisita(v.status)}{v.observacao ? ` · ${v.observacao}` : ''}</p>
          ))}
        </section>

        <section className="border-t border-outline-variant pt-3 space-y-2">
          <h4 className="text-sm font-bold text-on-surface">Lista de espera</h4>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
            <input aria-label="Turma da lista de espera" className={inputCls} list="ml-turmas" maxLength={80} placeholder="Turma desejada" value={turmaFila} onChange={e => setTurmaFila(e.target.value)} />
            <datalist id="ml-turmas">{(turmas || []).map(t => <option key={t} value={t} />)}</datalist>
            <SecondaryButton onClick={entrarNaFila}><Users size={14} /> Entrar na fila</SecondaryButton>
          </div>
          {naFila.map(w => <p key={w.id} className="text-xs text-on-surface">Na fila de {w.turma}, posição {w.posicao}.</p>)}
        </section>
      </Modal>

      {convertendo && (
        <Suspense fallback={null}>
          <AdminUserRegistration
            currentUser={currentUser}
            forceModal
            initialData={{ name: lead.responsavel_nome, phone1: lead.telefone || '', email: lead.email || '' }}
            initialStudent={{ name: lead.crianca_nome || '', birth_date: lead.crianca_nascimento || '' }}
            onCreated={async () => {
              const { error } = await supabase.from('leads').update({ etapa: 'matriculado' }).eq('id', lead.id).eq('school_id', schoolId);
              if (error) setMsg('O cadastro foi criado, mas a etapa não pôde ser atualizada. Mude para Matriculado à mão.');
              else setAviso(`${lead.responsavel_nome} agora está como Matriculado.`);
              carregar();
            }}
            onClose={() => { setConvertendo(false); carregar(); }}
          />
        </Suspense>
      )}
      {excluindo && (
        <ConfirmModal
          title="Excluir interessado"
          message="O cadastro, os contatos, as visitas e o lugar na fila serão apagados de vez. Use isto para pedidos de exclusão de dados."
          confirmLabel="Excluir"
          onConfirm={excluir}
          onCancel={() => setExcluindo(false)}
        />
      )}
    </>
  );
}

// ───────────────────────── Visitas ─────────────────────────
function Visitas({ leads, porId, visitas, schoolId, carregar, setErro, setAviso }) {
  const [passadas, setPassadas] = useState(false);
  const [agendando, setAgendando] = useState(false);
  const agora = Date.now();

  const lista = visitas
    .filter(v => (passadas ? new Date(v.agendada_para).getTime() < agora || v.status !== 'agendada' : v.status === 'agendada' && new Date(v.agendada_para).getTime() >= agora))
    .sort((a, b) => (passadas ? b.agendada_para.localeCompare(a.agendada_para) : a.agendada_para.localeCompare(b.agendada_para)));

  const atrasadas = visitas.filter(v => v.status === 'agendada' && new Date(v.agendada_para).getTime() < agora).length;
  const proximas = visitas.filter(v => v.status === 'agendada' && new Date(v.agendada_para).getTime() >= agora).length;

  const marcar = async (v, status) => {
    const { error } = await supabase.from('lead_visits').update({ status }).eq('id', v.id).eq('school_id', schoolId);
    if (error) { setAviso(''); return setErro('Não foi possível atualizar a visita.'); }
    setErro(''); carregar();
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <StatCard compact label="Visitas marcadas" value={proximas} />
        <StatCard compact label="Para atualizar" value={atrasadas} tone={atrasadas ? 'warn' : 'default'} hint="Passaram e seguem como agendadas" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SecondaryButton onClick={() => setPassadas(p => !p)}>{passadas ? 'Ver próximas' : 'Ver passadas'}</SecondaryButton>
        <PrimaryButton className="sm:ml-auto" onClick={() => setAgendando(true)}><CalendarClock size={14} /> Agendar visita</PrimaryButton>
      </div>
      {lista.length === 0 ? <EmptyState icon={CalendarClock} text={passadas ? 'Nenhuma visita passada' : 'Nenhuma visita marcada'} hint="Agende pela ficha do interessado ou pelo botão acima." /> : (
        <ul className="space-y-2">
          {lista.map(v => {
            const lead = porId[v.lead_id];
            const vencida = v.status === 'agendada' && new Date(v.agendada_para).getTime() < agora;
            return (
              <li key={v.id} className={`bg-surface-container-lowest border rounded-zela-md p-3 flex flex-wrap items-center gap-2 ${vencida ? 'border-warning/60' : 'border-outline-variant'}`}>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-on-surface">{lead?.responsavel_nome || 'Interessado removido'}</p>
                  <p className="text-xs text-on-surface-variant">{fmtDataHora(v.agendada_para)} · {rotuloVisita(v.status)}{lead?.crianca_nome ? ` · ${lead.crianca_nome}` : ''}{v.observacao ? ` · ${v.observacao}` : ''}</p>
                </div>
                {v.status === 'agendada' && (
                  <div className="flex gap-1.5">
                    <SecondaryButton onClick={() => marcar(v, 'realizada')}>Realizada</SecondaryButton>
                    <SecondaryButton onClick={() => marcar(v, 'faltou')}>Não veio</SecondaryButton>
                    <SecondaryButton onClick={() => marcar(v, 'cancelada')}>Cancelar</SecondaryButton>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {agendando && <ModalAgendar leads={leads.filter(l => leadAberto(l) && !l.anonimizado_em)} schoolId={schoolId} onClose={() => setAgendando(false)} onFeito={() => { setAgendando(false); setAviso('Visita agendada.'); carregar(); }} />}
    </>
  );
}

function ModalAgendar({ leads, schoolId, onClose, onFeito }) {
  const [leadId, setLeadId] = useState('');
  const [quando, setQuando] = useState('');
  const [obs, setObs] = useState('');
  const [msg, setMsg] = useState('');
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    if (!leadId) return setMsg('Escolha o interessado.');
    if (!quando) return setMsg('Escolha o dia e a hora.');
    setSalvando(true);
    const { error } = await supabase.from('lead_visits').insert({ school_id: schoolId, lead_id: leadId, agendada_para: new Date(quando).toISOString(), observacao: obs.trim() || null });
    setSalvando(false);
    if (error) return setMsg('Não foi possível agendar a visita.');
    onFeito();
  };

  return (
    <Modal title="Agendar visita" onClose={onClose} footer={<>
      <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
      <PrimaryButton onClick={salvar} disabled={salvando}>Agendar</PrimaryButton>
    </>}>
      <Notice type="error">{msg}</Notice>
      <Field label="Interessado" id="ag-lead">
        <select id="ag-lead" className={inputCls} value={leadId} onChange={e => setLeadId(e.target.value)}>
          <option value="">Escolha</option>
          {leads.map(l => <option key={l.id} value={l.id}>{l.responsavel_nome}{l.crianca_nome ? `, ${l.crianca_nome}` : ''}</option>)}
        </select>
      </Field>
      <Field label="Dia e hora" id="ag-quando"><input id="ag-quando" className={inputCls} type="datetime-local" value={quando} onChange={e => setQuando(e.target.value)} /></Field>
      <Field label="Observação" id="ag-obs"><input id="ag-obs" className={inputCls} maxLength={500} value={obs} onChange={e => setObs(e.target.value)} /></Field>
    </Modal>
  );
}

// ───────────────────────── Lista de espera ─────────────────────────
function ListaEspera({ leads, porId, fila, alunos, turmas, schoolId, carregar, setErro, setAviso }) {
  const [adicionando, setAdicionando] = useState(false);
  const grupos = useMemo(() => filaPorTurma(fila), [fila]);

  const marcar = async (w, status) => {
    const { error } = await supabase.from('waitlist').update({ status }).eq('id', w.id).eq('school_id', schoolId);
    if (error) { setAviso(''); return setErro('Não foi possível atualizar a fila.'); }
    setErro(''); carregar();
  };
  const nome = (w) => (w.lead_id ? (porId[w.lead_id]?.responsavel_nome || 'Interessado removido') : (alunos[w.student_id] || 'Aluno'));
  const detalhe = (w) => {
    if (w.lead_id) { const l = porId[w.lead_id]; return l?.crianca_nome ? `Criança: ${l.crianca_nome}` : ''; }
    return 'Aluno já matriculado';
  };

  return (
    <>
      <div className="flex justify-end">
        <PrimaryButton onClick={() => setAdicionando(true)}><Plus size={14} /> Adicionar à fila</PrimaryButton>
      </div>
      {grupos.length === 0 ? <EmptyState icon={Users} text="Ninguém na lista de espera" hint="Adicione um interessado ou um aluno que espera vaga em outra turma." /> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
          {grupos.map(g => (
            <section key={g.turma} className="bg-surface-container-low rounded-zela-lg p-3 space-y-2">
              <h3 className="text-sm font-bold text-on-surface flex justify-between"><span>{g.turma}</span><span className="text-xs text-on-surface-variant">{g.aguardando} aguardando</span></h3>
              {g.itens.map(w => (
                <div key={w.id} className="bg-surface-container-lowest border border-outline-variant rounded-zela-md p-2.5 flex flex-wrap items-center gap-2">
                  <span className="w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">{w.lugar ?? '·'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-on-surface">{nome(w)}</p>
                    <p className="text-[11px] text-on-surface-variant">{rotuloFila(w.status)}{detalhe(w) ? ` · ${detalhe(w)}` : ''}</p>
                  </div>
                  {w.status === 'aguardando' && (
                    <div className="flex gap-1.5">
                      <SecondaryButton onClick={() => marcar(w, 'chamada')}>Chamar</SecondaryButton>
                      <SecondaryButton onClick={() => marcar(w, 'desistiu')}>Desistiu</SecondaryButton>
                    </div>
                  )}
                  {w.status === 'chamada' && (
                    <div className="flex gap-1.5">
                      <SecondaryButton onClick={() => marcar(w, 'matriculada')}>Matriculada</SecondaryButton>
                      <SecondaryButton onClick={() => marcar(w, 'desistiu')}>Desistiu</SecondaryButton>
                    </div>
                  )}
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
      {adicionando && <ModalFila leads={leads.filter(l => leadAberto(l) && !l.anonimizado_em)} turmas={turmas} schoolId={schoolId} onClose={() => setAdicionando(false)} onFeito={() => { setAdicionando(false); setAviso('Adicionado à lista de espera.'); carregar(); }} />}
    </>
  );
}

function ModalFila({ leads, turmas, schoolId, onClose, onFeito }) {
  const [quem, setQuem] = useState('lead');
  const [leadId, setLeadId] = useState('');
  const [alunoId, setAlunoId] = useState('');
  const [alunos, setAlunos] = useState([]);
  const [turma, setTurma] = useState('');
  const [msg, setMsg] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (quem !== 'aluno' || alunos.length) return;
    supabase.from('students').select('id, name, turma').eq('school_id', schoolId).order('name').limit(3000)
      .then(({ data }) => setAlunos(data || []));
  }, [quem, alunos.length, schoolId]);

  const salvar = async () => {
    if (!turma.trim()) return setMsg('Informe a turma.');
    if (quem === 'lead' ? !leadId : !alunoId) return setMsg(quem === 'lead' ? 'Escolha o interessado.' : 'Escolha o aluno.');
    setSalvando(true);
    const { error } = await supabase.from('waitlist').insert({
      school_id: schoolId, turma: turma.trim(), posicao: 1,
      ...(quem === 'lead' ? { lead_id: leadId } : { student_id: alunoId }),
    });
    setSalvando(false);
    if (error) return setMsg(error.code === '23505' ? 'Essa pessoa já está na fila desta turma.' : 'Não foi possível entrar na fila.');
    onFeito();
  };

  return (
    <Modal title="Adicionar à lista de espera" onClose={onClose} footer={<>
      <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
      <PrimaryButton onClick={salvar} disabled={salvando}>Adicionar</PrimaryButton>
    </>}>
      <Notice type="error">{msg}</Notice>
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-1.5"><input type="radio" name="quem" checked={quem === 'lead'} onChange={() => setQuem('lead')} /> Interessado</label>
        <label className="flex items-center gap-1.5"><input type="radio" name="quem" checked={quem === 'aluno'} onChange={() => setQuem('aluno')} /> Aluno atual</label>
      </div>
      {quem === 'lead' ? (
        <Field label="Interessado" id="fl-lead">
          <select id="fl-lead" className={inputCls} value={leadId} onChange={e => setLeadId(e.target.value)}>
            <option value="">Escolha</option>
            {leads.map(l => <option key={l.id} value={l.id}>{l.responsavel_nome}{l.crianca_nome ? `, ${l.crianca_nome}` : ''}</option>)}
          </select>
        </Field>
      ) : (
        <Field label="Aluno" id="fl-aluno">
          <select id="fl-aluno" className={inputCls} value={alunoId} onChange={e => setAlunoId(e.target.value)}>
            <option value="">Escolha</option>
            {alunos.map(a => <option key={a.id} value={a.id}>{a.name}{a.turma ? `, ${a.turma}` : ''}</option>)}
          </select>
        </Field>
      )}
      <Field label="Turma desejada" id="fl-turma">
        <input id="fl-turma" className={inputCls} list="fl-turmas" maxLength={80} value={turma} onChange={e => setTurma(e.target.value)} />
        <datalist id="fl-turmas">{(turmas || []).map(t => <option key={t} value={t} />)}</datalist>
      </Field>
    </Modal>
  );
}

// ───────────────────────── Funil ─────────────────────────
const PERIODOS = [[30, 'Últimos 30 dias'], [90, 'Últimos 90 dias'], [180, 'Últimos 6 meses'], [365, 'Último ano']];

function Funil({ currentUser }) {
  const [dias, setDias] = useState(90);
  const [atualizacao, setAtualizacao] = useState(0);
  const periodo = useMemo(() => {
    const fim = new Date();
    const inicio = new Date(Date.now() - dias * 86400000);
    return { inicio: inicio.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) };
  }, [dias]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <select className={`${inputCls} sm:max-w-[12rem]`} aria-label="Período" value={dias} onChange={e => setDias(Number(e.target.value))}>
          {PERIODOS.map(([d, rotulo]) => <option key={d} value={d}>{rotulo}</option>)}
        </select>
        <SecondaryButton onClick={() => setAtualizacao(n => n + 1)}><RefreshCw size={14} /> Atualizar</SecondaryButton>
      </div>
      <Suspense fallback={<Loading />}>
        <FunilCaptacao periodo={periodo} chaveCache={`${currentUser.id}|${currentUser.school_id}`} atualizacao={atualizacao} />
      </Suspense>
    </>
  );
}
