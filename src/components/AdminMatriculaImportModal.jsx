import React, { useState, useCallback, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { createPortal } from 'react-dom';
import {
  X, Upload, FileSpreadsheet, CheckCircle2, XCircle,
  Loader2, AlertTriangle, ArrowLeft, Play,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatPersonName } from '../utils/formatName';
import { IMPORT_COLUMNS } from '../lib/matriculaImportTemplate';
import { PERIODOS_POR_CICLO, montarEndereco } from '../lib/matriculaFields';

// Importação em massa de Matrícula/Rematrícula a partir de uma planilha
// (mesmo mecanismo de leitura do AdminImportModal.jsx já existente, que
// importa direto pra cadastro oficial -- este aqui é mais seguro pra um
// import de MUITAS famílias de uma vez: cada linha vira uma solicitação
// PENDENTE em Formulários > Matrículas, revisada uma a uma pelo admin com o
// mesmo fluxo de aprovação de sempre, nunca vira cadastro oficial sozinha).
const CPF_REQ = 'CPF do Responsavel *';
const NOME_REQ = 'Nome do Responsavel Financeiro *';
const EMAIL_REQ = 'Email do Responsavel Financeiro *';
const CRIANCA_NOME_REQ = 'Nome da Crianca *';
const EXAMPLE_CPF = '12345678900';

function digitsOnly(v) { return String(v || '').replace(/\D/g, ''); }

// Detecta a linha de cabeçalho (procura a coluna-âncora), lê cada linha como
// objeto, ignora vazias e a linha de exemplo do modelo.
function parseRows(workbook) {
  const sheetName = workbook.SheetNames[0];
  const ws = workbook.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  let headerRowIndex = -1;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].some((cell) => String(cell).trim() === CRIANCA_NOME_REQ)) {
      headerRowIndex = i;
      break;
    }
  }
  if (headerRowIndex === -1) {
    return { rows: [], error: 'Cabeçalho não encontrado. Baixe o modelo e preencha a partir dele, sem apagar a linha de título das colunas.' };
  }

  const headers = raw[headerRowIndex].map((h) => String(h).trim());
  const rows = [];
  for (let i = headerRowIndex + 1; i < raw.length; i++) {
    const rowArr = raw[i];
    if (!rowArr || rowArr.every((cell) => cell === '' || cell == null)) continue;

    const row = {};
    headers.forEach((h, idx) => {
      const val = rowArr[idx];
      row[h] = val !== undefined && val !== null ? String(val).trim() : '';
    });

    if (digitsOnly(row[CPF_REQ]) === EXAMPLE_CPF) continue; // linha de exemplo
    if (!row[NOME_REQ] || !row[EMAIL_REQ] || !row[CPF_REQ] || !row[CRIANCA_NOME_REQ]) continue;

    rows.push(row);
  }
  return { rows, error: null };
}

