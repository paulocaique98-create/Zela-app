import React, { useEffect, useState } from 'react';
import { FileText, Loader2, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';

function formatDate(dateStr) {
  return dateStr ? new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
}

export default function FamilyRelatorios({ currentUser, currentSchool }) {
  const schoolId = currentSchool?.id || currentUser?.school_id;

  // RLS já garante que só vêm relatórios PUBLICADOS dos próprios filhos — não
  // precisa filtrar por lista de alunos aqui, o banco faz isso sozinho.
  const [reports, setReports] = useState([]);
  const [readIds, setReadIds] = useState(new Set());
  const [studentsById, setStudentsById] = useState(new Map());
  const [isLoadingList, setIsLoadingList] = useState(true);

  const [activeReport, setActiveReport] = useState(null);
  const [sections, setSections] = useState([]);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [error, setError] = useState('');

  const fetchList = async () => {
    if (!schoolId || !currentUser?.id) return;
    setIsLoadingList(true);
    try {
      const { data: reportsData, error: reportsError } = await supabase
        .from('reports')
        .select('*')
        .eq('school_id', schoolId)
        .order('published_at', { ascending: false });
      if (reportsError) throw reportsError;
      setReports(reportsData || []);

      const studentIds = [...new Set((reportsData || []).map(r => r.student_id))];
      if (studentIds.length > 0) {
        const { data: studentsData } = await supabase.from('students').select('id, name').in('id', studentIds);
        setStudentsById(new Map((studentsData || []).map(s => [s.id, s])));
      }

      const { data: readsData } = await supabase.from('report_reads').select('report_id').eq('family_user_id', currentUser.id);
      setReadIds(new Set((readsData || []).map(r => r.report_id)));
    } catch (err) {
      console.error('[FamilyRelatorios] Erro ao buscar relatórios:', err);
    } finally {
      setIsLoadingList(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, [schoolId, currentUser?.id]);

  const openReport = async (report) => {
    setActiveReport(report);
    setIsLoadingReport(true);
    setError('');
    try {
      const { data: reportSections, error: sectionsError } = await supabase
        .from('report_sections')
        .select('*')
        .eq('report_id', report.id)
        .order('sort_order', { ascending: true });
      if (sectionsError) throw sectionsError;
      setSections(reportSections || []);

      if (!readIds.has(report.id)) {
        const { error: readError } = await supabase
          .from('report_reads')
          .upsert({ report_id: report.id, family_user_id: currentUser.id }, { onConflict: 'report_id,family_user_id' });
        if (readError) console.warn('[FamilyRelatorios] Falha ao marcar como lido:', readError);
        else setReadIds(prev => new Set(prev).add(report.id));
      }
    } catch (err) {
      console.error('[FamilyRelatorios] Erro ao abrir relatório:', err);
      setError('Não foi possível abrir este relatório.');
    } finally {
      setIsLoadingReport(false);
    }
  };

  const closeReport = () => {
    setActiveReport(null);
    setSections([]);
  };

  if (activeReport) {
    const student = studentsById.get(activeReport.student_id);
    return (
      <div className="h-full flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 p-4 sm:p-5 border-b border-slate-100 shrink-0">
          <button onClick={closeReport} className="p-2 -ml-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition shrink-0">
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-slate-800 truncate">{activeReport.title}</h2>
            <p className="text-xs text-slate-400">{student?.name}{activeReport.reference_period ? ` · ${activeReport.reference_period}` : ''} · Publicado em {formatDate(activeReport.published_at)}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {isLoadingReport ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-sm font-medium">{error}</div>
          ) : (
            sections.map(s => (
              <div key={s.id}>
                <h3 className="font-bold text-slate-800 text-sm mb-1.5">{s.title}</h3>
                <p className="text-slate-600 text-sm whitespace-pre-wrap leading-relaxed">{s.content || 'Sem observações registradas nesta seção.'}</p>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 p-5 sm:p-6 border-b border-slate-100 shrink-0">
        <div className="bg-indigo-50 p-2.5 rounded-xl text-indigo-600">
          <FileText size={22} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">Relatórios</h2>
          <p className="text-slate-500 text-sm hidden sm:block">Relatórios de Desempenho e Evolução do seu filho.</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-2">
        {isLoadingList ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <FileText className="mx-auto h-12 w-12 text-slate-300 mb-3" />
            <p className="text-sm font-semibold text-slate-600">Nenhum relatório publicado ainda.</p>
          </div>
        ) : (
          reports.map(r => {
            const student = studentsById.get(r.student_id);
            const unread = !readIds.has(r.id);
            return (
              <button
                key={r.id}
                onClick={() => openReport(r)}
                className="w-full flex items-center gap-3 p-4 bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 rounded-2xl transition text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className={`text-sm truncate ${unread ? 'font-black text-slate-800' : 'font-bold text-slate-700'}`}>{r.title}</p>
                  <p className="text-slate-400 text-xs mt-0.5">{student?.name} · Publicado em {formatDate(r.published_at)}</p>
                </div>
                {unread && <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 shrink-0" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
