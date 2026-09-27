import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, FileSignature, Edit, Send, Printer, XCircle, FilePlus2, ShieldCheck, Eye } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { notifyFamilies } from '../lib/notifyFamilies';
import { printContract } from '../lib/printContract';
import { centsToBRL, formatDateBR, fillTemplate } from '../lib/gestaoUtils';
import { PageShell, Loading, EmptyState, Notice, Modal, Field, inputCls, PrimaryButton, SecondaryButton } from './GestaoShared';

export const CONTRACT_STATUS = { rascunho: 'Rascunho', enviado: 'Aguardando assinatura', assinado: 'Assinado', cancelado: 'Cancelado' };
const STATUS_CLS = {
  rascunho: 'bg-slate-100 text-slate-600 border-slate-200',
  enviado: 'bg-amber-50 text-amber-700 border-amber-200',
  assinado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelado: 'bg-red-50 text-red-600 border-red-200',
};

// Campos que o modelo pode usar entre chaves duplas.
export const TEMPLATE_FIELDS = [
  ['escola_nome', 'Nome da escola'], ['escola_cnpj', 'CNPJ da escola'], ['escola_endereco', 'Endereço da escola'],
  ['escola_cidade', 'Cidade da escola'], ['diretor_nome', 'Nome da direção'],
  ['aluno_nome', 'Nome do aluno'], ['aluno_nascimento', 'Nascimento do aluno'], ['aluno_turma', 'Turma'],
  ['aluno_turno', 'Turno'], ['aluno_periodo', 'Período'],
  ['responsavel_nome', 'Nome do responsável'], ['responsavel_documento', 'CPF ou documento do responsável'],
  ['responsavel_endereco', 'Endereço do responsável'], ['responsavel_telefone', 'Telefone do responsável'],
  ['responsavel_email', 'E-mail do responsável'],
  ['valor_mensal', 'Mensalidade'], ['primeiro_vencimento', 'Primeiro vencimento'],
  ['ano_letivo', 'Ano letivo'], ['data_hoje', 'Data de hoje'],
];

const DEFAULT_TEMPLATE = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS EDUCACIONAIS

CONTRATADA: {{escola_nome}}, CNPJ {{escola_cnpj}}, com sede em {{escola_endereco}}, {{escola_cidade}}.

CONTRATANTE: {{responsavel_nome}}, documento {{responsavel_documento}}, residente em {{responsavel_endereco}}, telefone {{responsavel_telefone}}, e-mail {{responsavel_email}}.

ALUNO(A): {{aluno_nome}}, nascido(a) em {{aluno_nascimento}}, matriculado(a) na turma {{aluno_turma}}, turno {{aluno_turno}}, para o ano letivo de {{ano_letivo}}.

CLÁUSULA 1 · DO OBJETO
A CONTRATADA prestará ao ALUNO os serviços educacionais correspondentes à turma e ao turno acima, conforme o calendário escolar e a proposta pedagógica da escola.

CLÁUSULA 2 · DO VALOR E DO PAGAMENTO
Pelos serviços, o CONTRATANTE pagará a mensalidade de {{valor_mensal}}, com primeiro vencimento em {{primeiro_vencimento}}, pelos meios de pagamento disponibilizados pela escola.

CLÁUSULA 3 · DO ATRASO
O atraso no pagamento sujeita o CONTRATANTE a multa e juros conforme a configuração de cobrança da escola, nos limites da lei.

CLÁUSULA 4 · DA RESCISÃO
Este contrato pode ser rescindido por qualquer das partes mediante aviso prévio por escrito, respeitadas as parcelas vencidas.

CLÁUSULA 5 · DA ASSINATURA
As partes reconhecem a validade da assinatura eletrônica realizada pelo aplicativo Zela, nos termos da Lei 14.063/2020.

