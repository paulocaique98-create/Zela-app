import React, { useEffect, useState } from 'react';
import {
  FileText, Loader2, X, Check, Clock, CheckCircle2, XCircle,
  Download, ChevronDown, ChevronUp, User, Baby, UserCheck, Car, Copy, KeyRound,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getSignedUrl } from '../lib/storage';
import { notifyFamilies } from '../lib/notifyFamilies';

const BUCKET = 'matriculas-docs';

// Mesmo mapeamento período → horário usado no cadastro manual de alunos
// (AdminUserRegistration.jsx), pra manter os horários contratados consistentes
// não importa por qual fluxo o aluno entrou no sistema.
const PERIODO_HORARIOS = {
  '07:00 às 13:00': { entry: '07:00:00', exit: '13:00:00' },
  '07:00 às 15:00': { entry: '07:00:00', exit: '15:00:00' },
  '07:00 às 17:00': { entry: '07:00:00', exit: '17:00:00' },
  '09:00 às 19:00': { entry: '09:00:00', exit: '19:00:00' },
  '11:00 às 19:00': { entry: '11:00:00', exit: '19:00:00' },
  '13:00 às 19:00': { entry: '13:00:00', exit: '19:00:00' },
};

function generateTempPassword() {
  return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 4).toUpperCase();
}

const TABS = [
  { key: 'pending', label: 'Pendentes' },
  { key: 'approved', label: 'Aprovadas' },
  { key: 'rejected', label: 'Rejeitadas' },
];

