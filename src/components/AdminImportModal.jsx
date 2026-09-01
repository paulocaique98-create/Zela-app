import React, { useState, useCallback, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { createPortal } from 'react-dom';
import {
  X, Upload, FileSpreadsheet, CheckCircle2, XCircle,
  Loader2, AlertTriangle, ArrowLeft, Play,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// ── Constantes ────────────────────────────────────────────────────────────────
const PERIODO_MAP = {
  '07:00 às 13:00': { entry: '07:00:00', exit: '13:00:00', hours: 6 },
  '07:00 às 15:00': { entry: '07:00:00', exit: '15:00:00', hours: 8 },
  '07:00 às 17:00': { entry: '07:00:00', exit: '17:00:00', hours: 10 },
  '09:00 às 19:00': { entry: '09:00:00', exit: '19:00:00', hours: 10 },
  '11:00 às 19:00': { entry: '11:00:00', exit: '19:00:00', hours: 8 },
  '13:00 às 19:00': { entry: '13:00:00', exit: '19:00:00', hours: 6 },
};

const EXAMPLE_EMAIL = 'maria.silva@email.com';

// ── Helpers ───────────────────────────────────────────────────────────────────
const getTurno = (entryTime) => {
  if (!entryTime) return null;
  const hour = parseInt(entryTime.split(':')[0], 10);
  return hour < 12 ? 'Matutino' : 'Vespertino';
};

/**
 * Lê o workbook e extrai as linhas de dados.
 * O cabeçalho é detectado dinamicamente (busca a coluna 'Nome Completo *').
 * Ignora linhas vazias, a linha de exemplo e linhas sem campos obrigatórios.
 */
const parseRows = (workbook) => {
  const sheetName = workbook.SheetNames[0];
  const ws = workbook.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Detectar índice do cabeçalho
  let headerRowIndex = -1;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].some((cell) => String(cell).trim() === 'Nome Completo *')) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    return {
      rows: [],
      error: 'Cabeçalho não encontrado. Verifique se o arquivo segue o modelo correto.',
    };
  }

  const headers = raw[headerRowIndex].map((h) => String(h).trim());
  const rows = [];

  for (let i = headerRowIndex + 1; i < raw.length; i++) {
    const rowArr = raw[i];
    // Pular linhas totalmente vazias
    if (!rowArr || rowArr.every((cell) => cell === '' || cell == null)) continue;

    const row = {};
    headers.forEach((h, idx) => {
      const val = rowArr[idx];
      row[h] = val !== undefined && val !== null ? String(val).trim() : '';
    });

    // Pular linha de exemplo
    if (row['E-mail *']?.toLowerCase() === EXAMPLE_EMAIL) continue;

    // Pular linhas sem campos obrigatórios
    if (
      !row['Nome Completo *'] ||
      !row['E-mail *'] ||
      !row['Senha *'] ||
      !row['Nome Aluno 1 *']
    ) continue;

    rows.push(row);
  }

  return { rows, error: null };
};

// ── StatusIcon ────────────────────────────────────────────────────────────────
function StatusIcon({ status }) {
  if (status === 'pending')
    return <div className="w-5 h-5 rounded-full border-2 border-slate-200 shrink-0" />;
  if (status === 'processing')
    return <Loader2 className="w-5 h-5 text-indigo-500 animate-spin shrink-0" />;
  if (status === 'success')
    return <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />;
  if (status === 'error')
    return <XCircle className="w-5 h-5 text-red-500 shrink-0" />;
  return null;
}