{{escola_cidade}}, {{data_hoje}}.`;

// Contratos (documento jurídico). A cobrança recorrente continua em
// Financeiro · Mensalidades; aqui fica o texto que o responsável assina.
// view: 'lista' | 'modelos' | 'assinaturas' | 'aditivos'
export default function GestaoContratos({ currentUser, currentSchool, view = 'lista' }) {
  if (view === 'modelos') return <Modelos currentUser={currentUser} />;
  return <Documentos currentUser={currentUser} currentSchool={currentSchool} view={view} />;
}

// ─── Modelos ──────────────────────────────────────────────────────────────
function Modelos({ currentUser }) {
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from('contract_templates').select('*').eq('school_id', currentUser.school_id).order('name');
    if (e) { setError('Não foi possível carregar os modelos.'); setRows([]); return; }
    setRows(data || []);
  }, [currentUser.school_id]);
  useEffect(() => { load(); }, [load]);

  return (
    <PageShell
      description="Textos base dos contratos e aditivos. Os campos entre chaves são preenchidos com os dados do aluno."
      actions={<PrimaryButton onClick={() => setEditing({ name: '', kind: 'contrato', body: rows?.length ? '' : DEFAULT_TEMPLATE, active: true })}><Plus size={16} /> Novo modelo</PrimaryButton>}
    >
      <Notice>{error}</Notice>
      {rows === null ? <Loading /> : rows.length === 0 ? (
        <EmptyState icon={FileSignature} text="Nenhum modelo cadastrado." hint="Clique em Novo modelo: o primeiro já vem com um texto base de contrato de prestação de serviços educacionais para você revisar." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map(t => (
            <div key={t.id} className={`bg-surface-container-lowest border border-outline-variant rounded-zela-lg p-4 flex justify-between gap-2 ${t.active ? '' : 'opacity-60'}`}>
              <div className="min-w-0">
                <p className="font-bold text-sm text-on-surface truncate">{t.name}</p>
                <p className="text-xs text-on-surface-variant">{t.kind === 'aditivo' ? 'Aditivo' : 'Contrato'}{t.active ? '' : ' · inativo'}</p>
                <p className="text-xs text-on-surface-variant/70 mt-1 line-clamp-2">{t.body.slice(0, 160)}</p>
              </div>
              <button onClick={() => setEditing(t)} className="p-1.5 text-on-surface-variant hover:text-primary hover:bg-primary/10 rounded-zela-md shrink-0 self-start" aria-label="Editar modelo"><Edit size={15} /></button>
            </div>
          ))}
        </div>
      )}
      {editing && <ModeloModal currentUser={currentUser} initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </PageShell>
  );
}

function ModeloModal({ currentUser, initial, onClose, onSaved }) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const save = async () => {
    if (!form.name.trim() || !form.body.trim()) { setError('Informe o nome e o texto do modelo.'); return; }
    setIsSaving(true);
    const payload = { name: form.name.trim(), kind: form.kind, body: form.body, active: form.active !== false, updated_at: new Date().toISOString() };
    const { error: e } = form.id
      ? await supabase.from('contract_templates').update(payload).eq('id', form.id)
      : await supabase.from('contract_templates').insert({ ...payload, school_id: currentUser.school_id, created_by: currentUser.id });
    setIsSaving(false);
    if (e) { setError(e.message); return; }
    onSaved();
  };

  const insertField = (key) => setForm(f => ({ ...f, body: `${f.body}{{${key}}}` }));

  return (
    <Modal wide title={form.id ? 'Editar modelo' : 'Novo modelo'} onClose={onClose}
      footer={<><SecondaryButton onClick={onClose}>Cancelar</SecondaryButton><PrimaryButton onClick={save} disabled={isSaving}>Salvar</PrimaryButton></>}>
      <Notice>{error}</Notice>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2"><Field label="Nome do modelo" id="tpl-name"><input id="tpl-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} /></Field></div>
        <Field label="Tipo" id="tpl-kind">
          <select id="tpl-kind" value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value }))} className={inputCls}>
            <option value="contrato">Contrato</option><option value="aditivo">Aditivo</option>
          </select>
        </Field>
      </div>
      <Field label="Texto" id="tpl-body"><textarea id="tpl-body" rows={14} value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} className={`${inputCls} font-mono text-xs`} /></Field>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant mb-1">Campos disponíveis (clique para inserir no fim do texto)</p>
        <div className="flex flex-wrap gap-1">
          {TEMPLATE_FIELDS.map(([key, label]) => (
            <button key={key} type="button" onClick={() => insertField(key)} title={label} className="px-2 py-0.5 text-[11px] font-mono bg-surface-container-low border border-outline-variant rounded-full hover:border-primary hover:text-primary">{`{{${key}}}`}</button>
          ))}
        </div>
      </div>
      {form.id && (
        <label className="flex items-center gap-2 text-sm"><input id="tpl-active" type="checkbox" checked={form.active !== false} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} /> Modelo ativo</label>
      )}
    </Modal>
  );
}

// ─── Contratos, assinaturas e aditivos ────────────────────────────────────
function Documentos({ currentUser, currentSchool, view }) {
  const [rows, setRows] = useState(null);
  const [statusFilter, setStatusFilter] = useState(view === 'assinaturas' ? 'enviado' : '');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    let q = supabase.from('contract_documents')
      .select('*, students:student_id(name, family_id, turma)')
      .eq('school_id', currentUser.school_id).order('created_at', { ascending: false });
    if (view === 'aditivos') q = q.eq('kind', 'aditivo');
    if (view === 'lista') q = q.eq('kind', 'contrato');
    if (view === 'assinaturas') q = q.in('status', ['enviado', 'assinado']);
    const { data, error: e } = await q;
    if (e) { setError('Não foi possível carregar os contratos.'); setRows([]); return; }
    setRows(data || []);
  }, [currentUser.school_id, view]);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => (rows || [])
    .filter(r => !statusFilter || r.status === statusFilter)
    .filter(r => !search || `${r.title} ${r.students?.name || ''}`.toLowerCase().includes(search.toLowerCase())), [rows, statusFilter, search]);

  const send = async (doc) => {
    setError(''); setSuccess('');
    const { error: e } = await supabase.from('contract_documents').update({ status: 'enviado', sent_at: new Date().toISOString() }).eq('id', doc.id);
    if (e) { setError(e.message); return; }
    const { data: guardians } = await supabase.from('student_guardians').select('guardian_id').eq('student_id', doc.student_id);
    const familyIds = [doc.students?.family_id, ...(guardians || []).map(g => g.guardian_id)].filter(Boolean);
    if (familyIds.length) {
      notifyFamilies({
        type: 'contrato', title: doc.kind === 'aditivo' ? 'Aditivo de contrato para assinar' : 'Contrato para assinar',
        message: `${doc.title} · ${doc.students?.name || ''}. Leia e assine pelo app.`, url: '/?tab=contratos', familyIds,
      });
    }
    setSuccess('Enviado para a família assinar pelo app.');
    setViewing(null);
    load();
  };

  const cancel = async (doc) => {
    if (!window.confirm(`Cancelar "${doc.title}"? O documento fica no histórico como cancelado.`)) return;
    const { error: e } = await supabase.from('contract_documents').update({ status: 'cancelado' }).eq('id', doc.id);
    if (e) { setError(e.message); return; }
    setViewing(null);
    load();
  };

  const descriptions = {
    lista: 'Contratos gerados para cada aluno a partir de um modelo, enviados para assinatura pelo app da família.',
    assinaturas: 'Acompanhe quem já assinou e quem ainda não assinou.',
    aditivos: 'Alterações de um contrato já assinado (troca de turno, valor, etc.).',
  };

  return (
    <PageShell
      description={descriptions[view]}
      actions={view !== 'assinaturas' && (
        <PrimaryButton onClick={() => setCreating({ kind: view === 'aditivos' ? 'aditivo' : 'contrato' })}>
          <Plus size={16} /> {view === 'aditivos' ? 'Novo aditivo' : 'Gerar contrato'}
        </PrimaryButton>
      )}
    >
      <div className="space-y-3">
        <Notice>{error}</Notice>
        <Notice type="success">{success}</Notice>
        <div className="flex flex-wrap gap-2">
          <input id="contract-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por aluno ou título" className={`${inputCls} max-w-xs`} />
          <select id="contract-status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="p-2 bg-white border border-outline-variant rounded-zela-md text-sm" aria-label="Situação">
            <option value="">Todas as situações</option>
            {Object.entries(CONTRACT_STATUS).filter(([k]) => view !== 'assinaturas' || ['enviado', 'assinado'].includes(k)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {rows === null ? <Loading /> : filtered.length === 0 ? <EmptyState icon={FileSignature} text="Nenhum documento encontrado." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs font-bold text-on-surface-variant uppercase border-b border-outline-variant">
                <th className="py-2 pr-3">Aluno</th><th className="py-2 pr-3">Documento</th><th className="py-2 pr-3">Situação</th>
                <th className="py-2 pr-3">{view === 'assinaturas' ? 'Enviado em' : 'Criado em'}</th>
                {view === 'assinaturas' && <th className="py-2 pr-3">Assinatura</th>}
                <th className="py-2" />
              </tr></thead>
              <tbody>
                {filtered.map(d => (
                  <tr key={d.id} className="border-b border-outline-variant/50">
                    <td className="py-2 pr-3 font-medium text-on-surface">{d.students?.name || '·'}</td>
                    <td className="py-2 pr-3">{d.title}</td>
                    <td className="py-2 pr-3"><span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${STATUS_CLS[d.status]}`}>{CONTRACT_STATUS[d.status]}</span></td>
                    <td className="py-2 pr-3 whitespace-nowrap">{formatDateBR(view === 'assinaturas' ? d.sent_at : d.created_at)}</td>
                    {view === 'assinaturas' && <td className="py-2 pr-3 text-xs">{d.signed_at ? `${d.signer_name} · ${new Date(d.signed_at).toLocaleString('pt-BR')}` : '·'}</td>}
                    <td className="py-2 text-right whitespace-nowrap">
                      <button onClick={() => setViewing(d)} className="p-1.5 text-on-surface-variant hover:text-primary hover:bg-primary/10 rounded-zela-md" aria-label="Abrir"><Eye size={15} /></button>
                      <button onClick={() => printContract(d, currentSchool?.name)} className="p-1.5 text-on-surface-variant hover:text-primary hover:bg-primary/10 rounded-zela-md" aria-label="Imprimir"><Printer size={15} /></button>
                      {d.status === 'assinado' && d.kind === 'contrato' && (
                        <button onClick={() => setCreating({ kind: 'aditivo', parent: d })} className="p-1.5 text-on-surface-variant hover:text-primary hover:bg-primary/10 rounded-zela-md" aria-label="Criar aditivo"><FilePlus2 size={15} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {creating && (
        <GerarModal currentUser={currentUser} currentSchool={currentSchool} kind={creating.kind} parent={creating.parent}
          onClose={() => setCreating(null)} onSaved={() => { setCreating(null); setSuccess('Documento salvo como rascunho. Revise e envie para a família.'); load(); }} />
      )}
      {viewing && (
        <DocumentoModal doc={viewing} onClose={() => setViewing(null)} onSend={() => send(viewing)} onCancel={() => cancel(viewing)}
          onPrint={() => printContract(viewing, currentSchool?.name)} onSaved={() => { setViewing(null); load(); }} />
      )}
    </PageShell>
  );
}

