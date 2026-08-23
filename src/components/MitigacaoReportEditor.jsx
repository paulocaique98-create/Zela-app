import React, { useState } from 'react';
import { ArrowLeft, Check, Loader2, Lock, Pencil, Send, Archive, FileDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { MITIGACAO_SECTIONS, calcIdade, buildIntroducaoText } from '../lib/mitigacaoSections';
import { printMitigacaoReport } from '../lib/printMitigacao';
import { notifyFamilies } from '../lib/notifyFamilies';
import { logAction } from '../lib/auditLog';

const STATUS_LABEL = {
  RASCUNHO: { label: 'Rascunho', color: 'bg-slate-100 text-slate-600 border-slate-200' },
  PUBLICADO: { label: 'Publicado', color: 'bg-green-50 text-green-700 border-green-200' },
  ARQUIVADO: { label: 'Arquivado', color: 'bg-amber-50 text-amber-700 border-amber-200' },
};

function formatDate(dateStr) {
  return dateStr ? new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
}

// Editor compartilhado do Relatório de Mitigação — usado pela Professora
// (preenche em sequência bloqueada), Coordenação/Direção (edita/publica) e
// Família (somente leitura, só quando publicado). O controle de quem pode
// fazer o quê fica inteiramente nas props (canEdit/canPublish) — a validação
// de verdade é sempre a RLS no banco.
export default function MitigacaoReportEditor({ report, student, school, currentUser, onBack, onSaved, canEdit, canPublish, readOnly, canPrint }) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(MITIGACAO_SECTIONS.map(s => [s.key, report[s.key] || '']))
  );
  const [currentStep, setCurrentStep] = useState(report.current_step || 1);
  const [status, setStatus] = useState(report.status);
  const [expandedKey, setExpandedKey] = useState(MITIGACAO_SECTIONS[Math.min(currentStep, MITIGACAO_SECTIONS.length) - 1]?.key || null);
  const [savingKey, setSavingKey] = useState(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState('');

  const isDraft = status === 'RASCUNHO';
  const statusInfo = STATUS_LABEL[status] || STATUS_LABEL.RASCUNHO;
  const allStepsFilled = currentStep >= MITIGACAO_SECTIONS.length && (values[MITIGACAO_SECTIONS[MITIGACAO_SECTIONS.length - 1].key] || '').trim() !== '';

  const handleSaveSection = async (sectionIndex) => {
    const section = MITIGACAO_SECTIONS[sectionIndex];
    setSavingKey(section.key);
    setError('');
    try {
      const isAdvancing = (sectionIndex + 1) === currentStep && currentStep < MITIGACAO_SECTIONS.length;
      const updates = { [section.key]: values[section.key], updated_at: new Date().toISOString() };
      if (isAdvancing) updates.current_step = currentStep + 1;

      const { error: updateError } = await supabase.from('mitigacao_reports').update(updates).eq('id', report.id);
      if (updateError) throw updateError;

      if (isAdvancing) {
        setCurrentStep(currentStep + 1);
        setExpandedKey(MITIGACAO_SECTIONS[sectionIndex + 1]?.key || section.key);
      }
    } catch (err) {
      console.error('[MitigacaoReportEditor] Erro ao salvar seção:', err);
      setError('Não foi possível salvar. Tente novamente.');
    } finally {
      setSavingKey(null);
    }
  };

  const handlePublish = async () => {
    setIsPublishing(true);
    setError('');
    try {
      const { error: updateError } = await supabase
        .from('mitigacao_reports')
        .update({ status: 'PUBLICADO', published_at: new Date().toISOString() })
        .eq('id', report.id);
      if (updateError) throw updateError;
      setStatus('PUBLICADO');

      logAction({
        schoolId: report.school_id,
        actorId: currentUser?.id,
        action: 'publish',
        entityType: 'mitigacao_report',
        entityId: report.id,
        details: { student_name: student?.name },
      });

      const { data: guardianLinks } = await supabase.from('student_guardians').select('guardian_id').eq('student_id', report.student_id);
      const { data: directStudent } = await supabase.from('students').select('family_id').eq('id', report.student_id).single();
      const familyIds = [...new Set([...(guardianLinks || []).map(g => g.guardian_id), directStudent?.family_id].filter(Boolean))];
      notifyFamilies({
        type: 'relatorio',
        title: 'Novo relatório disponível',
        message: `Relatório de Mitigação${student ? ` — ${student.name}` : ''}`,
        url: '/?tab=relatorios',
        familyIds,
      });
    } catch (err) {
      console.error('[MitigacaoReportEditor] Erro ao publicar:', err);
      setError('Não foi possível publicar o relatório.');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleArchive = async () => {
    setIsPublishing(true);
    setError('');
    try {
      const { error: updateError } = await supabase.from('mitigacao_reports').update({ status: 'ARQUIVADO' }).eq('id', report.id);
      if (updateError) throw updateError;
      setStatus('ARQUIVADO');
      logAction({
        schoolId: report.school_id,
        actorId: currentUser?.id,
        action: 'archive',
        entityType: 'mitigacao_report',
        entityId: report.id,
        details: { student_name: student?.name },
      });
    } catch (err) {
      console.error('[MitigacaoReportEditor] Erro ao arquivar:', err);
      setError('Não foi possível arquivar o relatório.');
    } finally {
      setIsPublishing(false);
    }
  };

  const handlePrint = () => {
    printMitigacaoReport({ report, student, school, sectionValues: values });
  };

  return (
    <div className="h-full flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 p-4 sm:p-5 border-b border-slate-100 shrink-0">
        <button onClick={onBack} className="p-2 -ml-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition shrink-0">
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-slate-800">Relatório de Mitigação</h2>
          <p className="text-xs text-slate-400">{student?.name}</p>
        </div>
        {canPrint && (
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-3 py-2 rounded-xl transition text-xs shrink-0"
          >
            <FileDown size={15} /> Gerar Relatório
          </button>
        )}
        <span className={`text-[10px] font-extrabold uppercase px-2 py-1 rounded-md border shrink-0 ${statusInfo.color}`}>
          {statusInfo.label}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
        {/* Cabeçalho no formato do modelo em PDF */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50 border border-slate-200 rounded-2xl p-4">
          <div><span className="text-[10px] font-bold text-slate-400 uppercase">Nome</span><p className="text-sm font-semibold text-slate-700">{student?.name}</p></div>
          <div><span className="text-[10px] font-bold text-slate-400 uppercase">Data</span><p className="text-sm font-semibold text-slate-700">{formatDate(report.created_at)}</p></div>
          <div><span className="text-[10px] font-bold text-slate-400 uppercase">Turma</span><p className="text-sm font-semibold text-slate-700">{student?.turma}</p></div>
          <div><span className="text-[10px] font-bold text-slate-400 uppercase">Idade</span><p className="text-sm font-semibold text-slate-700">{calcIdade(student?.birth_date)}</p></div>
          <div className="sm:col-span-2"><span className="text-[10px] font-bold text-slate-400 uppercase">Guia Responsável</span><p className="text-sm font-semibold text-slate-700">{report.guia_responsavel}</p></div>
          {report.reference_period && (
            <div className="sm:col-span-2"><span className="text-[10px] font-bold text-slate-400 uppercase">Período</span><p className="text-sm font-semibold text-slate-700">{report.reference_period}</p></div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 p-2.5 rounded-xl text-xs font-medium">{error}</div>
        )}

        {/* Introdução — texto padrão do modelo, fixo e não editável */}
        <div className="border border-slate-200 rounded-2xl p-4 bg-white">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Introdução</span>
          <p className="text-sm text-slate-600 whitespace-pre-line mt-1.5 leading-relaxed">
            {buildIntroducaoText(student?.name, report.reference_period)}
          </p>
        </div>

        {/* Seções em sequência bloqueada — só a seção corrente fica editável;
            as anteriores já salvas podem ser reabertas pra ajuste; as
            seguintes ficam trancadas até a anterior ser salva. */}
        {MITIGACAO_SECTIONS.map((section, index) => {
          const stepNumber = index + 1;
          const isUnlocked = stepNumber <= currentStep;
          const isExpanded = expandedKey === section.key && isUnlocked;
          const sectionEditable = canEdit && !readOnly && isDraft && isUnlocked;

          return (
            <div key={section.key} className={`border rounded-2xl overflow-hidden transition-colors ${isUnlocked ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50'}`}>
              <div
                onClick={() => isUnlocked && setExpandedKey(isExpanded ? null : section.key)}
                className={`w-full flex items-center justify-between gap-3 px-4 py-3 ${isUnlocked ? 'cursor-pointer hover:bg-slate-50' : 'cursor-not-allowed'}`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black shrink-0 ${isUnlocked ? (values[section.key]?.trim() ? 'bg-green-100 text-green-700' : 'bg-indigo-100 text-indigo-700') : 'bg-slate-200 text-slate-400'}`}>
                    {isUnlocked && values[section.key]?.trim() ? <Check size={13} /> : stepNumber}
                  </span>
                  <span className={`text-sm font-bold ${isUnlocked ? 'text-slate-800' : 'text-slate-400'}`}>{section.label}</span>
                </div>
                {!isUnlocked && <Lock size={14} className="text-slate-300 shrink-0" />}
                {isUnlocked && sectionEditable && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setExpandedKey(section.key); }}
                    className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-2.5 py-1.5 rounded-lg transition shrink-0"
                  >
                    <Pencil size={13} /> Editar
                  </button>
                )}
              </div>

              {isExpanded && (
                <div className="px-4 pb-4 space-y-2">
                  <textarea
                    value={values[section.key]}
                    onChange={e => setValues(prev => ({ ...prev, [section.key]: e.target.value }))}
                    disabled={!sectionEditable}
                    rows={6}
                    placeholder={`Descreva ${section.label.toLowerCase()}...`}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700 text-sm resize-none disabled:opacity-70"
                  />
                  {sectionEditable && (
                    <button
                      onClick={() => handleSaveSection(index)}
                      disabled={savingKey === section.key || !values[section.key]?.trim()}
                      className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500 text-white font-bold py-2.5 px-4 rounded-xl transition text-sm"
                    >
                      {savingKey === section.key ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                      Salvar Rascunho
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {canPublish && isDraft && (
        <div className="p-4 sm:p-5 border-t border-slate-100 shrink-0">
          <button
            onClick={handlePublish}
            disabled={!allStepsFilled || isPublishing}
            title={!allStepsFilled ? 'Preencha todas as seções antes de publicar' : ''}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500 text-white font-bold py-3 rounded-xl transition text-sm"
          >
            {isPublishing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Publicar para a Família
          </button>
        </div>
      )}
      {canPublish && status === 'PUBLICADO' && (
        <div className="p-4 sm:p-5 border-t border-slate-100 shrink-0">
          <button
            onClick={handleArchive}
            disabled={isPublishing}
            className="flex items-center gap-2 text-slate-400 hover:text-amber-600 font-bold text-sm transition"
          >
            <Archive size={16} /> Arquivar
          </button>
        </div>
      )}
    </div>
  );
}
