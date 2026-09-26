import React, { useState, useEffect } from 'react';
import { ArrowLeft, Loader2, User, Users, ShieldCheck, FileText, Wallet, FolderOpen, History, Pencil, Check, X, LogOut, Upload, Download, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSchoolConfig } from '../lib/schoolConfig';
import { uploadFile, removeFile, getSignedUrl, buildSafeFileName } from '../lib/storage';
import { logAction } from '../lib/auditLog';

const TABS = [
  { key: 'pessoais', label: 'Dados Pessoais', icon: User },
  { key: 'responsaveis', label: 'Responsáveis', icon: Users },
  { key: 'autorizados', label: 'Autorizados', icon: ShieldCheck },
  { key: 'matricula', label: 'Matrícula', icon: FileText },
  { key: 'financeiro', label: 'Financeiro', icon: Wallet },
  { key: 'documentos', label: 'Documentos', icon: FolderOpen },
  { key: 'historico', label: 'Histórico', icon: History },
];

const ENROLLMENT_STATUS_LABELS = { ativo: 'Ativo', inativo: 'Inativo', transferido: 'Transferido', cancelado: 'Cancelado' };

const DOCUMENT_CATEGORIES = [
  { key: 'rg', label: 'RG' },
  { key: 'certidao_nascimento', label: 'Certidão de Nascimento' },
  { key: 'comprovante_residencia', label: 'Comprovante de Residência' },
  { key: 'cartao_vacina', label: 'Cartão de Vacina' },
  { key: 'plano_saude', label: 'Plano de Saúde / SUS' },
  { key: 'contrato', label: 'Contrato' },
  { key: 'ficha_medica', label: 'Ficha Médica' },
  { key: 'outro', label: 'Outro' },
];
const DOCUMENT_CATEGORY_LABELS = Object.fromEntries(DOCUMENT_CATEGORIES.map(c => [c.key, c.label]));
const DOCUMENTS_BUCKET = 'student-documents';
const HISTORICO_ACTION_LABELS = {
  update_student_profile: 'Editou o cadastro',
  transfer_student_external: 'Transferiu para outra escola',
  upload_student_document: 'Enviou um documento',
  delete_student_document: 'Excluiu um documento',
};
const DOC_ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
const DOC_MAX_FILE_SIZE = 15 * 1024 * 1024;

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('pt-BR');
}

