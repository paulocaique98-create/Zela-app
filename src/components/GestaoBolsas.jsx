import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, FileText, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { chamarFuncaoFinanceira } from '../lib/funcoesFinanceiras';
import { todayISO } from '../lib/gestaoUtils';
import {
  STATUS_PEDIDO, PEDIDO_ABERTO, brl, dataBR, descricaoDoBeneficio, reaisParaCentavos,
  precisaRenovar, vigenteEm, vagasRestantes, diasParaFim,
} from '../lib/bolsas';
import {
  PageShell, Tabs, Modal, Field, inputCls, PrimaryButton, SecondaryButton, ResponsiveTable, EmptyState, Loading, Notice, StatCard,
} from './GestaoShared';

// Gestão de bolsas (item 13 do plano de expansão da Gestão). Só a Gestão (a RLS barra os outros).
// Pedido, decisão e encerramento passam por funções do banco; o desconto na mensalidade é
// recalculado no servidor (apply-scholarship-discount). Renda e documentos são dado sensível.
const CHIP = 'inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap';
const STATUS_CLS = {
  enviada: 'bg-brass text-ink border-brass',
  em_analise: 'bg-primary/10 text-primary border-primary/30',
  aprovada: 'bg-success/10 text-success border-success/30',
  negada: 'bg-error/10 text-error border-error/30',
  cancelada: 'bg-surface-container text-on-surface-variant border-outline-variant',
};

export default function GestaoBolsas({ currentUser }) {
  const schoolId = currentUser.school_id;
  const hoje = todayISO();
  const [aba, setAba] = useState('pedidos');
  const [tipos, setTipos] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [concessoes, setConcessoes] = useState([]);
  const [limite, setLimite] = useState(100);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [editandoTipo, setEditandoTipo] = useState(null);
  const [decidindo, setDecidindo] = useState(null);

  const carregar = useCallback(async () => {
    const [t, p, g, e] = await Promise.all([
      supabase.from('scholarship_types')
        .select('id, nome, descricao, criterios, percentual, valor_cents, vagas, vigencia_inicio, vigencia_fim, cumulativa, ativo')
        .eq('school_id', schoolId).order('nome').limit(200),
      supabase.from('scholarship_applications')
        .select('id, type_id, status, renda_mensal_cents, pessoas_na_casa, justificativa, parecer, decidido_em, created_at, expurgado_em, students(name), scholarship_types(nome), scholarship_documents(id, path, nome)')
        .eq('school_id', schoolId).order('created_at', { ascending: false }).limit(300),
      supabase.from('scholarship_grants')
        .select('id, type_id, student_id, percentual, valor_cents, inicio, fim, encerrada_em, motivo_encerramento, students(name), scholarship_types(nome)')
        .eq('school_id', schoolId).order('created_at', { ascending: false }).limit(500),
      supabase.from('schools').select('scholarship_max_discount_percent').eq('id', schoolId).maybeSingle(),
    ]);
    if (t.error || p.error || g.error) setErro('Não foi possível carregar as bolsas.');
    else setErro('');
    setTipos(t.data || []);
    setPedidos(p.data || []);
    setConcessoes(g.data || []);
    if (e.data) setLimite(Number(e.data.scholarship_max_discount_percent));
    setCarregando(false);
  }, [schoolId]);

  useEffect(() => { carregar(); }, [carregar]);

  const abertos = pedidos.filter(p => PEDIDO_ABERTO.includes(p.status));
  const vigentes = concessoes.filter(g => vigenteEm(g, hoje));
  const aRenovar = vigentes.filter(g => precisaRenovar(g, hoje));

  const tabs = [
    { id: 'pedidos', label: 'Pedidos', badge: abertos.length || undefined },
    { id: 'concedidas', label: 'Concedidas', badge: aRenovar.length || undefined },
    { id: 'tipos', label: 'Tipos' },
    { id: 'vagas', label: 'Vagas' },
  ];

  return (
    <PageShell actions={aba === 'tipos' ? <PrimaryButton onClick={() => setEditandoTipo({})}><Plus size={14} /> Novo tipo</PrimaryButton> : null}>
      <Tabs tabs={tabs} active={aba} onChange={setAba} />
      {aviso && <div className="mb-3"><Notice type="success">{aviso}</Notice></div>}
      {erro && <div className="mb-3"><Notice>{erro}</Notice></div>}
      {carregando ? <Loading /> : (
        <>
          {aba === 'pedidos' && <Pedidos pedidos={pedidos} onDecidir={setDecidindo} />}
          {aba === 'concedidas' && <Concedidas concessoes={concessoes} hoje={hoje} onChanged={(m) => { setAviso(m); carregar(); }} setErro={setErro} />}
          {aba === 'tipos' && <Tipos tipos={tipos} limite={limite} onEditar={setEditandoTipo} onLimite={async (v) => {
            try { await supabase.rpc('bolsas_definir_limite', { p_percent: v }).then(r => { if (r.error) throw r.error; }); setAviso('Limite atualizado.'); carregar(); }
            catch (err) { setErro(err.message || 'Não foi possível salvar o limite.'); }
          }} />}
          {aba === 'vagas' && <Vagas tipos={tipos} concessoes={concessoes} hoje={hoje} />}
        </>
      )}
      {editandoTipo && <TipoModal tipo={editandoTipo} schoolId={schoolId} userId={currentUser.id} onClose={() => setEditandoTipo(null)}
        onSaved={() => { setEditandoTipo(null); setAviso('Tipo de bolsa salvo.'); carregar(); }} />}
      {decidindo && <DecisaoModal pedido={decidindo} tipo={tipos.find(t => t.id === decidindo.type_id)} onClose={() => setDecidindo(null)}
        onDone={(m) => { setDecidindo(null); setAviso(m); carregar(); }} />}
    </PageShell>
  );
}