// ── Componente Principal ──────────────────────────────────────────────────────
export default function AdminImportModal({ currentUser, onClose, onImportComplete }) {
  const [step, setStep] = useState('upload'); // 'upload' | 'preview' | 'importing' | 'done'
  const [parsedRows, setParsedRows] = useState([]);
  const [parseError, setParseError] = useState('');
  const [fileName, setFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [results, setResults] = useState([]);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef(null);
  const resultsEndRef = useRef(null);

  // Auto-scroll durante importação
  useEffect(() => {
    if (step === 'importing') {
      resultsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [results, step]);

  // Fechar com Escape (exceto durante importação)
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape' && !isImporting) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isImporting, onClose]);

  // ── Processamento do arquivo ───────────────────────────────────────────────
  const processFile = useCallback((file) => {
    if (!file) return;
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setParseError('Formato inválido. Por favor, selecione um arquivo .xlsx ou .xls');
      return;
    }
    setParseError('');
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const { rows, error } = parseRows(workbook);
        if (error) { setParseError(error); return; }
        if (rows.length === 0) {
          setParseError('Nenhuma linha de dados válida encontrada. Verifique se o modelo está preenchido corretamente.');
          return;
        }
        setParsedRows(rows);
        setStep('preview');
      } catch (err) {
        setParseError('Erro ao processar o arquivo: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    processFile(e.dataTransfer.files[0]);
  }, [processFile]);

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleFileChange = (e) => processFile(e.target.files[0]);

  // ── Importação em lote (sequencial) ───────────────────────────────────────
  const handleImport = async () => {
    setIsImporting(true);
    setStep('importing');

    const initial = parsedRows.map((row) => ({
      name: row['Nome Completo *'],
      email: row['E-mail *'],
      secondName: row['2º Nome Completo']?.trim() || null,
      alunos: [row['Nome Aluno 1 *'], row['Nome Aluno 2'] || null]
        .filter(Boolean)
        .join(', '),
      status: 'pending',
      msg: '',
      error: null,
    }));
    setResults(initial);

    for (let i = 0; i < parsedRows.length; i++) {
      const row = parsedRows[i];

      // Marca como processando
      setResults((prev) =>
        prev.map((r, idx) => (idx === i ? { ...r, status: 'processing', msg: `Criando 1º Responsável: ${row['Nome Completo *']}...` } : r))
      );

      try {
        // ── 1. Criar usuário via Edge Function create-admin-user ──────────
        const { data: newUser, error: funcError } = await supabase.functions.invoke(
          'create-admin-user',
          {
            body: {
              email: row['E-mail *'].toLowerCase(),
              password: row['Senha *'],
              name: row['Nome Completo *'],
              role: 'family',
              school_id: currentUser.school_id,
              extra_fields: {
                phone: row['Telefone'] || null,
                doc_type: row['CPF'] ? 'CPF' : null,
                doc_number: row['CPF'] || null,
                guardian_type: row['Relação *'] || 'Responsável',
              },
            },
          }
        );

        if (funcError || !newUser || newUser.error) {
          const msg = funcError?.message || newUser?.error || 'Erro desconhecido';
          throw new Error(
            msg.includes('already registered')
              ? 'E-mail já cadastrado no sistema'
              : msg
          );
        }

        const userId = newUser.id;

        // ── 2a. Montar lista de alunos ────────────────────────────────────
        const studentsToInsert = [];

        // Aluno 1 (obrigatório)
        const p1 = row['Período Aluno 1 *'] || '';
        const pi1 = PERIODO_MAP[p1] || null;
        const ch1 =
          pi1?.hours ??
          (row['Ciclo Aluno 1'] ? parseFloat(row['Ciclo Aluno 1']) : 6);

        studentsToInsert.push({
          name: row['Nome Aluno 1 *'],
          turma: row['Turma Aluno 1'] || null,
          contracted_hours: ch1,
          turno: getTurno(pi1?.entry) || row['Turno Aluno 1'] || null,
          periodo: p1 || null,
          contracted_entry_time: pi1?.entry || null,
          contracted_exit_time: pi1?.exit || null,
          family_id: userId,
          status: 'idle',
          school_id: currentUser.school_id,
        });

        // Aluno 2 (opcional)
        if (row['Nome Aluno 2']?.trim()) {
          const p2 = row['Período Aluno 2'] || '';
          const pi2 = PERIODO_MAP[p2] || null;
          const ch2 =
            pi2?.hours ??
            (row['Ciclo Aluno 2'] ? parseFloat(row['Ciclo Aluno 2']) : 6);

          studentsToInsert.push({
            name: row['Nome Aluno 2'],
            turma: row['Turma Aluno 2'] || null,
            contracted_hours: ch2,
            turno: getTurno(pi2?.entry) || row['Turno Aluno 2'] || null,
            periodo: p2 || null,
            contracted_entry_time: pi2?.entry || null,
            contracted_exit_time: pi2?.exit || null,
            family_id: userId,
            status: 'idle',
            school_id: currentUser.school_id,
          });
        }

        setResults((prev) =>
          prev.map((r, idx) => (idx === i ? { ...r, msg: 'Criando aluno(s)...' } : r))
        );

        // ── 2b. INSERT students ───────────────────────────────────────────
        const { data: insertedStudents, error: studErr } = await supabase
          .from('students')
          .insert(studentsToInsert)
          .select('id');

        if (studErr) throw new Error('Erro ao inserir alunos: ' + studErr.message);

        // ── 2c. INSERT student_guardians ──────────────────────────────────
        const guardianLinks = (insertedStudents || []).map((s) => ({
          student_id: s.id,
          guardian_id: userId,
          school_id: currentUser.school_id,
          is_primary: true,
          is_financial: true,
          relationship: row['Relação *'] || 'Responsável',
        }));

        if (guardianLinks.length > 0) {
          const { error: guardErr } = await supabase
            .from('student_guardians')
            .insert(guardianLinks);
          if (guardErr) throw new Error('Erro ao vincular guardião: ' + guardErr.message);
        }

        // ── 2d. INSERT authorized_persons ─────────────────────────────────
        const relacao = row['Relação *']?.trim() || 'Responsável';
        const { error: authErr } = await supabase.from('authorized_persons').insert([
          {
            family_id: userId,
            name: row['Nome Completo *'],
            relation: `${relacao} (Titular)`,
            has_photo: false,
            emergency_order: 1,
            school_id: currentUser.school_id,
          },
        ]);

        if (authErr) throw new Error('Erro ao inserir autorizado: ' + authErr.message);

        // ── 3. Criar 2º Responsável (Opcional) ─────────────────────────────────
        const nome2 = row['2º Nome Completo']?.trim();
        const email2 = row['2º E-mail']?.trim();
        const senha2 = row['2º Senha'];
        let msg2 = '';
        
        if (nome2 || email2 || senha2) {
          if (nome2 && email2 && senha2) {
            setResults((prev) =>
              prev.map((r, idx) => (idx === i ? { ...r, msg: `Criando 2º Responsável: ${nome2}...` } : r))
            );
            
            const { error: funcError2 } = await supabase.functions.invoke(
              'create-family-user',
              {
                body: {
                  name: nome2,
                  email: email2.toLowerCase(),
                  password: senha2,
                  phone: row['2º Telefone'] || null,
                  doc_number: row['2º CPF']?.replace(/\D/g, '') || null,
                  school_id: currentUser.school_id,
                  student_ids: insertedStudents.map(s => s.id),
                  relationship: row['2º Relação'] || 'Responsável',
                  is_financial: false
                }
              }
            );
            
            if (funcError2) {
              msg2 = `⚠️ 1º Responsável criado, mas 2º falhou: ${funcError2.message}`;
            }
          } else {
            msg2 = `⚠️ 1º Responsável criado. 2º ignorado (campos incompletos).`;
          }
        }

        setResults((prev) =>
          prev.map((r, idx) => (idx === i ? { ...r, status: 'success', msg: msg2 || '✅ Família importada com sucesso' } : r))
        );
      } catch (err) {
        setResults((prev) =>
          prev.map((r, idx) =>
            idx === i ? { ...r, status: 'error', error: err.message, msg: `❌ Erro: ${err.message}` } : r
          )
        );
      }
    }

    setIsImporting(false);
    setStep('done');
    if (onImportComplete) onImportComplete();
  };

  // ── Métricas ──────────────────────────────────────────────────────────────
  const doneCount = results.filter((r) => r.status !== 'pending').length;
  const successCount = results.filter((r) => r.status === 'success').length;
  const errorCount = results.filter((r) => r.status === 'error').length;
  const progress =
    results.length > 0 ? Math.round((doneCount / results.length) * 100) : 0;

  // ── JSX ───────────────────────────────────────────────────────────────────
  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={!isImporting ? onClose : undefined}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Cabeçalho ── */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-100 p-2.5 rounded-xl text-emerald-600">
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Importar via Excel</h2>
              <p className="text-xs text-slate-400">
                {step === 'upload' && 'Carregue o arquivo modelo preenchido'}
                {step === 'preview' &&
                  `${parsedRows.length} registro${parsedRows.length !== 1 ? 's' : ''} encontrado${parsedRows.length !== 1 ? 's' : ''}, revise antes de importar`}
                {step === 'importing' && `Processando… ${progress}%`}
                {step === 'done' &&
                  `Concluído: ${successCount} importado${successCount !== 1 ? 's' : ''}, ${errorCount} erro${errorCount !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          {!isImporting && (
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition"
              title="Fechar"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* ── Conteúdo (scrollável) ── */}
        <div className="flex-1 overflow-y-auto min-h-0">

          {/* ══ STEP: UPLOAD ══════════════════════════════════════════════════ */}
          {step === 'upload' && (
            <div className="p-6 space-y-5">
              {/* Área de drop */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`
                  relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all select-none
                  ${isDragging
                    ? 'border-emerald-400 bg-emerald-50'
                    : 'border-slate-200 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50/40'}
                `}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div
                  className={`mx-auto mb-4 w-14 h-14 rounded-2xl flex items-center justify-center transition-colors
                    ${isDragging ? 'bg-emerald-100' : 'bg-white border border-slate-200'}`}
                >
                  <Upload size={26} className={isDragging ? 'text-emerald-500' : 'text-slate-400'} />
                </div>
                <p className="font-semibold text-slate-700 text-sm">
                  {isDragging ? 'Solte o arquivo aqui' : 'Arraste o arquivo Excel aqui'}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  ou clique para selecionar · <span className="font-mono">.xlsx</span> /{' '}
                  <span className="font-mono">.xls</span>
                </p>
              </div>

              {/* Erro de parse */}
              {parseError && (
                <div className="flex items-start gap-2.5 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  <span>{parseError}</span>
                </div>
              )}

              {/* Referência de colunas */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
                  Colunas esperadas no modelo
                </p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  {[
                    ['Nome Completo *', 'Responsável principal'],
                    ['E-mail *', 'Login de acesso'],
                    ['Senha *', 'Senha inicial'],
                    ['Telefone', 'Contato (opcional)'],
                    ['CPF', 'Documento (opcional)'],
                    ['Relação *', 'Ex: Mãe, Pai, Avó'],
                    ['2º Nome Completo', 'Segundo responsável (opcional)'],
                    ['2º E-mail', 'Segundo e-mail (opcional)'],
                    ['2º Senha', 'Segunda senha (opcional)'],
                    ['Nome Aluno 1 *', 'Obrigatório'],
                    ['Turma Aluno 1', 'Ex: Kids I (opcional)'],
                    ['Período Aluno 1 *', 'Ex: 07:00 às 13:00'],
                    ['Nome Aluno 2', 'Segundo aluno (opcional)'],
                  ].map(([col, hint]) => (
                    <div key={col} className="flex items-baseline gap-1.5">
                      <span className="text-[11px] font-semibold text-slate-700 font-mono leading-relaxed">
                        {col}
                      </span>
                      <span className="text-[10px] text-slate-400">· {hint}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══ STEP: PREVIEW ════════════════════════════════════════════════ */}
          {step === 'preview' && (
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-2 p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-sm text-indigo-700">
                <CheckCircle2 size={15} className="shrink-0 text-indigo-500" />
                <span>
                  <strong>{parsedRows.length}</strong> registro
                  {parsedRows.length !== 1 ? 's' : ''} válido
                  {parsedRows.length !== 1 ? 's' : ''} em{' '}
                  <strong className="font-mono">{fileName}</strong>
                </span>
              </div>

              <div className="border border-slate-200 rounded-2xl overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      {['#', '1º Responsável', '2º Responsável', 'Aluno(s)', 'Turma / Período'].map((h) => (
                        <th
                          key={h}
                          className="text-left px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedRows.map((row, idx) => {
                      const aluno2 = row['Nome Aluno 2']?.trim();
                      const nome2 = row['2º Nome Completo']?.trim();
                      return (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-3 text-xs text-slate-400 font-mono w-8">
                            {idx + 1}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-800 text-xs">
                              {row['Nome Completo *']}
                            </div>
                            <div className="text-[11px] text-slate-400">{row['E-mail *']}</div>
                          </td>
                          <td className="px-4 py-3">
                            {nome2 ? (
                              <>
                                <div className="font-semibold text-slate-800 text-xs">{nome2}</div>
                                <div className="text-[11px] text-slate-400">{row['2º E-mail']}</div>
                              </>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-xs text-slate-700 flex items-center gap-2">
                              {row['Nome Aluno 1 *']}
                              {nome2 && (
                                <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold">Com 2º Resp.</span>
                              )}
                            </div>
                            {aluno2 && (
                              <div className="text-[11px] text-slate-400 mt-0.5">{aluno2}</div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-[11px] text-slate-600">
                              {row['Turma Aluno 1'] || '—'}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {row['Período Aluno 1 *'] || '—'}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══ STEP: IMPORTING ══════════════════════════════════════════════ */}
          {step === 'importing' && (
            <div className="p-6 space-y-4">
              {/* Barra de progresso */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>
                    {doneCount} de {results.length} registros
                  </span>
                  <span>{progress}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              {/* Lista de resultados */}
              <div className="space-y-2">
                {results.map((r, idx) => (
                  <div
                    key={idx}
                    className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                      r.status === 'success'
                        ? 'bg-emerald-50 border-emerald-100'
                        : r.status === 'error'
                        ? 'bg-red-50 border-red-100'
                        : r.status === 'processing'
                        ? 'bg-indigo-50 border-indigo-100'
                        : 'bg-slate-50 border-slate-100'
                    }`}
                  >
                    <div className="mt-0.5">
                      <StatusIcon status={r.status} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-800 text-xs truncate">
                        {r.name}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">{r.email}</div>
                      {r.msg && (
                        <div className={`text-[11px] mt-0.5 font-medium ${r.status === 'processing' ? 'text-indigo-600' : (r.status === 'error' || r.msg.includes('falhou')) ? 'text-red-600' : 'text-emerald-600'}`}>
                          {r.msg}
                        </div>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 shrink-0 self-center max-w-[120px] truncate text-right">
                      {r.alunos}
                    </div>
                  </div>
                ))}
                <div ref={resultsEndRef} />
              </div>
            </div>
          )}

          {/* ══ STEP: DONE ═══════════════════════════════════════════════════ */}
          {step === 'done' && (
            <div className="p-6 space-y-5">
              {/* Cards de resumo */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center">
                  <CheckCircle2 className="mx-auto mb-2 text-emerald-500" size={28} />
                  <div className="text-4xl font-black text-emerald-700">{successCount}</div>
                  <div className="text-xs text-emerald-600 font-medium mt-1">
                    Cadastro{successCount !== 1 ? 's' : ''} realizado{successCount !== 1 ? 's' : ''}
                  </div>
                </div>
                <div
                  className={`border rounded-2xl p-5 text-center ${
                    errorCount > 0
                      ? 'bg-red-50 border-red-200'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <XCircle
                    className={`mx-auto mb-2 ${errorCount > 0 ? 'text-red-400' : 'text-slate-300'}`}
                    size={28}
                  />
                  <div
                    className={`text-4xl font-black ${
                      errorCount > 0 ? 'text-red-700' : 'text-slate-400'
                    }`}
                  >
                    {errorCount}
                  </div>
                  <div
                    className={`text-xs font-medium mt-1 ${
                      errorCount > 0 ? 'text-red-600' : 'text-slate-400'
                    }`}
                  >
                    Erro{errorCount !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>

              {/* Detalhes de erros */}
              {errorCount > 0 && (
                <div className="border border-red-200 rounded-2xl overflow-hidden">
                  <div className="bg-red-50 px-4 py-2.5 border-b border-red-200">
                    <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider">
                      Registros com erro: verifique e corrija no arquivo
                    </p>
                  </div>
                  <div className="divide-y divide-red-100 max-h-48 overflow-y-auto">
                    {results
                      .filter((r) => r.status === 'error')
                      .map((r, idx) => (
                        <div key={idx} className="px-4 py-3">
                          <div className="text-xs font-semibold text-slate-700">{r.name}</div>
                          <div className="text-[11px] text-slate-400">{r.email}</div>
                          <div className="text-[11px] text-red-600 mt-0.5">{r.error}</div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {successCount === 0 && errorCount === 0 && (
                <div className="text-center py-6 text-slate-400 text-sm">
                  Nenhum registro foi processado.
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Rodapé ── */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
          {/* Esquerda */}
          <div>
            {step === 'preview' && (
              <button
                onClick={() => {
                  setStep('upload');
                  setParsedRows([]);
                  setFileName('');
                  setParseError('');
                }}
                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition"
              >
                <ArrowLeft size={15} />
                Outro arquivo
              </button>
            )}
          </div>

          {/* Direita */}
          <div className="flex items-center gap-3">
            {!isImporting && (
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 border border-slate-200 hover:border-slate-300 rounded-xl transition"
              >
                {step === 'done' ? 'Fechar' : 'Cancelar'}
              </button>
            )}
            {step === 'preview' && (
              <button
                onClick={handleImport}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-sm font-semibold rounded-xl transition shadow-sm"
              >
                <Play size={14} />
                Importar {parsedRows.length} registro{parsedRows.length !== 1 ? 's' : ''}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