// Monta os valores dos campos {{...}} a partir do aluno escolhido.
async function buildTemplateValues(student, school) {
  const [{ data: fc }, { data: year }] = await Promise.all([
    supabase.from('financial_contracts').select('id, amount_cents, first_due_date, financial_guardian_id')
      .eq('student_id', student.id).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('school_years').select('id, name').eq('school_id', student.school_id).eq('status', 'aberto').maybeSingle(),
  ]);
  const guardianId = fc?.financial_guardian_id || student.family_id;
  const { data: g } = guardianId
    ? await supabase.from('users').select('name, doc_type, doc_number, phone, email, street, number, complement, neighborhood, city, state').eq('id', guardianId).maybeSingle()
    : { data: null };
  const address = g ? [[g.street, g.number].filter(Boolean).join(', '), g.complement, g.neighborhood, [g.city, g.state].filter(Boolean).join('/')].filter(Boolean).join(' · ') : '';
  return {
    financialContractId: fc?.id || null,
    schoolYearId: year?.id || null,
    values: {
      escola_nome: school?.name, escola_cnpj: school?.cnpj, escola_endereco: school?.address, escola_cidade: school?.city,
      diretor_nome: school?.director_name,
      aluno_nome: student.name, aluno_nascimento: student.birth_date ? formatDateBR(student.birth_date) : '',
      aluno_turma: student.turma, aluno_turno: student.turno, aluno_periodo: student.periodo,
      responsavel_nome: g?.name, responsavel_documento: g?.doc_number ? `${g.doc_type ? `${g.doc_type.toUpperCase()} ` : ''}${g.doc_number}` : '',
      responsavel_endereco: address, responsavel_telefone: g?.phone, responsavel_email: g?.email,
      valor_mensal: fc?.amount_cents ? centsToBRL(fc.amount_cents) : '', primeiro_vencimento: fc?.first_due_date ? formatDateBR(fc.first_due_date) : '',
      ano_letivo: year?.name || String(new Date().getFullYear()),
      data_hoje: new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }),
    },
  };
}