function formatCurrency(cents) {
  if (cents === null || cents === undefined) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

const CHARGE_STATUS_LABELS = { PENDING: 'Pendente', PAID: 'Pago', OVERDUE: 'Em atraso', CANCELLED: 'Cancelado' };

// Secretaria > perfil do aluno -- primeira tela do Zela a consolidar num
// lugar só o que hoje está espalhado em ~9 componentes diferentes (ver
// auditoria da Fase 1). Edição de cadastro (dados pessoais/matrícula) fica
// aqui na Gestão -- mesmo padrão já usado em Financeiro/Correções de
// Presença (Gestão escreve, Admin/Recepção só lê); por enquanto o Admin
// ainda consegue editar em paralelo (AdminUserRegistration.jsx), até
// validar e cortar numa fase futura -- ver comentário na migration
// 20260927b_secretaria_gestao_escreve_alunos.sql.
export default function GestaoAlunoPerfil({ currentUser, studentId, onBack }) {
  const { turmas: schoolTurmas } = useSchoolConfig(currentUser?.school_id);
  const [activeTab, setActiveTab] = useState('pessoais');
  const [isLoading, setIsLoading] = useState(true);
  const [student, setStudent] = useState(null);
  const [guardians, setGuardians] = useState([]);
  const [authorized, setAuthorized] = useState([]);
  const [fichaMedica, setFichaMedica] = useState(null);
  const [contract, setContract] = useState(null);
  const [nextCharge, setNextCharge] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [historico, setHistorico] = useState([]);
  const [error, setError] = useState('');

  const [uploadingCategory, setUploadingCategory] = useState(null);
  const [docsError, setDocsError] = useState('');
  const [deletingDocId, setDeletingDocId] = useState(null);

  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [isTransferring, setIsTransferring] = useState(false);
  const [transferSchoolName, setTransferSchoolName] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [isSavingTransfer, setIsSavingTransfer] = useState(false);
  const [transferError, setTransferError] = useState('');

  const fetchAll = async () => {
    setIsLoading(true);
    setError('');
    try {
      const { data: studentData, error: studentError } = await supabase
        .from('students')
        .select('id, name, birth_date, cidade_nascimento, turma, turno, periodo, contracted_hours, contracted_entry_time, contracted_exit_time, enrollment_status, family_id, autorizacao_imagem, autorizacao_emergencia_medica, users:family_id(name, email, phone, doc_type, doc_number, street, number, complement, neighborhood, city, state, zip_code)')
        .eq('id', studentId)
        .single();
      if (studentError) throw studentError;
      setStudent(studentData);

      const [{ data: guardiansData }, { data: authorizedData }, { data: fichaData }, { data: contractData }, { data: documentsData }, { data: auditData }, { data: transfersData }] = await Promise.all([
        supabase.from('student_guardians').select('id, is_primary, is_financial, relationship, guardian_id, users:guardian_id(name, phone, email)').eq('student_id', studentId),
        supabase.from('authorized_persons').select('id, name, relation, status, has_photo').eq('family_id', studentData.family_id),
        supabase.from('fichas_medicas').select('*').eq('student_id', studentId).maybeSingle(),
        supabase.from('financial_contracts').select('id, status, billing_cycle, amount_cents, first_due_date').eq('student_id', studentId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('student_documents').select('id, category, file_name, storage_path, notes, uploaded_at').eq('student_id', studentId).order('uploaded_at', { ascending: false }),
        supabase.from('audit_logs').select('id, action, details, actor_id, created_at, users:actor_id(name)').eq('entity_type', 'student').eq('entity_id', studentId).order('created_at', { ascending: false }),
        supabase.from('student_transfers').select('id, transfer_type, from_class_name, to_class_name, destination_school_name, reason, transferred_at, users:transferred_by(name)').eq('student_id', studentId).order('transferred_at', { ascending: false }),
      ]);
      setGuardians(guardiansData || []);
      setAuthorized(authorizedData || []);
      setFichaMedica(fichaData || null);
      setContract(contractData || null);
      setDocuments(documentsData || []);

      // Histórico consolidado (Fase 8): audit_logs cobre edições/documentos/
      // decisões de matrícula; student_transfers cobre turma/saída externa
      // (tabela própria, não passa por logAction) -- junta os dois numa
      // única linha do tempo, mais recente primeiro.
      const auditEvents = (auditData || []).map(a => ({
        id: `audit-${a.id}`,
        when: a.created_at,
        actorName: a.users?.name || 'Usuário',
        label: HISTORICO_ACTION_LABELS[a.action] || a.action,
        detail: a.details?.reason || a.details?.category || a.details?.destination_school_name || '',
      }));
      const transferEvents = (transfersData || []).map(t => ({
        id: `transfer-${t.id}`,
        when: t.transferred_at,
        actorName: t.users?.name || 'Usuário',
        label: t.transfer_type === 'saida_externa' ? `Transferiu para ${t.destination_school_name}` : `Mudou de turma: ${t.from_class_name || '—'} → ${t.to_class_name}`,
        detail: t.reason || '',
      }));
      setHistorico([...auditEvents, ...transferEvents].sort((a, b) => new Date(b.when) - new Date(a.when)));

      if (contractData) {
        const { data: chargeData } = await supabase
          .from('financial_charges')
          .select('id, status, due_date, amount_cents')
          .eq('contract_id', contractData.id)
          .order('due_date', { ascending: true })
          .limit(1)
          .maybeSingle();
        setNextCharge(chargeData || null);
      }
    } catch (err) {
      console.error('[GestaoAlunoPerfil] Erro ao carregar aluno:', err);
      setError('Não foi possível carregar os dados deste aluno.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, [studentId]);

  const startEditing = () => {
    setForm({
      name: student.name || '',
      birth_date: student.birth_date || '',
      cidade_nascimento: student.cidade_nascimento || '',
      turma: student.turma || '',
      turno: student.turno || '',
      periodo: student.periodo || '',
      contracted_hours: student.contracted_hours || '',
      contracted_entry_time: student.contracted_entry_time || '',
      contracted_exit_time: student.contracted_exit_time || '',
      enrollment_status: student.enrollment_status || 'ativo',
      autorizacao_imagem: student.autorizacao_imagem,
      autorizacao_emergencia_medica: student.autorizacao_emergencia_medica,
    });
    setSaveError('');
    setIsEditing(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError('');
    try {
      const turmaChanged = form.turma !== student.turma && form.turma.trim();

      const { error: updateError } = await supabase
        .from('students')
        .update({
          name: form.name.trim(),
          birth_date: form.birth_date || null,
          cidade_nascimento: form.cidade_nascimento.trim() || null,
          turno: form.turno.trim() || null,
          periodo: form.periodo.trim() || null,
          contracted_hours: form.contracted_hours ? Number(form.contracted_hours) : null,
          contracted_entry_time: form.contracted_entry_time || null,
          contracted_exit_time: form.contracted_exit_time || null,
          enrollment_status: form.enrollment_status,
          autorizacao_imagem: form.autorizacao_imagem,
          autorizacao_emergencia_medica: form.autorizacao_emergencia_medica,
        })
        .eq('id', studentId);
      if (updateError) throw updateError;

      // Turma muda por uma RPC dedicada (mantém histórico em
      // student_transfers) -- nunca por UPDATE direto.
      if (turmaChanged) {
        const { error: transferError } = await supabase.rpc('transfer_student_class', {
          p_student_id: studentId,
          p_new_turma: form.turma.trim(),
          p_reason: 'Editado pelo perfil do aluno (Secretaria)',
        });
        if (transferError) throw transferError;
      }

      logAction({
        actorId: currentUser.id,
        schoolId: currentUser.school_id,
        action: 'update_student_profile',
        entityType: 'student',
        entityId: studentId,
        details: { name: form.name.trim() },
      });

      setIsEditing(false);
      await fetchAll();
    } catch (err) {
      console.error('[GestaoAlunoPerfil] Erro ao salvar:', err);
      setSaveError(err.message || 'Não foi possível salvar as alterações.');
    } finally {
      setIsSaving(false);
    }
  };

  const startTransfer = () => {
    setTransferSchoolName('');
    setTransferReason('');
    setTransferError('');
    setIsTransferring(true);
  };

  const handleConfirmTransfer = async () => {
    setIsSavingTransfer(true);
    setTransferError('');
    try {
      const { error: transferError } = await supabase.rpc('transfer_student_to_external_school', {
        p_student_id: studentId,
        p_destination_school_name: transferSchoolName.trim(),
        p_reason: transferReason.trim() || null,
      });
      if (transferError) throw transferError;
      logAction({
        actorId: currentUser.id,
        schoolId: currentUser.school_id,
        action: 'transfer_student_external',
        entityType: 'student',
        entityId: studentId,
        details: { name: student.name, destination_school_name: transferSchoolName.trim() },
      });
      setIsTransferring(false);
      await fetchAll();
    } catch (err) {
      console.error('[GestaoAlunoPerfil] Erro ao transferir aluno:', err);
      setTransferError(err.message || 'Não foi possível registrar a transferência.');
    } finally {
      setIsSavingTransfer(false);
    }
  };

  const handleUploadDocument = async (category, file) => {
    if (!file) return;
    setDocsError('');
    if (!DOC_ALLOWED_TYPES.includes(file.type)) {
      setDocsError(`Tipo de arquivo não permitido: ${file.name}`);
      return;
    }
    if (file.size > DOC_MAX_FILE_SIZE) {
      setDocsError(`Arquivo muito grande (máx. 15MB): ${file.name}`);
      return;
    }
    setUploadingCategory(category);
    try {
      const path = `${currentUser.school_id}/${studentId}/${category}-${buildSafeFileName(file)}`;
      await uploadFile(DOCUMENTS_BUCKET, path, file);
      const { error: insertError } = await supabase.from('student_documents').insert({
        school_id: currentUser.school_id,
        student_id: studentId,
        category,
        file_name: file.name,
        storage_path: path,
        uploaded_by: currentUser.id,
      });
      if (insertError) throw insertError;
      logAction({
        actorId: currentUser.id,
        schoolId: currentUser.school_id,
        action: 'upload_student_document',
        entityType: 'student',
        entityId: studentId,
        details: { name: student.name, category, file_name: file.name },
      });
      await fetchAll();
    } catch (err) {
      console.error('[GestaoAlunoPerfil] Erro ao enviar documento:', err);
      setDocsError('Não foi possível enviar o documento.');
    } finally {
      setUploadingCategory(null);
    }
  };

  const handleOpenDocument = async (doc) => {
    try {
      const url = await getSignedUrl(DOCUMENTS_BUCKET, doc.storage_path);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      console.error('[GestaoAlunoPerfil] Erro ao abrir documento:', err);
      setDocsError('Não foi possível abrir o documento.');
    }
  };

  const handleDeleteDocument = async (doc) => {
    setDeletingDocId(doc.id);
    setDocsError('');
    try {
      const { error: deleteError } = await supabase.from('student_documents').delete().eq('id', doc.id);
      if (deleteError) throw deleteError;
      await removeFile(DOCUMENTS_BUCKET, doc.storage_path);
      logAction({
        actorId: currentUser.id,
        schoolId: currentUser.school_id,
        action: 'delete_student_document',
        entityType: 'student',
        entityId: studentId,
        details: { name: student.name, category: doc.category, file_name: doc.file_name },
      });
      setDocuments(prev => prev.filter(d => d.id !== doc.id));
    } catch (err) {
      console.error('[GestaoAlunoPerfil] Erro ao excluir documento:', err);
      setDocsError('Não foi possível excluir o documento.');
    } finally {
      setDeletingDocId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6">
        <p className="text-sm font-semibold text-on-surface-variant">{error || 'Aluno não encontrado.'}</p>
        <button onClick={onBack} className="text-sm font-bold text-primary hover:underline">Voltar pra lista</button>
      </div>
    );
  }

  const financialGuardian = guardians.find(g => g.is_financial) || guardians.find(g => g.is_primary);
  const canEditHere = activeTab === 'pessoais' || activeTab === 'matricula';

  return (
    <div className="h-full flex flex-col bg-white -m-3 sm:m-0 rounded-none border-0 shadow-none overflow-hidden">
      <div className="flex items-center gap-3 p-4 sm:p-5 border-b border-outline-variant shrink-0">
        <button onClick={onBack} className="p-2 -ml-1 text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container rounded-zela-md transition shrink-0">
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-h3 text-on-surface truncate">{student.name}</h2>
          <p className="text-xs text-on-surface-variant/70">{student.turma || '—'}{student.turno ? ` · ${student.turno}` : ''}</p>
        </div>
        {canEditHere && !isEditing && (
          <button onClick={startEditing} className="flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 px-3 py-2 rounded-zela-md transition shrink-0">
            <Pencil size={14} /> Editar
          </button>
        )}
        {canEditHere && isEditing && (
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setIsEditing(false)} disabled={isSaving} className="flex items-center gap-1 text-xs font-bold text-on-surface-variant hover:bg-surface-container px-3 py-2 rounded-zela-md transition">
              <X size={14} /> Cancelar
            </button>
            <button onClick={handleSave} disabled={isSaving} className="flex items-center gap-1 text-xs font-bold text-white bg-primary hover:bg-primary-container px-3 py-2 rounded-zela-md transition disabled:opacity-60">
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Salvar
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-1 overflow-x-auto px-4 sm:px-5 pt-3 shrink-0 border-b border-outline-variant">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setIsEditing(false); }}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs sm:text-sm font-bold whitespace-nowrap border-b-2 transition ${active ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
            >
              <Icon size={14} /> {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {saveError && (
          <div className="max-w-2xl mb-4 bg-red-50 border border-red-100 text-red-600 p-2.5 rounded-zela-md text-xs font-medium">{saveError}</div>
        )}

        {activeTab === 'pessoais' && (
          isEditing ? (
            <div className="max-w-2xl space-y-4">
              <EditField label="Nome completo" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} />
              <EditField label="Data de nascimento" type="date" value={form.birth_date} onChange={v => setForm(f => ({ ...f, birth_date: v }))} />
              <EditField label="Cidade de nascimento" value={form.cidade_nascimento} onChange={v => setForm(f => ({ ...f, cidade_nascimento: v }))} />
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-on-surface">
                  <input type="checkbox" checked={!!form.autorizacao_imagem} onChange={e => setForm(f => ({ ...f, autorizacao_imagem: e.target.checked }))} />
                  Autoriza uso de imagem
                </label>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-on-surface">
                  <input type="checkbox" checked={!!form.autorizacao_emergencia_medica} onChange={e => setForm(f => ({ ...f, autorizacao_emergencia_medica: e.target.checked }))} />
                  Autoriza emergência médica
                </label>
              </div>
            </div>
          ) : (
            <div className="max-w-2xl space-y-4">
              <Field label="Nome completo" value={student.name} />
              <Field label="Data de nascimento" value={formatDate(student.birth_date)} />
              <Field label="Cidade de nascimento" value={student.cidade_nascimento || '—'} />
              <Field label="Horário contratado" value={`${student.contracted_entry_time || '—'} às ${student.contracted_exit_time || '—'} (${student.contracted_hours || '—'}h)`} />
              <Field label="Autorização de imagem" value={student.autorizacao_imagem === null ? 'Não informado' : (student.autorizacao_imagem ? 'Sim' : 'Não')} />
              <Field label="Autorização de emergência médica" value={student.autorizacao_emergencia_medica === null ? 'Não informado' : (student.autorizacao_emergencia_medica ? 'Sim' : 'Não')} />
              {fichaMedica && (
                <div className="pt-2 border-t border-outline-variant">
                  <p className="text-xs font-black uppercase tracking-wide text-on-surface-variant mb-2">Ficha médica</p>
                  <Field label="Restrição alimentar" value={fichaMedica.tem_restricao_alimentar ? (fichaMedica.restricoes_alimentares || []).join(', ') || 'Sim' : 'Não'} />
                  <Field label="Restrição de saúde" value={fichaMedica.tem_restricao_saude ? (fichaMedica.restricoes_saude || []).join(', ') || 'Sim' : 'Não'} />
                  <Field label="Usa medicamento" value={fichaMedica.usa_medicamento ? (fichaMedica.medicamentos || []).join(', ') || 'Sim' : 'Não'} />
                </div>
              )}
            </div>
          )
        )}

        {activeTab === 'responsaveis' && (
          <div className="max-w-2xl space-y-3">
            {guardians.length === 0 ? (
              <EmptyState text="Nenhum responsável vinculado." />
            ) : guardians.map(g => (
              <div key={g.id} className="p-3.5 border border-outline-variant rounded-zela-lg">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <p className="font-bold text-on-surface text-sm">{g.users?.name || '—'}</p>
                  {g.is_primary && <span className="text-[10px] font-bold uppercase bg-primary/10 text-primary px-2 py-0.5 rounded-full">Titular</span>}
                  {g.is_financial && <span className="text-[10px] font-bold uppercase bg-green-50 text-green-700 px-2 py-0.5 rounded-full">Financeiro</span>}
                </div>
                <p className="text-xs text-on-surface-variant/70">{g.relationship || '—'} · {g.users?.phone || '—'} · {g.users?.email || '—'}</p>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'autorizados' && (
          <div className="max-w-2xl space-y-3">
            {authorized.length === 0 ? (
              <EmptyState text="Nenhuma pessoa autorizada cadastrada." />
            ) : authorized.map(a => (
              <div key={a.id} className="p-3.5 border border-outline-variant rounded-zela-lg flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-on-surface text-sm truncate">{a.name}</p>
                  <p className="text-xs text-on-surface-variant/70">{a.relation || '—'} · {a.has_photo ? 'Com biometria' : 'Sem biometria'}</p>
                </div>
                <span className="text-[10px] font-bold uppercase text-on-surface-variant/70 shrink-0">{a.status || '—'}</span>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'matricula' && (
          isEditing ? (
            <div className="max-w-2xl space-y-4">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant/70">Situação da matrícula</label>
                <select value={form.enrollment_status} onChange={e => setForm(f => ({ ...f, enrollment_status: e.target.value }))} className="mt-1 w-full p-2.5 border border-outline-variant rounded-zela-md text-sm">
                  {Object.entries(ENROLLMENT_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant/70">Turma</label>
                <select value={form.turma} onChange={e => setForm(f => ({ ...f, turma: e.target.value }))} className="mt-1 w-full p-2.5 border border-outline-variant rounded-zela-md text-sm">
                  <option value={student.turma}>{student.turma} (atual)</option>
                  {schoolTurmas.filter(t => t !== student.turma).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <p className="text-[11px] text-on-surface-variant/60 mt-1">Trocar a turma aqui já registra no histórico de transferências do aluno.</p>
              </div>
              <EditField label="Turno" value={form.turno} onChange={v => setForm(f => ({ ...f, turno: v }))} />
              <EditField label="Período" value={form.periodo} onChange={v => setForm(f => ({ ...f, periodo: v }))} />
              <EditField label="Ciclo contratado (horas)" type="number" value={form.contracted_hours} onChange={v => setForm(f => ({ ...f, contracted_hours: v }))} />
              <EditField label="Horário de entrada" type="time" value={form.contracted_entry_time} onChange={v => setForm(f => ({ ...f, contracted_entry_time: v }))} />
              <EditField label="Horário de saída" type="time" value={form.contracted_exit_time} onChange={v => setForm(f => ({ ...f, contracted_exit_time: v }))} />
            </div>
          ) : (
            <div className="max-w-2xl space-y-4">
              <Field label="Situação da matrícula" value={ENROLLMENT_STATUS_LABELS[student.enrollment_status] || student.enrollment_status} />
              <Field label="Turma atual" value={student.turma || '—'} />
              <Field label="Turno" value={student.turno || '—'} />
              <Field label="Período" value={student.periodo || '—'} />
              <Field label="Ciclo contratado" value={student.contracted_hours ? `${student.contracted_hours}h` : '—'} />
              <p className="text-xs text-on-surface-variant/60 pt-2">Transferências de turma feitas por aqui também aparecem no histórico do aluno em Admin/Recepção.</p>

              {student.enrollment_status !== 'transferido' && (
                <div className="pt-4 border-t border-outline-variant">
                  {!isTransferring ? (
                    <button onClick={startTransfer} className="flex items-center gap-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 px-3 py-2 rounded-zela-md transition">
                      <LogOut size={14} /> Transferir para outra escola
                    </button>
                  ) : (
                    <div className="space-y-3 max-w-md">
                      <p className="text-xs font-black uppercase tracking-wide text-on-surface-variant">Transferir para outra escola</p>
                      <p className="text-[11px] text-on-surface-variant/60">Marca o aluno como transferido e sai das listagens ativas da Secretaria. O histórico de presença e matrícula continua preservado.</p>
                      <EditField label="Nome da escola de destino" value={transferSchoolName} onChange={setTransferSchoolName} />
                      <EditField label="Motivo (opcional)" value={transferReason} onChange={setTransferReason} />
                      {transferError && <p className="text-xs text-red-600 font-medium">{transferError}</p>}
                      <div className="flex items-center gap-2">
                        <button onClick={() => setIsTransferring(false)} disabled={isSavingTransfer} className="text-xs font-bold text-on-surface-variant hover:bg-surface-container px-3 py-2 rounded-zela-md transition">Cancelar</button>
                        <button onClick={handleConfirmTransfer} disabled={isSavingTransfer || !transferSchoolName.trim()} className="flex items-center gap-1 text-xs font-bold text-white bg-red-600 hover:bg-red-700 px-3 py-2 rounded-zela-md transition disabled:opacity-60">
                          {isSavingTransfer ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />} Confirmar transferência
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        )}

        {activeTab === 'financeiro' && (
          <div className="max-w-2xl space-y-4">
            {!contract ? (
              <EmptyState text="Nenhum contrato financeiro encontrado pra este aluno." />
            ) : (
              <>
                <Field label="Responsável financeiro" value={financialGuardian?.users?.name || '—'} />
                <Field label="Situação do contrato" value={contract.status} />
                <Field label="Ciclo de cobrança" value={contract.billing_cycle} />
                <Field label="Valor contratado" value={formatCurrency(contract.amount_cents)} />
                <Field label="Início do contrato" value={formatDate(contract.first_due_date)} />
                {nextCharge && (
                  <div className="pt-2 border-t border-outline-variant">
                    <p className="text-xs font-black uppercase tracking-wide text-on-surface-variant mb-2">Próxima cobrança</p>
                    <Field label="Vencimento" value={formatDate(nextCharge.due_date)} />
                    <Field label="Valor" value={formatCurrency(nextCharge.amount_cents)} />
                    <Field label="Situação" value={CHARGE_STATUS_LABELS[nextCharge.status] || nextCharge.status} />
                  </div>
                )}
                <p className="text-xs text-on-surface-variant/60 pt-2">Resumo apenas — para detalhes completos e histórico de cobranças, acesse o menu Financeiro.</p>
              </>
            )}
          </div>
        )}

        {activeTab === 'documentos' && (
          <div className="max-w-2xl space-y-5">
            {docsError && (
              <div className="bg-red-50 border border-red-100 text-red-600 p-2.5 rounded-zela-md text-xs font-medium">{docsError}</div>
            )}

            <div>
              <p className="text-xs font-black uppercase tracking-wide text-on-surface-variant mb-2">Enviar documento</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {DOCUMENT_CATEGORIES.map(cat => {
                  const inputId = `doc-upload-${cat.key}`;
                  const isUploading = uploadingCategory === cat.key;
                  return (
                    <label
                      key={cat.key}
                      htmlFor={inputId}
                      className={`flex items-center gap-1.5 border border-dashed border-outline-variant rounded-zela-md px-2.5 py-2 text-xs font-bold cursor-pointer transition hover:border-primary hover:text-primary text-on-surface-variant ${isUploading ? 'opacity-60 pointer-events-none' : ''}`}
                    >
                      {isUploading ? <Loader2 size={13} className="animate-spin shrink-0" /> : <Upload size={13} className="shrink-0" />}
                      <span className="truncate">{cat.label}</span>
                      <input
                        id={inputId}
                        type="file"
                        accept={DOC_ALLOWED_TYPES.join(',')}
                        className="hidden"
                        disabled={isUploading}
                        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; handleUploadDocument(cat.key, f); }}
                      />
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-wide text-on-surface-variant mb-2">Documentos enviados</p>
              {documents.length === 0 ? (
                <EmptyState text="Nenhum documento enviado ainda." />
              ) : (
                <div className="space-y-2">
                  {documents.map(doc => (
                    <div key={doc.id} className="flex items-center justify-between gap-3 p-3 border border-outline-variant rounded-zela-lg">
                      <div className="min-w-0">
                        <p className="font-bold text-on-surface text-sm truncate">{DOCUMENT_CATEGORY_LABELS[doc.category] || doc.category}</p>
                        <p className="text-xs text-on-surface-variant/70 truncate">{doc.file_name} · {formatDate(doc.uploaded_at?.slice(0, 10))}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => handleOpenDocument(doc)} className="p-2 text-on-surface-variant/70 hover:text-primary hover:bg-primary/10 rounded-zela-md transition" title="Abrir">
                          <Download size={15} />
                        </button>
                        <button onClick={() => handleDeleteDocument(doc)} disabled={deletingDocId === doc.id} className="p-2 text-on-surface-variant/70 hover:text-red-600 hover:bg-red-50 rounded-zela-md transition disabled:opacity-50" title="Excluir">
                          {deletingDocId === doc.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'historico' && (
          <div className="max-w-2xl space-y-2">
            {historico.length === 0 ? (
              <EmptyState text="Nenhuma ação registrada ainda para este aluno." />
            ) : historico.map(h => (
              <div key={h.id} className="p-3 border border-outline-variant rounded-zela-lg">
                <p className="text-sm font-bold text-on-surface">{h.label}</p>
                {h.detail && <p className="text-xs text-on-surface-variant/80 mt-0.5">{h.detail}</p>}
                <p className="text-xs text-on-surface-variant/60 mt-1">por {h.actorName} · {new Date(h.when).toLocaleString('pt-BR')}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant/70">{label}</p>
      <p className="text-sm text-on-surface mt-0.5">{value || '—'}</p>
    </div>
  );
}

function EditField({ label, value, onChange, type = 'text' }) {
  return (
    <div>
      <label className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant/70">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="mt-1 w-full p-2.5 border border-outline-variant rounded-zela-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      />
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 bg-surface-container-lowest rounded-zela-xl border border-dashed border-outline-variant">
      <p className="text-sm font-semibold text-on-surface-variant">{text}</p>
    </div>
  );
}