// ─── Pedidos ──────────────────────────────────────────────────────────────
function Pedidos({ pedidos, onDecidir }) {
  if (pedidos.length === 0) return <EmptyState text="Nenhum pedido de bolsa ainda." hint="Os pedidos chegam pelo Financeiro da família." />;
  return (
    <ResponsiveTable
      rows={pedidos}
      columns={[
        { label: 'Aluno', primary: true, render: p => p.students?.name || '·' },
        { label: 'Bolsa', render: p => p.scholarship_types?.nome || '·' },
        { label: 'Enviado em', render: p => dataBR(p.created_at?.slice(0, 10)) },
        { label: 'Situação', render: p => <span className={`${CHIP} ${STATUS_CLS[p.status]}`}>{STATUS_PEDIDO[p.status]}</span> },
        { label: '', actions: true, render: p => (
          <SecondaryButton onClick={() => onDecidir(p)}>{PEDIDO_ABERTO.includes(p.status) ? 'Analisar' : 'Ver'}</SecondaryButton>
        ) },
      ]}
    />
  );
}

function DecisaoModal({ pedido, tipo, onClose, onDone }) {
  const aberto = PEDIDO_ABERTO.includes(pedido.status);
  const [parecer, setParecer] = useState(pedido.parecer || '');
  const [inicio, setInicio] = useState(todayISO());
  const [fim, setFim] = useState(tipo?.vigencia_fim || '');
  const [salvando, setSalvando] = useState('');
  const [erro, setErro] = useState('');
  const [abrindo, setAbrindo] = useState('');

  const abrirDocumento = async (doc) => {
    setAbrindo(doc.id);
    const { data, error } = await supabase.storage.from('scholarships').createSignedUrl(doc.path, 120);
    setAbrindo('');
    if (error || !data?.signedUrl) { setErro('Não foi possível abrir o documento.'); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  const decidir = async (aprovar) => {
    setErro('');
    setSalvando(aprovar ? 'aprovar' : 'negar');
    try {
      if (pedido.status === 'enviada') {
        const r = await supabase.rpc('bolsas_iniciar_analise', { p_application: pedido.id });
        if (r.error) throw r.error;
      }
      const r = await supabase.rpc('bolsas_decidir_pedido', {
        p_application: pedido.id, p_aprovar: aprovar, p_parecer: parecer.trim(),
        p_inicio: aprovar ? inicio : null, p_fim: aprovar && fim ? fim : null,
      });
      if (r.error) throw r.error;
      let msg = aprovar ? 'Bolsa concedida.' : 'Pedido negado.';
      if (aprovar) {
        const alunoId = (await supabase.from('scholarship_grants').select('student_id').eq('id', r.data).maybeSingle()).data?.student_id;
        if (alunoId) {
          try {
            const ap = await chamarFuncaoFinanceira('apply-scholarship-discount', { student_id: alunoId, dry_run: false });
            msg += ap.aplicado ? ' Desconto aplicado na mensalidade.' : ` ${ap.mensagem || ''}`;
          } catch (err) { msg += ` Desconto não aplicado: ${err.message}`; }
        }
      }
      onDone(msg.trim());
    } catch (err) {
      setErro(err.message || 'Não foi possível concluir.');
      setSalvando('');
    }
  };

  return (
    <Modal title={`Pedido de ${pedido.students?.name || 'aluno'}`} onClose={onClose}
      footer={aberto ? (
        <>
          <SecondaryButton disabled={Boolean(salvando) || parecer.trim().length < 3} onClick={() => decidir(false)}>
            {salvando === 'negar' ? <Loader2 size={14} className="animate-spin" /> : 'Negar'}
          </SecondaryButton>
          <PrimaryButton disabled={Boolean(salvando) || parecer.trim().length < 3} onClick={() => decidir(true)}>
            {salvando === 'aprovar' ? <Loader2 size={14} className="animate-spin" /> : 'Conceder'}
          </PrimaryButton>
        </>
      ) : null}>
      <p className="text-sm text-on-surface-variant">
        {pedido.scholarship_types?.nome}{tipo ? `, ${descricaoDoBeneficio(tipo)}` : ''}. {pedido.pessoas_na_casa} pessoa(s) na casa
        {pedido.renda_mensal_cents !== null ? `, renda declarada ${brl(pedido.renda_mensal_cents)}` : pedido.expurgado_em ? ', renda apagada após o prazo de retenção' : ''}.
      </p>
      <div>
        <p className="text-xs font-semibold text-on-surface-variant mb-1">Justificativa da família</p>
        <p className="text-sm whitespace-pre-wrap">{pedido.justificativa}</p>
      </div>
      <div>
        <p className="text-xs font-semibold text-on-surface-variant mb-1">Documentos</p>
        {(pedido.scholarship_documents || []).length === 0 ? <p className="text-sm text-on-surface-variant">Nenhum documento enviado.</p> : (
          <ul className="space-y-1">
            {pedido.scholarship_documents.map(d => (
              <li key={d.id}>
                <button onClick={() => abrirDocumento(d)} className="text-sm text-primary hover:underline flex items-center gap-1.5">
                  {abrindo === d.id ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} {d.nome}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {aberto ? (
        <>
          <Field label="Parecer" id="bolsa-parecer" hint="Obrigatório. Fica registrado e a família vê.">
            <textarea id="bolsa-parecer" rows={3} maxLength={1500} value={parecer} onChange={e => setParecer(e.target.value)} className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Início da bolsa" id="bolsa-inicio"><input id="bolsa-inicio" type="date" value={inicio} onChange={e => setInicio(e.target.value)} className={inputCls} /></Field>
            <Field label="Fim da bolsa" id="bolsa-fim" hint={tipo?.vigencia_fim ? 'Obrigatório neste tipo.' : 'Vazio: sem data de fim.'}>
              <input id="bolsa-fim" type="date" value={fim} onChange={e => setFim(e.target.value)} className={inputCls} />
            </Field>
          </div>
        </>
      ) : (
        pedido.parecer && <div><p className="text-xs font-semibold text-on-surface-variant mb-1">Parecer</p><p className="text-sm whitespace-pre-wrap">{pedido.parecer}</p></div>
      )}
      <Notice>{erro}</Notice>
    </Modal>
  );
}

// ─── Concedidas ───────────────────────────────────────────────────────────
function Concedidas({ concessoes, hoje, onChanged, setErro }) {
  const [encerrando, setEncerrando] = useState(null);
  const [motivo, setMotivo] = useState('');
  if (concessoes.length === 0) return <EmptyState text="Nenhuma bolsa concedida ainda." />;

  const encerrar = async () => {
    const r = await supabase.rpc('bolsas_encerrar_concessao', { p_grant: encerrando.id, p_motivo: motivo });
    if (r.error) { setErro(r.error.message); return; }
    let msg = 'Bolsa encerrada.';
    try {
      const ap = await chamarFuncaoFinanceira('apply-scholarship-discount', { student_id: encerrando.student_id, dry_run: false });
      if (ap.aplicado) msg += ' Mensalidade recalculada.';
    } catch { /* o recálculo pode ser refeito depois; a bolsa já está encerrada */ }
    setEncerrando(null);
    setMotivo('');
    onChanged(msg);
  };

  return (
    <>
      <ResponsiveTable
        rows={concessoes}
        columns={[
          { label: 'Aluno', primary: true, render: g => g.students?.name || '·' },
          { label: 'Bolsa', render: g => `${g.scholarship_types?.nome || '·'}, ${descricaoDoBeneficio(g)}` },
          { label: 'Período', render: g => `${dataBR(g.inicio)} até ${dataBR(g.fim)}` },
          { label: 'Situação', render: g => {
            if (g.encerrada_em || !vigenteEm(g, hoje)) return <span className={`${CHIP} ${STATUS_CLS.cancelada}`}>Encerrada</span>;
            if (precisaRenovar(g, hoje)) return <span className={`${CHIP} bg-brass text-ink border-brass`}>Termina em {diasParaFim(g.fim, hoje)} dia(s)</span>;
            return <span className={`${CHIP} ${STATUS_CLS.aprovada}`}>Vigente</span>;
          } },
          { label: '', actions: true, render: g => vigenteEm(g, hoje) ? <SecondaryButton onClick={() => setEncerrando(g)}>Encerrar</SecondaryButton> : null },
        ]}
      />
      {encerrando && (
        <Modal title={`Encerrar bolsa de ${encerrando.students?.name || 'aluno'}`} onClose={() => setEncerrando(null)}
          footer={<PrimaryButton onClick={encerrar} disabled={motivo.trim().length < 3}>Encerrar bolsa</PrimaryButton>}>
          <Field label="Motivo" id="bolsa-motivo"><input id="bolsa-motivo" type="text" maxLength={300} value={motivo} onChange={e => setMotivo(e.target.value)} className={inputCls} /></Field>
          <p className="text-xs text-on-surface-variant">O desconto sai das próximas cobranças. As já emitidas ficam como estão.</p>
        </Modal>
      )}
    </>
  );
}

// ─── Tipos ────────────────────────────────────────────────────────────────
function Tipos({ tipos, limite, onEditar, onLimite }) {
  const [valor, setValor] = useState(String(limite));
  useEffect(() => { setValor(String(limite)); }, [limite]);
  return (
    <div className="space-y-4">
      <div className="bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-4 flex flex-wrap items-end gap-3">
        <Field label="Limite de desconto total (%)" id="bolsa-limite" hint="Soma do desconto da família com as bolsas. Padrão 100.">
          <input id="bolsa-limite" type="number" min="1" max="100" value={valor} onChange={e => setValor(e.target.value)} className={`${inputCls} w-32`} />
        </Field>
        <SecondaryButton onClick={() => onLimite(Number(valor))} disabled={!(Number(valor) > 0 && Number(valor) <= 100) || Number(valor) === limite}>Salvar limite</SecondaryButton>
      </div>
      {tipos.length === 0 ? <EmptyState text="Nenhum tipo de bolsa cadastrado." hint="Cadastre os tipos para a família poder pedir." /> : (
        <ResponsiveTable
          rows={tipos}
          columns={[
            { label: 'Nome', primary: true, render: t => t.nome },
            { label: 'Benefício', render: t => descricaoDoBeneficio(t) },
            { label: 'Vagas', render: t => t.vagas ?? 'sem limite' },
            { label: 'Vigência', render: t => (t.vigencia_inicio || t.vigencia_fim) ? `${dataBR(t.vigencia_inicio)} até ${dataBR(t.vigencia_fim)}` : 'sem prazo' },
            { label: 'Situação', render: t => <span className={`${CHIP} ${t.ativo ? STATUS_CLS.aprovada : STATUS_CLS.cancelada}`}>{t.ativo ? 'Ativo' : 'Inativo'}</span> },
            { label: '', actions: true, render: t => <SecondaryButton onClick={() => onEditar(t)}>Editar</SecondaryButton> },
          ]}
        />
      )}
    </div>
  );
}

function TipoModal({ tipo, schoolId, userId, onClose, onSaved }) {
  const novo = !tipo.id;
  const [nome, setNome] = useState(tipo.nome || '');
  const [descricao, setDescricao] = useState(tipo.descricao || '');
  const [criterios, setCriterios] = useState(tipo.criterios || '');
  const [forma, setForma] = useState(tipo.valor_cents ? 'valor' : 'percentual');
  const [percentual, setPercentual] = useState(tipo.percentual ? String(tipo.percentual) : '');
  const [valor, setValor] = useState(tipo.valor_cents ? (tipo.valor_cents / 100).toFixed(2).replace('.', ',') : '');
  const [vagas, setVagas] = useState(tipo.vagas ? String(tipo.vagas) : '');
  const [vigIni, setVigIni] = useState(tipo.vigencia_inicio || '');
  const [vigFim, setVigFim] = useState(tipo.vigencia_fim || '');
  const [cumulativa, setCumulativa] = useState(tipo.cumulativa !== false);
  const [ativo, setAtivo] = useState(tipo.ativo !== false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const pct = Number(String(percentual).replace(',', '.'));
  const cents = reaisParaCentavos(valor);
  const valido = nome.trim() && (forma === 'percentual' ? pct > 0 && pct <= 100 : cents > 0);

  const salvar = async () => {
    setSalvando(true);
    setErro('');
    const corpo = {
      nome: nome.trim(), descricao: descricao.trim() || null, criterios: criterios.trim() || null,
      percentual: forma === 'percentual' ? pct : null, valor_cents: forma === 'valor' ? cents : null,
      vagas: vagas ? Number(vagas) : null, vigencia_inicio: vigIni || null, vigencia_fim: vigFim || null,
      cumulativa, ativo,
    };
    const r = novo
      ? await supabase.from('scholarship_types').insert({ ...corpo, school_id: schoolId, created_by: userId })
      : await supabase.from('scholarship_types').update(corpo).eq('id', tipo.id).eq('school_id', schoolId);
    setSalvando(false);
    if (r.error) { setErro('Não foi possível salvar o tipo de bolsa.'); return; }
    onSaved();
  };

  return (
    <Modal title={novo ? 'Novo tipo de bolsa' : 'Editar tipo de bolsa'} onClose={onClose}
      footer={<PrimaryButton onClick={salvar} disabled={!valido || salvando}>{salvando ? <Loader2 size={14} className="animate-spin" /> : 'Salvar'}</PrimaryButton>}>
      <Field label="Nome" id="tb-nome"><input id="tb-nome" type="text" maxLength={80} value={nome} onChange={e => setNome(e.target.value)} className={inputCls} /></Field>
      <Field label="Descrição" id="tb-desc"><input id="tb-desc" type="text" maxLength={500} value={descricao} onChange={e => setDescricao(e.target.value)} className={inputCls} /></Field>
      <Field label="Critérios" id="tb-crit" hint="A família lê antes de pedir."><textarea id="tb-crit" rows={2} maxLength={1000} value={criterios} onChange={e => setCriterios(e.target.value)} className={inputCls} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Forma do desconto" id="tb-forma">
          <select id="tb-forma" value={forma} onChange={e => setForma(e.target.value)} className={inputCls}>
            <option value="percentual">Percentual da mensalidade</option>
            <option value="valor">Valor fixo por mês</option>
          </select>
        </Field>
        {forma === 'percentual'
          ? <Field label="Percentual" id="tb-pct"><input id="tb-pct" type="number" min="1" max="100" step="0.5" value={percentual} onChange={e => setPercentual(e.target.value)} className={inputCls} /></Field>
          : <Field label="Valor por mês (R$)" id="tb-val"><input id="tb-val" type="text" inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} className={inputCls} /></Field>}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Vagas" id="tb-vagas" hint="Vazio: sem limite."><input id="tb-vagas" type="number" min="1" value={vagas} onChange={e => setVagas(e.target.value)} className={inputCls} /></Field>
        <Field label="Vigência de" id="tb-vi"><input id="tb-vi" type="date" value={vigIni} onChange={e => setVigIni(e.target.value)} className={inputCls} /></Field>
        <Field label="Vigência até" id="tb-vf"><input id="tb-vf" type="date" value={vigFim} onChange={e => setVigFim(e.target.value)} className={inputCls} /></Field>
      </div>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={cumulativa} onChange={e => setCumulativa(e.target.checked)} className="mt-1" />
        <span>Soma com o desconto da família. Desmarcado: vale o maior entre os dois.</span></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} /> Aceita novos pedidos</label>
      <Notice>{erro}</Notice>
    </Modal>
  );
}

// ─── Vagas ────────────────────────────────────────────────────────────────
function Vagas({ tipos, concessoes, hoje }) {
  const cards = useMemo(() => tipos.map(t => ({
    t, usadas: concessoes.filter(g => g.type_id === t.id && vigenteEm(g, hoje)).length, restantes: vagasRestantes(t, concessoes, hoje),
  })), [tipos, concessoes, hoje]);
  if (cards.length === 0) return <EmptyState text="Cadastre um tipo de bolsa para acompanhar as vagas." />;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {cards.map(({ t, usadas, restantes }) => (
        <StatCard key={t.id} label={t.nome} value={t.vagas ? `${usadas} de ${t.vagas}` : `${usadas} ativas`}
          hint={restantes === null ? 'Sem limite de vagas' : restantes === 0 ? 'Sem vagas livres' : `${restantes} vaga(s) livre(s)`} />
      ))}
    </div>
  );
}