function GerarModal({ currentUser, currentSchool, kind, parent, onClose, onSaved }) {
  const [students, setStudents] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [signedContracts, setSignedContracts] = useState([]);
  const [studentId, setStudentId] = useState(parent?.student_id || '');
  const [parentId, setParentId] = useState(parent?.id || '');
  const [templateId, setTemplateId] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [meta, setMeta] = useState({ financialContractId: null, schoolYearId: null });
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    supabase.from('students').select('id, name, family_id, turma, turno, periodo, birth_date, school_id').eq('school_id', currentUser.school_id).order('name').then(({ data }) => setStudents(data || []));
    supabase.from('contract_templates').select('*').eq('school_id', currentUser.school_id).eq('kind', kind).eq('active', true).order('name').then(({ data }) => setTemplates(data || []));
    if (kind === 'aditivo') {
      supabase.from('contract_documents').select('id, title, student_id, students:student_id(name)').eq('school_id', currentUser.school_id).eq('kind', 'contrato').eq('status', 'assinado').order('created_at', { ascending: false }).then(({ data }) => setSignedContracts(data || []));
    }
  }, [currentUser.school_id, kind]);

  // Aditivo: o aluno vem do contrato de origem.
  useEffect(() => {
    if (kind !== 'aditivo' || !parentId) return;
    const p = signedContracts.find(c => c.id === parentId);
    if (p) setStudentId(p.student_id);
  }, [kind, parentId, signedContracts]);

  useEffect(() => {
    const student = students.find(s => s.id === studentId);
    const template = templates.find(t => t.id === templateId);
    if (!student || !template) return;
    let active = true;
    (async () => {
      const built = await buildTemplateValues(student, currentSchool);
      if (!active) return;
      setMeta({ financialContractId: built.financialContractId, schoolYearId: built.schoolYearId });
      setBody(fillTemplate(template.body, built.values));
      setTitle(`${template.name} · ${student.name}`);
    })();
    return () => { active = false; };
  }, [studentId, templateId, students, templates, currentSchool]);

  const missing = useMemo(() => Array.from(new Set((body.match(/\{\{\s*[a-z_]+\s*\}\}/g) || []))), [body]);

  const save = async () => {
    if (!studentId || !title.trim() || !body.trim()) { setError('Escolha o aluno e o modelo.'); return; }
    if (kind === 'aditivo' && !parentId) { setError('Escolha o contrato assinado que este aditivo altera.'); return; }
    setIsSaving(true);
    const { error: e } = await supabase.from('contract_documents').insert({
      school_id: currentUser.school_id, student_id: studentId, template_id: templateId || null, kind,
      parent_id: kind === 'aditivo' ? parentId : null, school_year_id: meta.schoolYearId,
      financial_contract_id: meta.financialContractId, title: title.trim(), body, created_by: currentUser.id,
    });
    setIsSaving(false);
    if (e) { setError(e.message); return; }
    onSaved();
  };

  return (
    <Modal wide title={kind === 'aditivo' ? 'Novo aditivo' : 'Gerar contrato'} onClose={onClose}
      footer={<><SecondaryButton onClick={onClose}>Cancelar</SecondaryButton><PrimaryButton onClick={save} disabled={isSaving}>Salvar rascunho</PrimaryButton></>}>
      <Notice>{error}</Notice>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {kind === 'aditivo' ? (
          <Field label="Contrato assinado de origem" id="doc-parent">
            <select id="doc-parent" value={parentId} onChange={e => setParentId(e.target.value)} className={inputCls} disabled={Boolean(parent)}>
              <option value="">Selecionar</option>
              {(parent ? [{ id: parent.id, title: parent.title, students: parent.students }] : signedContracts).map(c => <option key={c.id} value={c.id}>{c.students?.name} · {c.title}</option>)}
            </select>
          </Field>
        ) : (
          <Field label="Aluno" id="doc-student">
            <select id="doc-student" value={studentId} onChange={e => setStudentId(e.target.value)} className={inputCls}>
              <option value="">Selecionar</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.name}{s.turma ? ` · ${s.turma}` : ''}</option>)}
            </select>
          </Field>
        )}
        <Field label="Modelo" id="doc-template" hint={templates.length === 0 ? `Nenhum modelo de ${kind} ativo. Cadastre em Contratos · Modelos.` : ''}>
          <select id="doc-template" value={templateId} onChange={e => setTemplateId(e.target.value)} className={inputCls}>
            <option value="">Selecionar</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
      </div>
      {body && (
        <>
          <Field label="Título" id="doc-title"><input id="doc-title" value={title} onChange={e => setTitle(e.target.value)} className={inputCls} /></Field>
          {missing.length > 0 && (
            <Notice>Campos sem dado no cadastro: {missing.join(', ')}. Complete o cadastro ou edite o texto abaixo antes de enviar.</Notice>
          )}
          <Field label="Texto (pode ajustar antes de enviar)" id="doc-body"><textarea id="doc-body" rows={14} value={body} onChange={e => setBody(e.target.value)} className={`${inputCls} text-xs`} /></Field>
        </>
      )}
    </Modal>
  );
}

