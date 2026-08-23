import React, { useEffect, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import MitigacaoReportEditor from './MitigacaoReportEditor';

// RLS já garante que só vêm relatórios PUBLICADOS dos próprios filhos.
export default function FamilyMitigacao({ currentUser, currentSchool }) {
  const schoolId = currentSchool?.id || currentUser?.school_id;

  const [reports, setReports] = useState([]);
  const [students, setStudents] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [activeReport, setActiveReport] = useState(null);

  useEffect(() => {
    if (!schoolId) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const { data: reportsData, error } = await supabase
        .from('mitigacao_reports')
        .select('*')
        .eq('school_id', schoolId)
        .order('published_at', { ascending: false });
      if (cancelled) return;
      if (!error) {
        setReports(reportsData || []);
        const studentIds = [...new Set((reportsData || []).map(r => r.student_id))];
        if (studentIds.length > 0) {
          const { data: studentsData } = await supabase.from('students').select('id, name, turma, birth_date').in('id', studentIds);
          setStudents(Object.fromEntries((studentsData || []).map(s => [s.id, s])));
        }
      }
      setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [schoolId]);

  const formatDate = (dateStr) => dateStr ? new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

  // Marca como lido (upsert) assim que o responsável abre o relatório.
  const openReport = (report) => {
    setActiveReport(report);
    supabase
      .from('mitigacao_report_reads')
      .upsert({ report_id: report.id, family_user_id: currentUser.id }, { onConflict: 'report_id,family_user_id' })
      .then(({ error }) => { if (error) console.warn('[FamilyMitigacao] Falha ao marcar leitura:', error.message); });
  };

  if (activeReport) {
    return (
      <MitigacaoReportEditor
        report={activeReport}
        student={students[activeReport.student_id]}
        school={currentSchool}
        onBack={() => setActiveReport(null)}
        canEdit={false}
        canPublish={false}
        canPrint
        readOnly
      />
    );
  }

  return (
    <div className="h-full flex flex-col bg-white rounded-zela-xl border border-outline-variant shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 p-5 sm:p-6 border-b border-outline-variant shrink-0">
        <div className="bg-primary/10 p-2.5 rounded-zela-md text-primary">
          <FileText size={22} />
        </div>
        <div>
          <h2 className="text-h3 text-on-surface">Mitigação</h2>
          <p className="text-on-surface-variant text-small hidden sm:block">Relatório de Mitigação do seu filho.</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant/70">
            <FileText className="mx-auto h-12 w-12 text-outline-variant mb-3" />
            <p className="text-sm font-semibold text-on-surface-variant">Nenhum relatório publicado ainda.</p>
          </div>
        ) : (
          reports.map(r => {
            const student = students[r.student_id];
            return (
              <button
                key={r.id}
                onClick={() => openReport(r)}
                className="w-full flex items-center gap-3 p-4 bg-white border border-outline-variant hover:border-primary/40 hover:bg-primary/5 rounded-zela-lg transition text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-on-surface text-sm truncate">{student?.name}</p>
                  <p className="text-on-surface-variant/70 text-xs mt-0.5">Publicado em {formatDate(r.published_at)}</p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