// Converte uma data "dd/mm/aaaa" (como vem de planilha/Excel) pro formato
// "aaaa-mm-dd" que o resto do sistema usa em campos <input type="date">.
function parseDateBr(v) {
  const m = String(v || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return '';
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function findPeriodo(ciclo, periodoTexto) {
  const options = PERIODOS_POR_CICLO[Number(ciclo)] || [];
  const norm = String(periodoTexto || '').trim().toLowerCase().replace(/\s+/g, '');
  const found = options.find(p => p.label.toLowerCase().replace(/\s+/g, '') === norm.replace('as', 'às'));
  return found || null;
}

// Agrupa as linhas (uma por criança) em famílias, pela chave do CPF do
// responsável -- irmãos repetem os mesmos dados de responsável em cada
// linha própria da planilha, e viram UMA solicitação só, com várias
// crianças dentro.
function buildFamiliesFromRows(rows) {
  const families = new Map();

  for (const row of rows) {
    const cpfKey = digitsOnly(row[CPF_REQ]);
    if (!families.has(cpfKey)) {
      families.set(cpfKey, {
        responsavel: {
          nome: formatPersonName(row[NOME_REQ]),
          email: row[EMAIL_REQ].trim().toLowerCase(),
          telefone: row['Telefone 1 do Responsavel *'] || '',
          telefone2: row['Telefone 2 do Responsavel'] || '',
          cpf: digitsOnly(row[CPF_REQ]),
          rg: row['RG do Responsavel'] || '',
          rg_expedicao: parseDateBr(row['Data de Expedicao do RG (dd/mm/aaaa)']),
          rg_orgao: row['Orgao Expedidor do RG'] || '',
          profissao: row['Profissao do Responsavel'] || '',
          estado_civil: row['Estado Civil do Responsavel'] || '',
          autorizacao_imagem: (row['Autorizacao de Imagem (sim ou nao)'] || '').trim().toLowerCase() === 'sim' ? 'sim' : 'nao',
          autorizacao_emergencia: (row['Autorizacao de Emergencia Medica (sim ou nao)'] || '').trim().toLowerCase() === 'sim' ? 'sim' : 'nao',
        },
        segundo_responsavel: row['Nome do 2o Responsavel']?.trim() ? {
          nome: formatPersonName(row['Nome do 2o Responsavel']),
          email: (row['Email do 2o Responsavel'] || '').trim().toLowerCase(),
          telefone: row['Telefone do 2o Responsavel'] || '',
          cpf: digitsOnly(row['CPF do 2o Responsavel']),
          rg: row['RG do 2o Responsavel'] || '',
        } : null,
        criancas: [],
        autorizadosMap: new Map(),
      });
    }

    const fam = families.get(cpfKey);
    const ciclo = String(row['Ciclo da Crianca em horas: 6, 8 ou 10 *'] || '').trim();
    const periodoTexto = row['Periodo da Crianca (ex: 07:00 as 13:00) *'] || '';
    const periodoInfo = findPeriodo(ciclo, periodoTexto);

    fam.criancas.push({
      nome: formatPersonName(row[CRIANCA_NOME_REQ]),
      nascimento: parseDateBr(row['Data de Nascimento da Crianca (dd/mm/aaaa) *']),
      cidade_nascimento: row['Cidade de Nascimento da Crianca *'] || '',
      ciclo,
      periodo: periodoInfo?.label || periodoTexto,
      turno: periodoInfo?.turno || '',
      endereco: montarEndereco({
        cep: row['CEP'], rua: row['Rua'], numero: row['Numero'],
        complemento: row['Complemento'], bairro: row['Bairro'], cidade: row['Cidade'], uf: row['UF'],
      }),
      alimentacao_atual: row['Alimentacao Atual'] || '',
      restricao_alimentar: row['Restricao Alimentar'] || '',
      restricao_saude: row['Restricao de Saude'] || '',
      especialista: row['Especialista Consultado'] || '',
      tratamento: row['Tratamento em Andamento'] || '',
      alergia: row['Alergia'] || '',
      habito_importante: row['Habito Importante'] || '',
    });

    // Autorizados (1 e 2) -- repetidos em cada linha de irmão, então só
    // acrescenta se o nome ainda não apareceu nessa família.
    [1, 2].forEach(n => {
      const nome = row[`Nome do Autorizado ${n}`]?.trim();
      if (nome && !fam.autorizadosMap.has(nome)) {
        fam.autorizadosMap.set(nome, {
          nome: formatPersonName(nome),
          telefone: row[`Telefone do Autorizado ${n}`] || '',
          parentesco: row[`Parentesco do Autorizado ${n}`] || '',
        });
      }
    });
  }

  return [...families.values()].map(f => ({
    responsavel: f.responsavel,
    segundo_responsavel: f.segundo_responsavel,
    criancas: f.criancas,
    autorizados: [...f.autorizadosMap.values()],
  }));
}

function StatusIcon({ status }) {
  if (status === 'pending') return <div className="w-5 h-5 rounded-full border-2 border-slate-200 shrink-0" />;
  if (status === 'processing') return <Loader2 className="w-5 h-5 text-indigo-500 animate-spin shrink-0" />;
  if (status === 'success') return <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />;
  if (status === 'error') return <XCircle className="w-5 h-5 text-red-500 shrink-0" />;
  return null;
}

export default function AdminMatriculaImportModal({ onClose, onImportComplete }) {
  const [step, setStep] = useState('upload'); // 'upload' | 'preview' | 'importing' | 'done'
  const [families, setFamilies] = useState([]);
  const [parseError, setParseError] = useState('');
  const [fileName, setFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [results, setResults] = useState([]);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef(null);
  const resultsEndRef = useRef(null);

  useEffect(() => {
    if (step === 'importing') resultsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [results, step]);

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape' && !isImporting) onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isImporting, onClose]);

  const processFile = useCallback((file) => {
    if (!file) return;
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setParseError('Formato inválido. Selecione um arquivo .xlsx ou .xls.');
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
          setParseError('Nenhuma linha válida encontrada. Confira se os campos obrigatórios (marcados com *) estão preenchidos.');
          return;
        }
        const parsedFamilies = buildFamiliesFromRows(rows);
        setFamilies(parsedFamilies);
        setStep('preview');
      } catch (err) {
        setParseError('Erro ao processar o arquivo: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleDrop = useCallback((e) => { e.preventDefault(); setIsDragging(false); processFile(e.dataTransfer.files[0]); }, [processFile]);
  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleFileChange = (e) => processFile(e.target.files[0]);

  const handleImport = async () => {
    setIsImporting(true);
    setStep('importing');
    setResults(families.map(f => ({ status: 'pending', nome: f.responsavel.nome, criancas: f.criancas.map(c => c.nome).join(', '), msg: '' })));

    try {
      const { data, error } = await supabase.functions.invoke('import-matricula-batch', { body: { families } });
      if (error || !data) throw new Error(error?.message || 'Erro ao importar.');
      if (data.error) throw new Error(data.error);

      setResults(prev => prev.map((r, idx) => {
        const res = data.results?.find(x => x.index === idx);
        return res ? { ...r, status: res.status, msg: res.message } : { ...r, status: 'error', msg: 'Sem retorno do servidor.' };
      }));
    } catch (err) {
      setResults(prev => prev.map(r => (r.status === 'pending' ? { ...r, status: 'error', msg: err.message } : r)));
    } finally {
      setIsImporting(false);
      setStep('done');
      if (onImportComplete) onImportComplete();
    }
  };

  const doneCount = results.filter((r) => r.status !== 'pending').length;
  const successCount = results.filter((r) => r.status === 'success').length;
  const errorCount = results.filter((r) => r.status === 'error').length;
  const progress = results.length > 0 ? Math.round((doneCount / results.length) * 100) : 0;
  const totalCriancas = families.reduce((sum, f) => sum + f.criancas.length, 0);

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
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-100 p-2.5 rounded-xl text-emerald-600">
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Importar Matrículas em Massa</h2>
              <p className="text-xs text-slate-400">
                {step === 'upload' && 'Carregue a planilha preenchida a partir do modelo'}
                {step === 'preview' && `${families.length} família(s), ${totalCriancas} criança(s) encontradas — cada uma vira uma solicitação pendente`}
                {step === 'importing' && `Processando… ${progress}%`}
                {step === 'done' && `Concluído: ${successCount} importada(s), ${errorCount} erro(s)`}
              </p>
            </div>
          </div>
          {!isImporting && (
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition" title="Fechar">
              <X size={18} />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {step === 'upload' && (
            <div className="p-6 space-y-5">
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all select-none ${
                  isDragging ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50/40'
                }`}
              >
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileChange} className="hidden" />
                <div className={`mx-auto mb-4 w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${isDragging ? 'bg-emerald-100' : 'bg-white border border-slate-200'}`}>
                  <Upload size={26} className={isDragging ? 'text-emerald-500' : 'text-slate-400'} />
                </div>
                <p className="font-semibold text-slate-700 text-sm">{isDragging ? 'Solte o arquivo aqui' : 'Arraste a planilha aqui'}</p>
                <p className="text-xs text-slate-400 mt-1">ou clique para selecionar · <span className="font-mono">.xlsx</span> / <span className="font-mono">.xls</span></p>
              </div>

              {parseError && (
                <div className="flex items-start gap-2.5 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  <span>{parseError}</span>
                </div>
              )}

              <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 text-xs text-indigo-700 leading-relaxed">
                Cada linha da planilha é uma criança. Irmãos repetem os dados do responsável em cada linha própria — a importação junta automaticamente pelo CPF do responsável numa única solicitação. Baixe o modelo antes de preencher, pelo botão ao lado do de importar.
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-2 p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-sm text-indigo-700">
                <CheckCircle2 size={15} className="shrink-0 text-indigo-500" />
                <span><strong>{families.length}</strong> família(s) e <strong>{totalCriancas}</strong> criança(s) em <strong className="font-mono">{fileName}</strong></span>
              </div>

              <div className="border border-slate-200 rounded-2xl overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      {['#', 'Responsável Financeiro', 'Criança(s)', 'Autorizados'].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {families.map((f, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3 text-xs text-slate-400 font-mono w-8">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-800 text-xs">{f.responsavel.nome}</div>
                          <div className="text-[11px] text-slate-400">{f.responsavel.email}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-700">{f.criancas.map(c => c.nome).join(', ')}</td>
                        <td className="px-4 py-3 text-[11px] text-slate-500">{f.autorizados.length > 0 ? f.autorizados.map(a => a.nome).join(', ') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>{doneCount} de {results.length} famílias</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                </div>
              </div>
              <div className="space-y-2">
                {results.map((r, idx) => (
                  <div key={idx} className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                    r.status === 'success' ? 'bg-emerald-50 border-emerald-100' : r.status === 'error' ? 'bg-red-50 border-red-100' : r.status === 'processing' ? 'bg-indigo-50 border-indigo-100' : 'bg-slate-50 border-slate-100'
                  }`}>
                    <div className="mt-0.5"><StatusIcon status={r.status} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-800 text-xs truncate">{r.nome}</div>
                      <div className="text-[11px] text-slate-400 truncate">{r.criancas}</div>
                      {r.msg && <div className={`text-[11px] mt-0.5 font-medium ${r.status === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>{r.msg}</div>}
                    </div>
                  </div>
                ))}
                <div ref={resultsEndRef} />
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center">
                  <CheckCircle2 className="mx-auto mb-2 text-emerald-500" size={28} />
                  <div className="text-4xl font-black text-emerald-700">{successCount}</div>
                  <div className="text-xs text-emerald-600 font-medium mt-1">Solicitação(ões) criada(s)</div>
                </div>
                <div className={`border rounded-2xl p-5 text-center ${errorCount > 0 ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                  <XCircle className={`mx-auto mb-2 ${errorCount > 0 ? 'text-red-400' : 'text-slate-300'}`} size={28} />
                  <div className={`text-4xl font-black ${errorCount > 0 ? 'text-red-700' : 'text-slate-400'}`}>{errorCount}</div>
                  <div className={`text-xs font-medium mt-1 ${errorCount > 0 ? 'text-red-600' : 'text-slate-400'}`}>Erro(s)</div>
                </div>
              </div>
              {successCount > 0 && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-xs text-indigo-700">
                  As solicitações importadas já aparecem em "Pendentes" — revise e aprove cada uma normalmente.
                </div>
              )}
              {errorCount > 0 && (
                <div className="border border-red-200 rounded-2xl overflow-hidden">
                  <div className="bg-red-50 px-4 py-2.5 border-b border-red-200">
                    <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider">Famílias com erro: corrija na planilha e importe de novo só essas</p>
                  </div>
                  <div className="divide-y divide-red-100 max-h-48 overflow-y-auto">
                    {results.filter((r) => r.status === 'error').map((r, idx) => (
                      <div key={idx} className="px-4 py-3">
                        <div className="text-xs font-semibold text-slate-700">{r.nome}</div>
                        <div className="text-[11px] text-red-600 mt-0.5">{r.msg}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
          <div>
            {step === 'preview' && (
              <button
                onClick={() => { setStep('upload'); setFamilies([]); setFileName(''); setParseError(''); }}
                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition"
              >
                <ArrowLeft size={15} /> Outro arquivo
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {!isImporting && (
              <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 border border-slate-200 hover:border-slate-300 rounded-xl transition">
                {step === 'done' ? 'Fechar' : 'Cancelar'}
              </button>
            )}
            {step === 'preview' && (
              <button
                onClick={handleImport}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-sm font-semibold rounded-xl transition shadow-sm"
              >
                <Play size={14} /> Importar {families.length} família(s)
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