function DocumentoModal({ doc, onClose, onSend, onCancel, onPrint, onSaved }) {
  const [body, setBody] = useState(doc.body);
  const [title, setTitle] = useState(doc.title);
  const [error, setError] = useState('');
  const isDraft = doc.status === 'rascunho';
  const pendingFields = (body.match(/\{\{\s*[a-z_]+\s*\}\}/g) || []);

  const saveDraft = async () => {
    const { error: e } = await supabase.from('contract_documents').update({ body, title }).eq('id', doc.id);
    if (e) { setError(e.message); return; }
    onSaved();
  };

  return (
    <Modal wide title={doc.title} onClose={onClose}
      footer={<>
        <SecondaryButton onClick={onPrint}><Printer size={15} /> Imprimir</SecondaryButton>
        {['rascunho', 'enviado'].includes(doc.status) && <SecondaryButton onClick={onCancel}><XCircle size={15} /> Cancelar documento</SecondaryButton>}
        {isDraft && <SecondaryButton onClick={saveDraft}>Salvar alterações</SecondaryButton>}
        {isDraft && <PrimaryButton onClick={onSend} disabled={pendingFields.length > 0 || body !== doc.body || title !== doc.title}><Send size={15} /> Enviar para assinatura</PrimaryButton>}
      </>}>
      <Notice>{error}</Notice>
      <p className="text-xs text-on-surface-variant">
        {doc.students?.name} · <span className="font-bold">{CONTRACT_STATUS[doc.status]}</span>
        {doc.sent_at ? ` · enviado em ${new Date(doc.sent_at).toLocaleString('pt-BR')}` : ''}
      </p>
      {isDraft && pendingFields.length > 0 && <Notice>Preencha os campos pendentes antes de enviar: {Array.from(new Set(pendingFields)).join(', ')}.</Notice>}
      {isDraft && (body !== doc.body || title !== doc.title) && <p className="text-xs text-amber-700 font-bold">Salve as alterações antes de enviar.</p>}
      {isDraft ? (
        <>
          <Field label="Título" id="doc-edit-title"><input id="doc-edit-title" value={title} onChange={e => setTitle(e.target.value)} className={inputCls} /></Field>
          <Field label="Texto" id="doc-edit-body"><textarea id="doc-edit-body" rows={16} value={body} onChange={e => setBody(e.target.value)} className={`${inputCls} text-xs`} /></Field>
        </>
      ) : (
        <div className="whitespace-pre-wrap text-sm text-on-surface bg-surface-container-lowest border border-outline-variant rounded-zela-md p-4 max-h-[50vh] overflow-y-auto">{doc.body}</div>
      )}
      {doc.status === 'assinado' && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-zela-md text-xs text-emerald-800 space-y-0.5">
          <p className="font-bold flex items-center gap-1"><ShieldCheck size={14} /> Assinatura eletrônica</p>
          <p>Assinado por {doc.signer_name} em {new Date(doc.signed_at).toLocaleString('pt-BR')}.</p>
          {doc.signature_meta?.ip && <p>Endereço IP: {doc.signature_meta.ip}</p>}
          <p className="break-all">Impressão digital do texto: {doc.content_hash}</p>
        </div>
      )}
    </Modal>
  );
}
