import React, { useEffect, useState } from 'react';
import { FileText, Loader2, Search, Archive, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import MitigacaoReportEditor from './MitigacaoReportEditor';
import ConfirmModal from './ConfirmModal';

const STATUS_BADGE = {
  RASCUNHO: 'bg-slate-100 text-slate-600 border-slate-200',
  PUBLICADO: 'bg-green-50 text-green-700 border-green-200',
  ARQUIVADO: 'bg-amber-50 text-amber-700 border-amber-200',
};
const STATUS_LABEL = { RASCUNHO: 'Rascunho', PUBLICADO: 'Publicado', ARQUIVADO: 'Arquivado' };

// Coordenação e Direção Pedagógica revisam/editam/publicam — nunca criam um
// relatório do zero (é sempre a professora quem inicia). A RLS já bloqueia a
// escrita pra quem não tem esse departamento; aqui só refletimos isso na UI.
const DEPARTAMENTOS_EDITORES = ['coordenacao', 'diretoria_pedagogica'];

export default function AdminMitigacao({ currentUser, currentSchool }) {
  const schoolId = currentSchool?.id || currentUser?.school_id;
  const canEditPermission = DEPARTAMENTOS_EDITORES.includes(currentUser?.departamento);

  const [reports, setReports] = useState([]);
  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeReport, setActiveReport] = useState(null);
  const [confirmArchiveId, setConfirmArchiveId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [isProcessingId, setIsProcessingId] = useState(null);

  const studentsById = new Map(students.map(s => [s.id, s]));

  const fetchAll = async () => {
    if (!schoolId) return;
    setIsLoading(true);
    setError('');
    try {
      const [reportsRes, studentsRes] = await Promise.all([
        supabase.from('mitigacao_reports').select('*').eq('school_id', schoolId).order('updated_at', { ascending: false }).limit(300),
        supabase.from('students').select('id, name, turma, birth_date').eq('school_id', schoolId).order('name', { ascending: true }),
      ]);
      if (reportsRes.error) throw reportsRes.error;
      if (studentsRes.error) throw studentsRes.error;
      setReports(reportsRes.data || []);
      setStudents(studentsRes.data || []);
    } catch (err) {
      console.error('[AdminMitigacao] Erro ao buscar dados:', err);
      setError('Não foi possível carregar os relatórios.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [schoolId]);

  const closeReport = () => {
    setActiveReport(null);
    fetchAll();
  };

  const confirmArchive = async () => {
    const id = confirmArchiveId;
    setIsProcessingId(id);
    try {
      const { error: updateError } = await supabase.from('mitigacao_reports').update({ status: 'ARQUIVADO' }).eq('id', id);
      if (updateError) throw updateError;
      await fetchAll();
    } catch (err) {
      console.error('[AdminMitigacao] Erro ao arquivar:', err);
      setError('Não foi possível arquivar o relatório.');
    } finally {
      setIsProcessingId(null);
      setConfirmArchiveId(null);
    }
  };

  const confirmDelete = async () => {
    const id = confirmDeleteId;
    setIsProcessingId(id);
    try {
      const { error: deleteError } = await supabase.from('mitigacao_reports').delete().eq('id', id);
      if (deleteError) throw deleteError;
      await fetchAll();
    } catch (err) {
      console.error('[AdminMitigacao] Erro ao excluir:', err);
      setError('Não foi possível excluir o relatório.');
    } finally {
      setIsProcessingId(null);
      setConfirmDeleteId(null);
    }
  };

  const formatDate = (dateStr) => dateStr ? new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

  const filteredReports = reports.filter(r => {
    if (!searchTerm.trim()) return true;
    const student = studentsById.get(r.student_id);
    return student?.name?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  if (activeReport) {
    const student = studentsById.get(activeReport.student_id);
    return (
      <MitigacaoReportEditor
        report={activeReport}
        student={student}
        onBack={closeReport}
        canEdit={canEditPermission}
        canPublish={canEditPermission}
      />
    );
  }

  return (
    <div className="h-full flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 sm:p-6 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-50 p-2.5 rounded-xl text-indigo-600">
            <FileText size={22} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Mitigação</h2>
            <p className="text-slate-500 text-sm hidden sm:block">
              {canEditPermission ? 'Revise, edite e publique os relatórios preenchidos pelas professoras.' : 'Acompanhamento dos relatórios de Mitigação da escola.'}
            </p>
          </div>
        </div>
        {reports.length > 0 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por aluno..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm w-full sm:w-64"
            />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-2">
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-sm font-medium mb-2">{error}</div>
        )}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <FileText className="mx-auto h-12 w-12 text-slate-300 mb-3" />
            <p className="text-sm font-semibold text-slate-600">
              {reports.length === 0 ? 'Nenhuma professora criou um relatório ainda.' : 'Nenhum resultado encontrado.'}
            </p>
          </div>
        ) : (
          filteredReports.map(r => {
            const student = studentsById.get(r.student_id);
            return (
              <div
                key={r.id}
                className="w-full flex items-center gap-2 p-4 bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 rounded-2xl transition"
              >
                <button
                  onClick={() => setActiveReport(r)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="font-bold text-slate-800 text-sm truncate">{student?.name || 'Aluno removido'}</p>
                    <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md border shrink-0 ${STATUS_BADGE[r.status]}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                  </div>
                  <p className="text-slate-400 text-xs mt-0.5">
                    {student?.turma} · Etapa {r.current_step}/8 · Atualizado em {formatDate(r.updated_at)}
                  </p>
                </button>
                {canEditPermission && (
                  <div className="flex items-center gap-1 shrink-0">
                    {r.status !== 'ARQUIVADO' && (
                      <button
                        onClick={() => setConfirmArchiveId(r.id)}
                        disabled={isProcessingId === r.id}
                        title="Arquivar relatório"
                        className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition disabled:opacity-50"
                      >
                        {isProcessingId === r.id ? <Loader2 size={16} className="animate-spin" /> : <Archive size={16} />}
                      </button>
                    )}
                    <button
                      onClick={() => setConfirmDeleteId(r.id)}
                      disabled={isProcessingId === r.id}
                      title="Excluir relatório"
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {confirmArchiveId && (
        <ConfirmModal
          title="Arquivar relatório"
          message="Arquivar este relatório? Ele deixa de ficar disponível para a família."
          danger={false}
          isLoading={isProcessingId === confirmArchiveId}
          onConfirm={confirmArchive}
          onCancel={() => setConfirmArchiveId(null)}
        />
      )}

      {confirmDeleteId && (
        <ConfirmModal
          title="Excluir relatório"
          message="Excluir este relatório permanentemente? Essa ação não pode ser desfeita."
          isLoading={isProcessingId === confirmDeleteId}
          onConfirm={confirmDelete}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}
