import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Loader2, Search, Archive, Trash2, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import MitigacaoReportEditor from './MitigacaoReportEditor';
import ConfirmModal from './ConfirmModal';
import { logAction } from '../lib/auditLog';

const STATUS_BADGE = {
  RASCUNHO: 'bg-surface-container text-on-surface-variant border-outline-variant',
  PUBLICADO: 'bg-success/10 text-success border-success/40',
  ARQUIVADO: 'bg-brass-50 text-warning border-warning/40',
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
  // turmaFilter guarda o VALOR da turma selecionada (pode ser null/"" pra
  // turmas sem nome cadastrado) — turmaFilterActive é quem diz se HÁ uma
  // seleção ativa, pra não confundir "nenhum filtro" com "filtro = turma vazia"
  // (um `turmaFilter &&` sozinho escondia o botão "Gerar turma" quando a turma
  // selecionada tinha nome vazio/nulo).
  const [turmaFilter, setTurmaFilter] = useState(null);
  const [turmaFilterActive, setTurmaFilterActive] = useState(false);

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
    const student = studentsById.get(reports.find(r => r.id === id)?.student_id);
    setIsProcessingId(id);
    try {
      const { error: deleteError } = await supabase.from('mitigacao_reports').delete().eq('id', id);
      if (deleteError) throw deleteError;
      logAction({
        schoolId,
        actorId: currentUser?.id,
        action: 'delete',
        entityType: 'mitigacao_report',
        entityId: id,
        details: { student_name: student?.name },
      });
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

  // Resumo por turma: quantos alunos já têm relatório em rascunho/publicado,
  // e quantos ainda não têm nenhum — ajuda a coordenação a ver rapidamente
  // quem falta antes do fim do semestre.
  const turmaSummary = useMemo(() => {
    const byTurma = new Map();
    students.forEach(s => {
      if (!byTurma.has(s.turma)) byTurma.set(s.turma, { turma: s.turma, totalAlunos: 0, rascunho: 0, publicado: 0, arquivado: 0, semRelatorio: 0 });
      byTurma.get(s.turma).totalAlunos += 1;
    });
    const reportedStudentIds = new Set();
    reports.forEach(r => {
      const student = studentsById.get(r.student_id);
      if (!student) return;
      const entry = byTurma.get(student.turma);
      if (!entry) return;
      if (r.status === 'RASCUNHO') entry.rascunho += 1;
      else if (r.status === 'PUBLICADO') entry.publicado += 1;
      else if (r.status === 'ARQUIVADO') entry.arquivado += 1;
      reportedStudentIds.add(student.id);
    });
    students.forEach(s => {
      if (!reportedStudentIds.has(s.id)) byTurma.get(s.turma).semRelatorio += 1;
    });
    // Aluno sem turma (turma vazia) quebrava a ordenação e derrubava a tela
    // (registro de erros, 27/09/2026). "Sem turma" vai por último.
    return [...byTurma.values()].sort((a, b) => {
      if (!a.turma || !b.turma) return (a.turma ? 0 : 1) - (b.turma ? 0 : 1);
      return a.turma.localeCompare(b.turma);
    });
  }, [students, reports, studentsById]);

  const filteredReports = reports.filter(r => {
    const student = studentsById.get(r.student_id);
    if (turmaFilterActive && student?.turma !== turmaFilter) return false;
    if (!searchTerm.trim()) return true;
    return student?.name?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  if (activeReport) {
    const student = studentsById.get(activeReport.student_id);
    return (
      <MitigacaoReportEditor
        report={activeReport}
        student={student}
        school={currentSchool}
        currentUser={currentUser}
        onBack={closeReport}
        canEdit={canEditPermission}
        canPublish={canEditPermission}
        canPrint
      />
    );
  }

  return (
    <div className="h-full flex flex-col bg-white -m-3 sm:m-0 rounded-none sm:rounded-zela-xl border-0 sm:border sm:border-outline-variant md:rounded-none md:shadow-none md:border-0 shadow-none sm:shadow-sm overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 sm:p-6 sm:border-b border-outline-variant shrink-0">
        <div className="hidden sm:flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="bg-primary/10 p-2.5 rounded-zela-md text-primary shrink-0">
              <FileText size={22} />
            </div>
            <div className="min-w-0">
              <h2 className="text-h3 text-on-surface">Mitigação</h2>
              <p className="text-on-surface-variant text-small hidden sm:block">
                {canEditPermission ? 'Revise, edite e publique os relatórios preenchidos pelas professoras.' : 'Acompanhamento dos relatórios de Mitigação da escola.'}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {reports.length > 0 && (
            <div className="relative flex-1 sm:flex-none">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant/70" />
              <input
                type="text"
                placeholder="Buscar por aluno..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9 pr-3 h-10 sm:h-auto sm:py-2.5 bg-surface-container-lowest border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary text-sm w-full sm:w-64"
              />
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-1 sm:p-6 space-y-2">
        {error && (
          <div className="bg-error/10 border border-error/30 text-error p-3 rounded-zela-md text-sm font-medium mb-2">{error}</div>
        )}

        {!isLoading && turmaSummary.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-4">
            {turmaSummary.map(t => {
              const isSelected = turmaFilterActive && turmaFilter === t.turma;
              return (
              <button
                key={t.turma || '(sem-turma)'}
                type="button"
                onClick={() => {
                  if (isSelected) { setTurmaFilterActive(false); setTurmaFilter(null); }
                  else { setTurmaFilterActive(true); setTurmaFilter(t.turma); }
                }}
                className={`relative text-left p-3 rounded-zela-lg border transition ${isSelected ? 'border-primary bg-primary/10 ring-1 ring-primary' : t.rascunho > 0 ? 'border-warning/60 bg-warning/5 hover:border-warning' : 'border-outline-variant bg-surface-container-lowest hover:border-primary/40'}`}
              >
                {t.rascunho > 0 && (
                  <span className="absolute top-2 right-2 text-warning" title="Há rascunhos nesta turma" aria-label="Há rascunhos nesta turma"><AlertTriangle size={16} /></span>
                )}
                <p className={`text-sm font-bold text-on-surface leading-tight ${t.rascunho > 0 ? 'pr-5' : ''}`}>{t.turma || 'Sem turma'}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-sm bg-success/10 text-success">{t.publicado} publicado{t.publicado !== 1 ? 's' : ''}</span>
                  <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-sm ${t.rascunho > 0 ? 'bg-warning/15 text-warning' : 'bg-surface-container text-on-surface-variant'}`}>{t.rascunho} rascunho{t.rascunho !== 1 ? 's' : ''}</span>
                </div>
                {t.semRelatorio > 0 && (
                  <p className="text-xs text-warning font-bold mt-2">{t.semRelatorio} sem relatório</p>
                )}
              </button>
              );
            })}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant/70">
            <FileText className="mx-auto h-12 w-12 text-outline-variant mb-3" />
            <p className="text-sm font-semibold text-on-surface-variant">
              {reports.length === 0 ? 'Nenhuma professora criou um relatório ainda.' : 'Nenhum resultado encontrado.'}
            </p>
          </div>
        ) : (
          filteredReports.map(r => {
            const student = studentsById.get(r.student_id);
            return (
              <div
                key={r.id}
                className="w-full flex items-center gap-2 p-4 bg-white border border-outline-variant hover:border-primary/40 hover:bg-primary/5 rounded-zela-lg transition"
              >
                <button
                  onClick={() => setActiveReport(r)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="font-bold text-on-surface text-sm">{student?.name || 'Aluno removido'}</p>
                    <span className={`text-[11px] font-extrabold px-1.5 py-0.5 rounded-md border shrink-0 ${STATUS_BADGE[r.status]}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                  </div>
                  <p className="text-on-surface-variant/70 text-xs mt-0.5">
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
                        className="p-2 text-on-surface-variant/70 hover:text-warning hover:bg-brass-50 rounded-lg transition disabled:opacity-50"
                      >
                        {isProcessingId === r.id ? <Loader2 size={16} className="animate-spin" /> : <Archive size={16} />}
                      </button>
                    )}
                    <button
                      onClick={() => setConfirmDeleteId(r.id)}
                      disabled={isProcessingId === r.id}
                      title="Excluir relatório"
                      className="p-2 text-on-surface-variant/70 hover:text-error hover:bg-error/10 rounded-lg transition disabled:opacity-50"
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