const STATUS_INFO = {
  pending: { label: 'Em análise', icon: Clock, cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved: { label: 'Aprovada', icon: CheckCircle2, cls: 'bg-green-50 text-green-700 border-green-200' },
  rejected: { label: 'Rejeitada', icon: XCircle, cls: 'bg-red-50 text-red-700 border-red-200' },
};

function DocLink({ doc, label }) {
  const [isOpening, setIsOpening] = useState(false);
  if (!doc?.path) return null;
  const open = async () => {
    setIsOpening(true);
    try {
      const url = await getSignedUrl(BUCKET, doc.path);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      console.error('[AdminMatriculas] Erro ao abrir documento:', err);
    } finally {
      setIsOpening(false);
    }
  };
  return (
    <button
      type="button"
      onClick={open}
      disabled={isOpening}
      className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2.5 py-1.5 rounded-lg text-xs font-bold transition disabled:opacity-50"
    >
      {isOpening ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
      {label}
    </button>
  );
}

function PessoaFields({ pessoa }) {
  if (!pessoa) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm">
      <Field label="Nome" value={pessoa.nome} />
      <Field label="E-mail" value={pessoa.email} />
      <Field label="Telefone" value={pessoa.telefone} />
      <Field label="CPF" value={pessoa.cpf} />
      <Field label="RG" value={pessoa.rg} />
      <Field label="Data de Expedição" value={pessoa.rg_expedicao} />
      <Field label="Órgão Expedidor" value={pessoa.rg_orgao} />
      <Field label="Profissão" value={pessoa.profissao} />
      <Field label="Estado Civil" value={pessoa.estado_civil} />
    </div>
  );
}

function Field({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-slate-700 font-medium">{value}</p>
    </div>
  );
}

const DOC_FIELDS = [
  { key: 'cpf_doc', label: 'CPF' },
  { key: 'rg_doc', label: 'RG' },
  { key: 'comprovante_residencia_doc', label: 'Comprovante de Residência' },
  { key: 'plano_saude_doc', label: 'Plano de Saúde / SUS' },
  { key: 'cartao_vacina_doc', label: 'Cartão de Vacina' },
];

function SolicitacaoCard({ solicitacao, onDecide, isDeciding }) {
  const [expanded, setExpanded] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const status = STATUS_INFO[solicitacao.status] || STATUS_INFO.pending;
  const StatusIcon = status.icon;
  const criancas = solicitacao.criancas || [];
  const resp = solicitacao.responsavel_financeiro || {};
  const segundo = solicitacao.segundo_responsavel;
  const autorizados = solicitacao.autorizados || [];
  const transporte = solicitacao.transporte_autorizados || [];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <button type="button" onClick={() => setExpanded(e => !e)} className="w-full flex items-center justify-between p-4 text-left">
        <div className="min-w-0">
          <p className="font-bold text-slate-800 text-sm truncate">
            {criancas.map(c => c.nome).join(', ') || 'Solicitação'}
          </p>
          <p className="text-slate-400 text-xs mt-0.5">
            {resp.nome} — enviado em {new Date(solicitacao.submitted_at).toLocaleString('pt-BR')}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-1 rounded-lg border ${status.cls}`}>
            <StatusIcon size={11} /> {status.label}
          </span>
          {expanded ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 sm:px-5 pb-5 space-y-4 border-t border-slate-100 pt-4">
          {solicitacao.status === 'rejected' && solicitacao.rejection_reason && (
            <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-xs font-medium">
              Motivo da rejeição: {solicitacao.rejection_reason}
            </div>
          )}

          <div className="space-y-2">
            <h5 className="font-bold text-slate-800 text-xs flex items-center gap-1.5 uppercase tracking-wide"><User size={13} className="text-indigo-600" /> Responsável Financeiro</h5>
            <PessoaFields pessoa={resp} />
            <div className="flex flex-wrap gap-2 pt-1">
              {DOC_FIELDS.map(({ key, label }) => <DocLink key={key} doc={resp[key]} label={label} />)}
            </div>
          </div>

          {segundo && (
            <div className="space-y-2">
              <h5 className="font-bold text-slate-800 text-xs flex items-center gap-1.5 uppercase tracking-wide"><User size={13} className="text-indigo-600" /> Segundo Responsável</h5>
              <PessoaFields pessoa={segundo} />
            </div>
          )}

          <div className="space-y-3">
            <h5 className="font-bold text-slate-800 text-xs flex items-center gap-1.5 uppercase tracking-wide"><Baby size={13} className="text-indigo-600" /> Crianças</h5>
            {criancas.map((c, i) => (
              <div key={i} className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm">
                  <Field label="Nome" value={c.nome} />
                  <Field label="Nascimento" value={c.nascimento} />
                  <Field label="Cidade de Nascimento" value={c.cidade_nascimento} />
                  <Field label="Ciclo" value={c.ciclo ? `${c.ciclo}h/dia` : ''} />
                  <Field label="Período" value={c.periodo} />
                  <Field label="Turno" value={c.turno} />
                  <div className="col-span-2 sm:col-span-3">
                    <Field label="Endereço" value={c.endereco} />
                  </div>
                </div>
                <DocLink doc={c.certidao_doc} label="Certidão de Nascimento" />
              </div>
            ))}
          </div>

          {(autorizados.length > 0 || transporte.length > 0) && (
            <div className="space-y-2">
              <h5 className="font-bold text-slate-800 text-xs flex items-center gap-1.5 uppercase tracking-wide"><UserCheck size={13} className="text-indigo-600" /> Autorizados</h5>
              {autorizados.map((a, i) => (
                <div key={i} className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm">
                  <Field label="Nome" value={a.nome} />
                  <Field label="Telefone" value={a.telefone} />
                  <Field label="Parentesco" value={a.parentesco} />
                </div>
              ))}
              {transporte.length > 0 && (
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1 mb-1"><Car size={11} /> Autorizados pelo transporte</p>
                  <p className="text-sm text-slate-700">{transporte.map(t => t.nome).join(', ')}</p>
                </div>
              )}
            </div>
          )}

          {solicitacao.status === 'pending' && (
            <div className="pt-2 border-t border-slate-100 space-y-2">
              {showReject ? (
                <div className="space-y-2">
                  <textarea
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    placeholder="Motivo da rejeição (visível para a família)"
                    rows={2}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setShowReject(false)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-2 rounded-xl text-sm transition">Cancelar</button>
                    <button
                      onClick={() => onDecide(solicitacao, 'rejected', rejectReason)}
                      disabled={isDeciding || !rejectReason.trim()}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-red-500 hover:bg-red-600 disabled:bg-slate-300 text-white font-bold py-2 rounded-xl text-sm transition"
                    >
                      {isDeciding ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />} Confirmar Rejeição
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowReject(true)}
                    disabled={isDeciding}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-white border border-red-200 hover:bg-red-50 text-red-600 font-bold py-2.5 rounded-xl text-sm transition"
                  >
                    <XCircle size={15} /> Rejeitar
                  </button>
                  <button
                    onClick={() => onDecide(solicitacao, 'approved')}
                    disabled={isDeciding}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 rounded-xl text-sm transition"
                  >
                    {isDeciding ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Aprovar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminMatriculas({ currentUser, currentSchool }) {
  const schoolId = currentSchool?.id || currentUser?.school_id;
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('pending');
  const [decidingId, setDecidingId] = useState(null);
  const [newGuardianCredentials, setNewGuardianCredentials] = useState(null);

  const fetchSolicitacoes = async () => {
    if (!schoolId) return;
    setIsLoading(true);
    setError('');
    try {
      const { data, error: fetchError } = await supabase
        .from('matricula_solicitacoes')
        .select('*')
        .eq('school_id', schoolId)
        .order('submitted_at', { ascending: false });
      if (fetchError) throw fetchError;
      setSolicitacoes(data || []);
    } catch (err) {
      console.error('[AdminMatriculas] Erro ao buscar:', err);
      setError('Não foi possível carregar as solicitações.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSolicitacoes();
  }, [schoolId]);

  // Converte os dados da solicitação aprovada em cadastros reais: aluno(s) em
  // `students` (+ vínculo em `student_guardians`), 2º responsável como conta de
  // acesso própria (ou vinculado, se o e-mail já existir), autorizados em
  // `authorized_persons`, e enriquece o cadastro do próprio responsável financeiro
  // (que já é um usuário logado) com os dados/documentos preenchidos no formulário.
  const convertSolicitacaoToRecords = async (solicitacao) => {
    const resp = solicitacao.responsavel_financeiro || {};
    const criancas = solicitacao.criancas || [];

    // 1. Enriquece o cadastro do responsável financeiro (já é o family_id logado)
    const documentsPatch = {
      cpf_doc: resp.cpf_doc || null,
      rg_doc: resp.rg_doc || null,
      comprovante_residencia_doc: resp.comprovante_residencia_doc || null,
      plano_saude_doc: resp.plano_saude_doc || null,
      cartao_vacina_doc: resp.cartao_vacina_doc || null,
      rg_expedicao: resp.rg_expedicao || null,
      rg_orgao: resp.rg_orgao || null,
    };
    const { error: userUpdateError } = await supabase
      .from('users')
      .update({
        phone: resp.telefone || null,
        doc_type: resp.cpf ? 'CPF' : null,
        doc_number: resp.cpf || null,
        profession: resp.profissao || null,
        civil_status: resp.estado_civil || null,
        documents: documentsPatch,
      })
      .eq('id', solicitacao.family_id);
    if (userUpdateError) throw new Error(`Responsável financeiro: ${userUpdateError.message}`);

    // 2. Cria os alunos + vínculo do responsável financeiro
    const newStudentIds = [];
    for (const c of criancas) {
      const horario = PERIODO_HORARIOS[c.periodo];
      const { data: student, error: studentError } = await supabase
        .from('students')
        .insert({
          name: c.nome,
          birth_date: c.nascimento || null,
          contracted_hours: c.ciclo ? parseFloat(c.ciclo) : null,
          turno: c.turno || null,
          periodo: c.periodo || null,
          contracted_entry_time: horario?.entry || null,
          contracted_exit_time: horario?.exit || null,
          family_id: solicitacao.family_id,
          school_id: solicitacao.school_id,
          status: 'idle',
        })
        .select('id')
        .single();
      if (studentError) throw new Error(`Aluno ${c.nome}: ${studentError.message}`);
      newStudentIds.push(student.id);

      const { error: guardianLinkError } = await supabase.from('student_guardians').insert({
        student_id: student.id,
        guardian_id: solicitacao.family_id,
        school_id: solicitacao.school_id,
        is_primary: true,
        is_financial: true,
        relationship: 'Responsável Financeiro',
      });
      if (guardianLinkError) throw new Error(`Vínculo do responsável financeiro: ${guardianLinkError.message}`);
    }

    // 3. Segundo responsável: vincula se já existir conta com o e-mail, senão cria uma nova
    let segundoCredentials = null;
    const segundo = solicitacao.segundo_responsavel;
    if (segundo?.nome?.trim() && newStudentIds.length > 0) {
      let segundoUserId = null;
      if (segundo.email?.trim()) {
        const { data: existingUser } = await supabase
          .from('users')
          .select('id')
          .eq('email', segundo.email.trim().toLowerCase())
          .maybeSingle();
        segundoUserId = existingUser?.id || null;
      }

      if (segundoUserId) {
        const links = newStudentIds.map(sId => ({
          student_id: sId,
          guardian_id: segundoUserId,
          school_id: solicitacao.school_id,
          is_primary: false,
          is_financial: false,
          relationship: 'Segundo Responsável',
        }));
        const { error: linkError } = await supabase.from('student_guardians').insert(links);
        if (linkError) throw new Error(`Vínculo do 2º responsável: ${linkError.message}`);
      } else if (segundo.email?.trim()) {
        const tempPassword = generateTempPassword();
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const response = await fetch(`${supabaseUrl}/functions/v1/create-family-user`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            name: segundo.nome,
            email: segundo.email.trim().toLowerCase(),
            password: tempPassword,
            phone: segundo.telefone || null,
            doc_number: segundo.cpf || null,
            school_id: solicitacao.school_id,
            student_ids: newStudentIds,
            is_financial: false,
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(`2º responsável: ${result.error || 'erro ao criar conta'}`);

        await supabase.from('users').update({
          doc_type: segundo.cpf ? 'CPF' : null,
          profession: segundo.profissao || null,
          civil_status: segundo.estado_civil || null,
          documents: { rg_expedicao: segundo.rg_expedicao || null, rg_orgao: segundo.rg_orgao || null },
        }).eq('id', result.user.id);

        segundoCredentials = { name: segundo.nome, email: segundo.email.trim().toLowerCase(), password: tempPassword };
      }
    }

    // 4. Autorizados (retirada/transporte) — vinculados à conta do responsável financeiro
    const autorizadosToInsert = [];
    (solicitacao.autorizados || []).forEach((a, i) => {
      if (a.nome?.trim()) {
        autorizadosToInsert.push({
          family_id: solicitacao.family_id,
          school_id: solicitacao.school_id,
          name: a.nome,
          relation: a.parentesco || 'Autorizado',
          has_photo: false,
          emergency_order: 2 + i,
        });
      }
    });
    const transporteOrderStart = 2 + autorizadosToInsert.length;
    (solicitacao.transporte_autorizados || []).forEach((t, i) => {
      if (t.nome?.trim()) {
        autorizadosToInsert.push({
          family_id: solicitacao.family_id,
          school_id: solicitacao.school_id,
          name: t.nome,
          relation: 'Transporte',
          has_photo: false,
          emergency_order: transporteOrderStart + i,
        });
      }
    });
    if (autorizadosToInsert.length > 0) {
      const { error: autorizadosError } = await supabase.from('authorized_persons').insert(autorizadosToInsert);
      if (autorizadosError) throw new Error(`Autorizados: ${autorizadosError.message}`);
    }

    return { segundoCredentials };
  };

  const handleDecide = async (solicitacao, status, reason) => {
    setDecidingId(solicitacao.id);
    try {
      let segundoCredentials = null;
      if (status === 'approved') {
        const result = await convertSolicitacaoToRecords(solicitacao);
        segundoCredentials = result.segundoCredentials;
      }

      const patch = {
        status,
        reviewed_by: currentUser.id,
        reviewed_at: new Date().toISOString(),
        rejection_reason: status === 'rejected' ? (reason || null) : null,
        updated_at: new Date().toISOString(),
      };
      const { error: updateError } = await supabase.from('matricula_solicitacoes').update(patch).eq('id', solicitacao.id);
      if (updateError) throw updateError;

      setSolicitacoes(prev => prev.map(s => (s.id === solicitacao.id ? { ...s, ...patch } : s)));
      if (segundoCredentials) setNewGuardianCredentials(segundoCredentials);

      const criancasNomes = (solicitacao.criancas || []).map(c => c.nome).join(', ');
      notifyFamilies({
        type: 'matricula',
        title: status === 'approved' ? 'Matrícula aprovada!' : 'Matrícula não aprovada',
        message: status === 'approved'
          ? `A matrícula de ${criancasNomes} foi aprovada.`
          : `A solicitação de matrícula de ${criancasNomes} não foi aprovada.${reason ? ` Motivo: ${reason}` : ''}`,
        url: '/?tab=matriculas',
        familyIds: [solicitacao.family_id],
      });
    } catch (err) {
      console.error('[AdminMatriculas] Erro ao decidir solicitação:', err);
      setError(status === 'approved'
        ? `Não foi possível concluir a aprovação: ${err.message || 'erro desconhecido'}. Nada foi notificado — confira o que já foi criado antes de tentar de novo.`
        : 'Não foi possível registrar a decisão.');
    } finally {
      setDecidingId(null);
    }
  };

  const filtered = solicitacoes.filter(s => s.status === tab);
  const pendingCount = solicitacoes.filter(s => s.status === 'pending').length;

  return (
    <div className="h-full flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 p-5 sm:p-6 border-b border-slate-100 shrink-0">
        <div className="bg-indigo-50 p-2.5 rounded-xl text-indigo-600">
          <FileText size={22} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">Matrículas</h2>
          <p className="text-slate-500 text-sm hidden sm:block">Visualize e gerencie as matrículas preenchidas pelos responsáveis.</p>
        </div>
      </div>

      <div className="flex gap-2 px-5 sm:px-6 pt-4 shrink-0">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              tab === t.key ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            {t.label}
            {t.key === 'pending' && pendingCount > 0 && (
              <span className={`text-[10px] px-1.5 rounded-full ${tab === t.key ? 'bg-white/20' : 'bg-indigo-600 text-white'}`}>{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-3">
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-sm font-medium">{error}</div>
        )}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <FileText className="mx-auto h-12 w-12 text-slate-300 mb-3" />
            <p className="text-sm font-semibold text-slate-600">Nenhuma solicitação {TABS.find(t => t.key === tab)?.label.toLowerCase()}.</p>
          </div>
        ) : (
          filtered.map(s => (
            <SolicitacaoCard key={s.id} solicitacao={s} onDecide={handleDecide} isDeciding={decidingId === s.id} />
          ))
        )}
      </div>

      {newGuardianCredentials && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 relative">
            <div className="mx-auto w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
              <KeyRound size={24} />
            </div>
            <h3 className="text-xl font-bold text-center text-slate-800 mb-2">Acesso do 2º Responsável criado!</h3>
            <p className="text-sm text-center text-slate-500 mb-6">
              Compartilhe essas credenciais com {newGuardianCredentials.name} para que ele(a) acesse o portal.
            </p>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 space-y-2">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-0.5 text-sm">
                <span className="font-semibold text-slate-500 shrink-0">E-mail:</span>
                <span className="font-bold text-slate-800 break-all sm:text-right">{newGuardianCredentials.email}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="font-semibold text-slate-500">Senha:</span>
                <span className="font-bold text-slate-800">{newGuardianCredentials.password}</span>
              </div>
            </div>
            <div className="flex items-start gap-2 bg-yellow-50 text-yellow-800 p-3 rounded-lg text-xs mb-6 border border-yellow-200/50">
              <span className="text-lg">⚠️</span>
              <p><strong>Guarde essas informações agora.</strong> Por segurança, a senha não será exibida novamente.</p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`Acesso Portal Zela\nE-mail: ${newGuardianCredentials.email}\nSenha: ${newGuardianCredentials.password}`);
                }}
                className="w-full py-3 bg-indigo-50 text-indigo-700 font-bold rounded-xl hover:bg-indigo-100 transition flex items-center justify-center gap-2"
              >
                <Copy size={16} /> Copiar credenciais
              </button>
              <button onClick={() => setNewGuardianCredentials(null)} className="w-full py-3 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-900 transition">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
