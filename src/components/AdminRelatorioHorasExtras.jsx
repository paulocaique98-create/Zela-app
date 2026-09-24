import React, { useState, useEffect, useRef } from 'react';
import { Search, X, FileText, Download, SlidersHorizontal, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { agruparEventosPorDia, calcularHorasExtras, calcularEntradaAntecipada, mergeBillingConfig, getBrasiliaDateStr } from '../utils/attendanceUtils';
import { printHorasExtrasReport } from '../lib/printHorasExtras';

function formatTime(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleDateString('pt-BR');
}

// Mostra no máximo 3 palavras cheias do nome (primeiro nome + 2 sobrenomes:
// o primeiro e o último) -- qualquer sobrenome do meio além desses vira só a
// inicial, pra caber numa linha só no card sem precisar de reticências, sem
// quebrar linha e sem precisar diminuir a fonte. Mas nomes com primeiro nome
// e sobrenomes já longos por si só (ex: "Fernando Machione PD Almeida")
// mesmo abreviados no meio continuam compridos demais -- nesse caso abrevia
// também o primeiro sobrenome, sobrando só o primeiro nome e o último
// sobrenome por inteiro.
const LIMITE_CARACTERES_NOME_CARD = 24;

function formatarNomeCard(fullName) {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return fullName;

  const primeiro = parts[0];
  const ultimoSobrenome = parts[parts.length - 1];
  const meio = parts.slice(1, -1); // tudo entre o primeiro nome e o último sobrenome

  if (meio.length === 0) return fullName; // já é só "Nome Sobrenome"

  const [primeiroSobrenome, ...restoMeio] = meio;
  const abreviar = w => `${w.charAt(0).toUpperCase()}.`;

  const comPrimeiroSobrenomeCheio = [primeiro, primeiroSobrenome, ...restoMeio.map(abreviar), ultimoSobrenome].join(' ');
  if (comPrimeiroSobrenomeCheio.length <= LIMITE_CARACTERES_NOME_CARD) return comPrimeiroSobrenomeCheio;

  return [primeiro, ...meio.map(abreviar), ultimoSobrenome].join(' ');
}

export default function AdminRelatorioHorasExtras({ currentSchool }) {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [period, setPeriod] = useState('today');
  const [customDate, setCustomDate] = useState('');
  // Só um card aberto por vez -- abrir outro fecha o anterior automaticamente.
  const [expandedStudentKey, setExpandedStudentKey] = useState(null);
  // Período e status ficam escondidos atrás desse painel — modelo "foco na
  // lista" validado com o usuário (proposta com 3 layouts, 17/09): sem isso,
  // os filtros disputavam espaço/atenção com o resultado por aluno, que é a
  // informação que a recepção realmente precisa ver primeiro.
  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef(null);

  useEffect(() => {
    if (!showFilters) return;
    const handleClickOutside = (e) => {
      if (filtersRef.current && !filtersRef.current.contains(e.target)) setShowFilters(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFilters]);

  const fetchExtras = async () => {
    if (!currentSchool) return;
    setIsLoading(true);
    try {
      const schoolId = currentSchool.school_id || currentSchool.id;
      const todayISO = getBrasiliaDateStr();

      // Offset explícito (-03:00): sem ele, o Postgres interpreta a string
      // como UTC (fuso da sessão), então "00:00" viraria 21h da noite
      // anterior em Brasília — o intervalo do dia ficaria deslocado.
      let startDate, endDate;
      if (period === 'today') {
        startDate = `${todayISO}T00:00:00-03:00`;
        endDate   = `${todayISO}T23:59:59-03:00`;
      } else if (period === 'custom' && customDate) {
        startDate = `${customDate}T00:00:00-03:00`;
        endDate   = `${customDate}T23:59:59-03:00`;
      } else {
        const days = period === '7days' ? 7 : (period === 'this_month' ? new Date().getDate() : 30);
        const start = new Date();
        start.setDate(start.getDate() - (days - 1));
        startDate = `${getBrasiliaDateStr(start)}T00:00:00-03:00`;
        endDate   = `${todayISO}T23:59:59-03:00`;
      }

      const { data: rawLogs, error } = await supabase
        .from('attendance_logs')
        .select(`
          id,
          event_type,
          event_time,
          student_id,
          recorded_by,
          students:student_id (name, contracted_entry_time, contracted_exit_time, weekly_schedule, isento_hora_extra, users:family_id(name)),
          users:recorded_by (name)
        `)
        .eq('school_id', schoolId)
        .gte('event_time', startDate)
        .lte('event_time', endDate)
        .order('student_id')
        .order('event_time');

      if (error) throw error;

      const groupedLogs = agruparEventosPorDia(rawLogs);
      const billingConfig = mergeBillingConfig(currentSchool?.billing_config);

      const result = groupedLogs.map(group => {
        const entryTimeIso = group.entryLog ? group.entryLog.event_time : null;
        const exitTimeIso = group.exitLog ? group.exitLog.event_time : null;
        const contractedEntryTime = group.studentData?.contracted_entry_time;
        const contractedExitTime = group.studentData?.contracted_exit_time;
        const weeklySchedule = group.studentData?.weekly_schedule;
        const isentoHoraExtra = group.studentData?.isento_hora_extra;

        // Incluindo nome do funcionário que aprovou o checkout
        const approvedBy = group.exitLog?.users?.name || group.entryLog?.users?.name || '—';

        // Cobrança considera os dois lados: check-in ANTECIPADO (antes da
        // entrada contratada/efetiva do dia, com margem) e check-out
        // TARDIO (já existia) -- somados no total do dia.
        const calculoSaida = calcularHorasExtras(exitTimeIso, contractedExitTime, weeklySchedule, billingConfig, isentoHoraExtra);
        const calculoEntrada = calcularEntradaAntecipada(entryTimeIso, contractedEntryTime, weeklySchedule, billingConfig, isentoHoraExtra);

        const minutos_excedentes = calculoSaida.minutos_excedentes + calculoEntrada.minutos_antecipados;
        const valor = calculoSaida.valor + calculoEntrada.valor;
        const dentro_tolerancia = calculoSaida.dentro_tolerancia && calculoEntrada.dentro_tolerancia;

        return {
          key: `${group.student_id}_${group.date}`,
          studentId: group.student_id,
          studentName: group.studentData?.name || '—',
          family: group.studentData?.users?.name || '—',
          date: formatDate(entryTimeIso || exitTimeIso),
          entry: entryTimeIso ? formatTime(entryTimeIso) : null,
          exit: exitTimeIso ? formatTime(exitTimeIso) : null,
          contractedExit: contractedExitTime || '—',
          approvedBy: approvedBy,
          minutos_excedentes,
          valor,
          valorFormatado: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor),
          dentro_tolerancia,
          sem_saida: calculoSaida.sem_saida,
          excessoEntrada: !calculoEntrada.dentro_tolerancia,
          excessoSaida: !calculoSaida.dentro_tolerancia,
          // Guardados separados (não só o total do dia) pra mostrar, no
          // detalhamento por dia, QUAL dos dois lados gerou a cobrança —
          // entrada antecipada e saída tardia têm minutos/valor
          // independentes, mesmo somando no mesmo dia.
          minutosEntrada: calculoEntrada.minutos_antecipados,
          valorEntrada: calculoEntrada.valor,
          minutosSaida: calculoSaida.minutos_excedentes,
          valorSaida: calculoSaida.valor,
          rawTime: entryTimeIso ? new Date(entryTimeIso).getTime() : (exitTimeIso ? new Date(exitTimeIso).getTime() : 0),
        };
      });

      result.sort((a, b) => b.rawTime - a.rawTime || a.studentName.localeCompare(b.studentName));
      setLogs(result);
    } catch (err) {
      console.error('Erro ao buscar horas extras:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchExtras(); }, [currentSchool, period, customDate]);
  useEffect(() => { setExpandedStudentKey(null); }, [period, customDate]);

  // Mesma regra usada pra pintar a linha de amarelo na tabela: excedeu a
  // tolerância de entrada antecipada, ou de saída tardia com o check-out já
  // registrado (enquanto o aluno ainda está na escola sem saída, não dá pra
  // dizer que "tem" hora extra — ainda pode sair dentro do prazo).
  const hasExcess = log => log.excessoEntrada || (log.excessoSaida && !log.sem_saida);

  const searchFiltered = logs.filter(log => {
    const term = searchTerm.toLowerCase().trim();
    return !term || log.studentName.toLowerCase().includes(term) || log.family.toLowerCase().includes(term);
  });

  // A tela só existe pra acompanhar quem tem excedente a cobrar -- não faz
  // sentido misturar quem está "no prazo"/"pendente" nessa lista, então o
  // filtro de status foi removido e o próprio `filtered` já é sempre só
  // quem tem excesso (mesmo conjunto que o relatório exportado usa).
  const filtered = searchFiltered.filter(hasExcess);
  const exportRecords = filtered;

  const totalMinutosExcedentes = filtered.reduce((acc, log) => acc + log.minutos_excedentes, 0);
  const totalValor = filtered.reduce((acc, log) => acc + log.valor, 0);
  const totalValorFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValor);

  // "Hoje"/"Editar" são um único dia -- cada registro de `filtered` já É o
  // resultado daquele dia por aluno, então mostra um card por dia. "Semana"/
  // "Mês" cobrem vários dias: sem agrupar por aluno, cada card continuava
  // mostrando só 1 dia (geralmente o mais recente, por causa da ordenação),
  // dando a impressão de que o excedente do mês era só o de hoje. Aqui soma
  // minutos/valor de TODOS os dias do período, por aluno.
  const isSingleDay = period === 'today' || period === 'custom';
  const displayLogs = isSingleDay ? filtered : (() => {
    const byStudent = new Map();
    for (const log of filtered) {
      let acc = byStudent.get(log.studentId);
      if (!acc) {
        acc = {
          key: log.studentId,
          studentId: log.studentId,
          studentName: log.studentName,
          family: log.family,
          minutos_excedentes: 0,
          valor: 0,
          diasComExcesso: 0,
          rawTime: 0,
          dias: [],
        };
        byStudent.set(log.studentId, acc);
      }
      acc.minutos_excedentes += log.minutos_excedentes;
      acc.valor += log.valor;
      acc.diasComExcesso += 1; // `filtered` já é só dias com excesso
      acc.dias.push(log);
      if (log.rawTime > acc.rawTime) acc.rawTime = log.rawTime;
    }
    return Array.from(byStudent.values())
      .map(acc => ({
        ...acc,
        valorFormatado: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(acc.valor),
        dias: acc.dias.sort((a, b) => b.rawTime - a.rawTime),
      }))
      .sort((a, b) => b.valor - a.valor || b.minutos_excedentes - a.minutos_excedentes || a.studentName.localeCompare(b.studentName));
  })();

  const PERIOD_LABELS = { today: 'Hoje', '7days': 'Semana', this_month: 'M\u00EAs' };
  const periodLabel = period === 'custom' && customDate
    ? formatDate(`${customDate}T00:00:00`)
    : (PERIOD_LABELS[period] || 'Per\u00EDodo selecionado');

  const handleExport = () => {
    printHorasExtrasReport({
      records: exportRecords,
      periodLabel,
      school: currentSchool,
    });
  };

  return (
    <div className="h-full flex flex-col bg-white -m-3 sm:m-0 p-2.5 sm:p-5 md:p-6 rounded-none sm:rounded-3xl md:rounded-none shadow-none sm:shadow-sm md:shadow-none border-0 sm:border sm:border-slate-200 md:border-0 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-400">
      {/* Header -- título e ícone removidos (o Header do app já mostra o
          nome da tela dinamicamente); não sobrava descrição pra ficar no
          lugar, então os botões vão sozinhos na linha. */}
      <div className="flex items-center justify-end gap-2 sm:gap-4 mb-3 shrink-0">
        <div className="relative flex items-center gap-2 shrink-0" ref={filtersRef}>
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`flex items-center justify-center gap-2 text-sm font-bold px-3.5 py-2.5 rounded-xl transition shadow-sm border ${
              showFilters ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
            title="Período"
          >
            <SlidersHorizontal size={16} />
          </button>

          <button
            onClick={handleExport}
            disabled={exportRecords.length === 0}
            title={exportRecords.length === 0 ? 'Ninguém com hora extra neste período' : undefined}
            className="flex items-center justify-center gap-2 text-sm font-bold text-white bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 px-3.5 sm:px-4 py-2.5 rounded-xl transition shadow-sm shrink-0"
          >
            <Download size={16} /> <span className="hidden sm:inline">Exportar Relatório</span>
          </button>

          {/* Ancorado no grupo inteiro (não só no botão de filtro) e sempre
              pela direita -- evita o painel nascer fora da tela quando o
              botão de filtro não está colado na borda direita real. */}
          {showFilters && (
            <div className="absolute right-0 top-full mt-2 w-[21rem] max-w-[calc(100vw-2.5rem)] bg-white border border-slate-200 rounded-2xl shadow-lg p-3 z-20 space-y-3">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 px-1">Período</p>
                  <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                    {[
                      { id: 'today', label: 'Hoje' },
                      { id: '7days', label: 'Semana' },
                      { id: 'this_month', label: 'Mês' },
                      { id: 'custom', label: 'Editar' }
                    ].map(p => (
                      <button
                        key={p.id}
                        onClick={() => setPeriod(p.id)}
                        className={`shrink-0 whitespace-nowrap px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                          period === p.id ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  {period === 'custom' && (
                    <input
                      type="date"
                      value={customDate}
                      onChange={e => setCustomDate(e.target.value)}
                      className="mt-2 w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  )}
                </div>
            </div>
          )}
        </div>
      </div>

      {/* Resumo -- vira uma frase, não mais cards: modelo "foco na lista"
          validado com o usuário (proposta com 3 layouts, 17/09). */}
      <p className="text-sm text-slate-500 mb-4 shrink-0">
        <span className="sm:hidden">
          {periodLabel}: <span className="font-bold text-amber-600">{totalMinutosExcedentes} min</span> | <span className="font-bold text-rose-600">{totalValorFormatado}</span> a cobrar.
        </span>
        <span className="hidden sm:inline">
          {periodLabel}: <span className="font-bold text-amber-600">{totalMinutosExcedentes} min</span> excedentes, <span className="font-bold text-rose-600">{totalValorFormatado}</span> a cobrar.
        </span>
      </p>

      {/* Busca */}
      <div className="relative mb-4 sm:mb-6 shrink-0">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-4 w-4 text-slate-400" />
        </div>
        <input
          type="text"
          placeholder="Buscar por aluno ou responsável..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium"
        />
        {searchTerm && (
          <button onClick={() => setSearchTerm('')} className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Resultado por aluno -- cards ao invés de tabela: o valor a cobrar
          fica em destaque tipográfico bem acima de qualquer outro número da
          tela, já que é a informação que decide se alguém precisa agir. */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-1">
        {isLoading ? (
          <div className="flex justify-center items-center h-full py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
          </div>
        ) : displayLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
            <FileText className="h-10 w-10 text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium text-sm">Nenhum registro encontrado.</p>
          </div>
        ) : (
          <div className="space-y-2 pb-4">
            {displayLogs.map(log => {
              const excessText = `${Math.floor(log.minutos_excedentes / 60)}h ${log.minutos_excedentes % 60}min`;
              const initials = log.studentName.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
              const isExpanded = expandedStudentKey === log.key;

              return (
                <div key={log.key} className="rounded-2xl border border-amber-200 bg-white shadow-sm overflow-hidden">
                  <button
                    type="button"
                    onClick={() => !isSingleDay && setExpandedStudentKey(prev => (prev === log.key ? null : log.key))}
                    className={`w-full flex flex-col gap-1.5 p-3 sm:p-4 text-left ${!isSingleDay ? 'cursor-pointer hover:bg-amber-50/50' : ''}`}
                  >
                    {/* Nome do aluno sozinho na linha (só disputando espaço com
                        o avatar e a seta) -- sem responsável junto, sem
                        truncate: com truncate o nome cortava com reticências
                        no celular mesmo sobrando espaço embaixo. Se algum
                        nome for mesmo assim grande demais pro card, essa
                        linha rola na horizontal em vez de cortar ou quebrar. */}
                    <div className="flex items-center gap-3 w-full">
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center font-bold text-xs sm:text-sm shrink-0 bg-amber-100 text-amber-700">
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0 overflow-x-auto">
                        <p className="font-bold text-slate-800 text-sm whitespace-nowrap">{formatarNomeCard(log.studentName)}</p>
                      </div>
                      {!isSingleDay && (
                        <ChevronDown size={16} className={`text-slate-400 transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 pl-[3.1rem] sm:pl-[3.35rem]">
                      <div className="min-w-0">
                        {/* Card fechado não mostra "X dias com excedente" --
                            esse detalhamento só aparece expandido (abaixo),
                            senão fica uma informação solta sem contexto
                            nenhum antes de abrir. */}
                        {isSingleDay && (
                          <p className="text-xs text-slate-400 truncate">
                            {log.date}
                            {log.exit ? ` · saída ${log.exit}` : (log.entry ? ' · saída pendente' : '')}
                            {log.contractedExit !== '—' ? ` (contratado ${log.contractedExit})` : ''}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-black text-rose-600 text-base sm:text-lg leading-none">{log.valorFormatado}</p>
                        <p className="text-[10px] sm:text-xs font-bold text-amber-600 mt-1">+{excessText}</p>
                      </div>
                    </div>
                  </button>

                  {!isSingleDay && isExpanded && (
                    <div className="border-t border-amber-100 bg-amber-50/40 divide-y divide-amber-100">
                      {log.dias.map(dia => (
                        <div key={dia.key} className="flex items-center gap-3 px-3 sm:px-4 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-600 mb-1">{dia.date}</p>
                            {/* Verde = dentro do horário combinado; vermelho = foi
                                esse lado (entrada antecipada ou saída tardia) que
                                gerou a cobrança do dia — dá pra escola ver de
                                relance se foi entrada ou saída sem precisar abrir
                                cada registro. */}
                            <div className="flex items-center gap-3 flex-wrap">
                              {dia.entry && (
                                <span className={`text-[11px] font-bold ${dia.excessoEntrada ? 'text-rose-600' : 'text-emerald-600'}`}>
                                  Entrada {dia.entry}
                                </span>
                              )}
                              {dia.exit ? (
                                <span className={`text-[11px] font-bold ${dia.excessoSaida ? 'text-rose-600' : 'text-emerald-600'}`}>
                                  Saída {dia.exit}
                                </span>
                              ) : dia.entry ? (
                                <span className="text-[11px] font-bold text-slate-400">Saída pendente</span>
                              ) : null}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-bold text-rose-600 text-xs">{dia.valorFormatado}</p>
                            {dia.excessoEntrada && (
                              <p className="text-[10px] font-semibold text-amber-600">+{dia.minutosEntrada}min entrada antecipada</p>
                            )}
                            {dia.excessoSaida && (
                              <p className="text-[10px] font-semibold text-amber-600">+{dia.minutosSaida}min saída tardia</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
