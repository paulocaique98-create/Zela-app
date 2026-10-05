import React, { useState, useEffect } from 'react';
import { ArrowLeft, Loader2, User, Users, ShieldCheck, FileText, Wallet, FolderOpen, History, Pencil, Check, X, LogOut, Upload, Download, Trash2, ArrowRightLeft, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSchoolConfig } from '../lib/schoolConfig';
import { uploadFile, removeFile, getSignedUrl, buildSafeFileName } from '../lib/storage';
import { logAction } from '../lib/auditLog';
import { perfilDasTurmas, sugerirTurma, formatIdade, idadeEmMeses, MOTIVOS_MUDANCA_TURMA } from '../lib/sugestaoTurma';
import { recursosDoPerfil } from '../lib/perfisGestao';
import CondicaoFinanceiraFamilia from './CondicaoFinanceiraFamilia';
import { CICLOS_DE_HORAS, TURNOS, normalizarTurno, normalizarCiclo } from '../../supabase/functions/_shared/planPricing.ts';

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
// initialTab/initialMoveTo: vindo do cartão "Hora de mudar de turma?" do
// painel de Alunos, abre direto na Matrícula com a mudança já preenchida.
export default function GestaoAlunoPerfil({ currentUser, studentId, onBack, initialTab = 'pessoais', initialMoveTo = null }) {
  // Coordenação e Direção (29/09/2026): sem a aba Financeiro e sem escolher
  // quem paga (veem quem é o responsável financeiro, só leitura).
  const recursos = recursosDoPerfil(currentUser?.role);
  const abas = TABS.filter(t => t.key !== 'financeiro' || recursos.financeiro);
  const { turmas: schoolTurmas } = useSchoolConfig(currentUser?.school_id);
  const [activeTab, setActiveTab] = useState(initialTab);
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

  // Troca do responsável financeiro (set_student_financial_guardian).
  const [financeiroSalvando, setFinanceiroSalvando] = useState(null);
  const [financeiroErro, setFinanceiroErro] = useState('');

  const tornarFinanceiro = async (guardianId) => {
    setFinanceiroSalvando(guardianId);
    setFinanceiroErro('');
    const { error: rpcError } = await supabase.rpc('set_student_financial_guardian', { p_student_id: studentId, p_guardian_id: guardianId });
    setFinanceiroSalvando(null);
    if (rpcError) { setFinanceiroErro(rpcError.message); return; }
    await fetchAll();
  };

  // Mudar de turma (dentro da escola).
  const [colegas, setColegas] = useState([]);
  const [isMoving, setIsMoving] = useState(!!initialMoveTo);
  const [moveTurma, setMoveTurma] = useState(initialMoveTo || '');
  const [moveMotivo, setMoveMotivo] = useState(initialMoveTo ? MOTIVOS_MUDANCA_TURMA[0] : '');
  const [moveNota, setMoveNota] = useState('');
  const [isSavingMove, setIsSavingMove] = useState(false);
  const [moveError, setMoveError] = useState('');

  const fetchAll = async () => {
    setIsLoading(true);
    setError('');
    try {
      const { data: studentData, error: studentError } = await supabase
        .from('students')
        .select('id, school_id, name, birth_date, cidade_nascimento, turma, turno, periodo, contracted_hours, contracted_entry_time, contracted_exit_time, enrollment_status, family_id, autorizacao_imagem, autorizacao_emergencia_medica, users:family_id(name, email, phone, doc_type, doc_number, street, number, complement, neighborhood, city, state, zip_code)')
        .eq('id', studentId)
        .single();
      if (studentError) throw studentError;
      setStudent(studentData);

      const [{ data: guardiansData }, { data: authorizedData }, { data: fichaData }, { data: contractData }, { data: documentsData }, { data: auditData }, { data: transfersData }, { data: colegasData }] = await Promise.all([
        supabase.from('student_guardians').select('id, is_primary, is_financial, relationship, guardian_id, users:guardian_id(name, phone, email)').eq('student_id', studentId),
        supabase.from('authorized_persons').select('id, name, relation, status, has_photo').eq('family_id', studentData.family_id),
        supabase.from('fichas_medicas').select('*').eq('student_id', studentId).maybeSingle(),
        supabase.from('financial_contracts').select('id, status, billing_cycle, amount_cents, first_due_date').eq('student_id', studentId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('student_documents').select('id, category, file_name, storage_path, notes, uploaded_at').eq('student_id', studentId).order('uploaded_at', { ascending: false }),
        supabase.from('audit_logs').select('id, action, details, actor_id, created_at, users:actor_id(name)').eq('entity_type', 'student').eq('entity_id', studentId).order('created_at', { ascending: false }),
        supabase.from('student_transfers').select('id, transfer_type, from_class_name, to_class_name, destination_school_name, reason, transferred_at, users:transferred_by(name)').eq('student_id', studentId).order('transferred_at', { ascending: false }),
        // Idade das crianças de cada turma, para a sugestão de turma (prévia).
        supabase.from('students').select('id, turma, turno, birth_date, enrollment_status').eq('school_id', studentData.school_id || currentUser.school_id).eq('enrollment_status', 'ativo'),
      ]);
      setGuardians(guardiansData || []);
      setAuthorized(authorizedData || []);
      setFichaMedica(fichaData || null);
      setContract(contractData || null);
      setDocuments(documentsData || []);
      setColegas(colegasData || []);

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

  const startMove = (turmaSugerida = '') => {
    setMoveTurma(turmaSugerida);
    setMoveMotivo(turmaSugerida ? MOTIVOS_MUDANCA_TURMA[0] : '');
    setMoveNota('');
    setMoveError('');
    setIsTransferring(false);
    setIsMoving(true);
  };

  // Mesma função do banco usada pela Recepção: troca a turma e grava em
  // student_transfers (que já aparece no Histórico do aluno).
  const handleConfirmMove = async () => {
    setIsSavingMove(true);
    setMoveError('');
    try {
      const reason = [moveMotivo, moveNota.trim()].filter(Boolean).join(' · ') || null;
      const { error: moveRpcError } = await supabase.rpc('transfer_student_class', {
        p_student_id: studentId,
        p_new_turma: moveTurma,
        p_reason: reason,
      });
      if (moveRpcError) throw moveRpcError;
      setIsMoving(false);
      await fetchAll();
    } catch (err) {
      console.error('[GestaoAlunoPerfil] Erro ao mudar de turma:', err);
      setMoveError(err.message || 'Não foi possível mudar a turma.');
    } finally {
      setIsSavingMove(false);
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
  const isAtivo = (student.enrollment_status || 'ativo') === 'ativo';
  const sugestao = isAtivo ? sugerirTurma(student, perfilDasTurmas(colegas)) : null;
  const idadeMeses = idadeEmMeses(student.birth_date);
  const turmasDestino = [...new Set([...schoolTurmas, ...colegas.map(c => c.turma).filter(Boolean)])].filter(t => t !== student.turma);

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
        {abas.map(tab => {
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
              <Field label="Idade do aluno" value={formatIdade(idadeMeses)} />
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
            {guardians.length > 1 && recursos.escolherResponsavelFinanceiro && (
              <p className="text-xs text-on-surface-variant">
                A mensalidade deste aluno é cobrada no nome e CPF do responsável marcado como <strong>Financeiro</strong>.
                {contract && ['active', 'paused'].includes(contract.status)
                  ? ' Há contrato em andamento: para trocar quem paga, cancele o contrato em Contratos e crie um novo no nome da outra pessoa.'
                  : ' Enquanto não houver contrato, dá para trocar aqui.'}
              </p>
            )}
            {financeiroErro && <p className="text-xs font-medium text-red-600">{financeiroErro}</p>}
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
                {recursos.escolherResponsavelFinanceiro && !g.is_financial && guardians.length > 1 && !(contract && ['active', 'paused'].includes(contract.status)) && (
                  <button
                    onClick={() => tornarFinanceiro(g.guardian_id)}
                    disabled={!!financeiroSalvando}
                    className="mt-2 text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-zela-md transition disabled:opacity-60"
                  >
                    {financeiroSalvando === g.guardian_id ? 'Salvando...' : 'Tornar responsável financeiro'}
                  </button>
                )}
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
                <p className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant/70">Turma</p>
                <p className="mt-1 text-sm text-on-surface">{student.turma || '·'}</p>
                <p className="text-[11px] text-on-surface-variant/60 mt-1">Para trocar a turma, salve ou cancele esta edição e use o botão "Mudar de turma".</p>
              </div>
              <SelectField label="Turno" value={form.turno} onChange={v => setForm(f => ({ ...f, turno: v }))}
                options={[{ value: '', label: 'Sem turno' }, ...TURNOS.map(t => ({ value: t, label: t })), ...(form.turno && !normalizarTurno(form.turno) ? [{ value: form.turno, label: `${form.turno} (fora do padrão)` }] : [])]} />
              <EditField label="Período" value={form.periodo} onChange={v => setForm(f => ({ ...f, periodo: v }))} />
              <SelectField label="Ciclo contratado" value={String(form.contracted_hours || '')} onChange={v => setForm(f => ({ ...f, contracted_hours: v }))}
                options={[{ value: '', label: 'Sem ciclo' }, ...CICLOS_DE_HORAS.map(c => ({ value: String(c), label: `${c} horas` })), ...(form.contracted_hours && !normalizarCiclo(form.contracted_hours) ? [{ value: String(form.contracted_hours), label: `${form.contracted_hours} (fora do padrão)` }] : [])]} />
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
              <Field label="Idade" value={formatIdade(idadeMeses)} />

              {sugestao && !isMoving && (
                <div className={`p-3.5 rounded-zela-lg border flex flex-col sm:flex-row sm:items-center gap-3 ${sugestao.tipo === 'evoluir' ? 'bg-primary/5 border-primary/20' : 'bg-amber-50 border-amber-200'}`}>
                  <Sparkles size={18} className={`shrink-0 ${sugestao.tipo === 'evoluir' ? 'text-primary' : 'text-amber-800'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-on-surface">
                      {sugestao.tipo === 'evoluir' ? `Pode estar na hora de ir para ${sugestao.turma}` : 'Idade bem abaixo da turma'}
                    </p>
                    <p className="text-xs text-on-surface-variant">
                      {sugestao.tipo === 'evoluir'
                        ? `Tem ${formatIdade(sugestao.idadeMeses)}; em ${sugestao.turma} a idade típica é ${formatIdade(Math.round(sugestao.medianaDestino))}. Sugestão só pela idade (prévia): avalie com a professora.`
                        : `Tem ${formatIdade(sugestao.idadeMeses)}, e a idade típica da turma é ${formatIdade(Math.round(sugestao.medianaAtual))}. Confira a data de nascimento.`}
                    </p>
                  </div>
                  {sugestao.tipo === 'evoluir' && (
                    <button onClick={() => startMove(sugestao.turma)} className="self-start sm:self-auto text-xs font-bold text-white bg-primary hover:bg-primary-container px-3 py-2 rounded-zela-md transition whitespace-nowrap">
                      Mudar para {sugestao.turma}
                    </button>
                  )}
                </div>
              )}

              {isAtivo && (
                <div className="pt-4 border-t border-outline-variant">
                  {!isMoving ? (
                    <button onClick={() => startMove('')} className="flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 px-3 py-2 rounded-zela-md transition">
                      <ArrowRightLeft size={14} /> Mudar de turma
                    </button>
                  ) : (
                    <div className="space-y-3 max-w-md">
                      <p className="text-xs font-black uppercase tracking-wide text-on-surface-variant">Mudar de turma</p>
                      <p className="text-[11px] text-on-surface-variant/60">O aluno continua matriculado na escola; muda só a turma. A mudança fica registrada no Histórico.</p>
                      <div>
                        <label htmlFor="mover-turma" className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant/70">Nova turma</label>
                        <select id="mover-turma" value={moveTurma} onChange={e => setMoveTurma(e.target.value)} className="mt-1 w-full p-2.5 border border-outline-variant rounded-zela-md text-sm bg-white">
                          <option value="">Escolha a turma</option>
                          {turmasDestino.map(t => (
                            <option key={t} value={t}>{t}{sugestao?.tipo === 'evoluir' && sugestao.turma === t ? ' (sugerida pela idade)' : ''}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant/70">Motivo</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {MOTIVOS_MUDANCA_TURMA.map(m => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setMoveMotivo(moveMotivo === m ? '' : m)}
                              aria-pressed={moveMotivo === m}
                              className={`text-xs font-bold px-3 py-1.5 rounded-full border transition ${moveMotivo === m ? 'bg-primary border-primary text-white' : 'bg-white border-outline-variant text-on-surface hover:border-primary/40'}`}
                            >
                              {m}
                            </button>
                          ))}
                        </div>
                      </div>
                      <EditField label="Observação (opcional)" value={moveNota} onChange={setMoveNota} />
                      {moveError && <p className="text-xs text-red-600 font-medium">{moveError}</p>}
                      <div className="flex items-center gap-2">
                        <button onClick={() => setIsMoving(false)} disabled={isSavingMove} className="text-xs font-bold text-on-surface-variant hover:bg-surface-container px-3 py-2 rounded-zela-md transition">Cancelar</button>
                        <button onClick={handleConfirmMove} disabled={isSavingMove || !moveTurma} className="flex items-center gap-1 text-xs font-bold text-white bg-primary hover:bg-primary-container px-3 py-2 rounded-zela-md transition disabled:opacity-60">
                          {isSavingMove ? <Loader2 size={14} className="animate-spin" /> : <ArrowRightLeft size={14} />} Confirmar mudança
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {student.enrollment_status !== 'transferido' && (
                <div className="pt-4 border-t border-outline-variant">
                  {!isTransferring ? (
                    <button onClick={() => { setIsMoving(false); startTransfer(); }} className="flex items-center gap-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 px-3 py-2 rounded-zela-md transition">
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

        {activeTab === 'financeiro' && recursos.financeiro && (
          <div className="max-w-2xl space-y-4">
            {!contract ? (
              <EmptyState text="Nenhuma mensalidade encontrada pra este aluno." />
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
            <CondicaoFinanceiraFamilia
              currentUser={currentUser}
              student={student}
              guardianId={financialGuardian?.guardian_id}
              guardianName={financialGuardian?.users?.name}
              temMensalidadeAtiva={Boolean(contract && ['active', 'paused'].includes(contract.status))}
            />
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

function SelectField({ label, value, onChange, options }) {
  return (
    <div>
      <label className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant/70">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="mt-1 w-full p-2.5 bg-white border border-outline-variant rounded-zela-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
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
