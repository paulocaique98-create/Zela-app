import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getEffectiveExitTime, getEffectiveEntryTime, mergeBillingConfig, BillingConfig } from '../_shared/extraHours.ts'

serve(async (req) => {
  // Só o backend (cron/scheduler com a service role key) pode disparar esta função —
  // sem isso, qualquer chamador externo poderia forçar execuções extras e duplicar notificações.
  const supabaseKeyForAuth = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const reqAuth = req.headers.get('Authorization')
  if (reqAuth !== `Bearer ${supabaseKeyForAuth}`) {
    return new Response(JSON.stringify({ error: 'Não autorizado' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Verificar se hoje é fim de semana (sábado = 6, domingo = 0)
  const now = new Date();
  const brasiliaOffset = -3 * 60;
  const brasiliaTime = new Date(now.getTime() + brasiliaOffset * 60 * 1000);
  const dayOfWeek = brasiliaTime.getUTCDay(); // 0 = domingo, 6 = sábado
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Fim de semana — notificações de atraso desativadas.',
        notificationsCreated: 0
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase URL ou Key faltando.')
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Pegar horário e data atual (UTC ou configurado no timezone do servidor)
    const now = new Date()

    // Converter para horário de Brasília (UTC-3)
    const brasiliaOffset = -3 * 60 // -180 minutos
    const brasiliaTime = new Date(now.getTime() + brasiliaOffset * 60 * 1000)

    // Data de hoje no fuso de Brasília
    const todayStr = brasiliaTime.toISOString().split('T')[0]

    // Obter todos os alunos com horários contratados ativos
    const { data: students, error: stdError } = await supabase
      .from('students')
      .select('id, school_id, family_id, name, status, contracted_entry_time, contracted_exit_time, weekly_schedule')
      // Vamos checar apenas alunos que tenham ao menos 1 dos horários cadastrados
      .or('contracted_entry_time.not.is.null,contracted_exit_time.not.is.null')

    if (stdError) throw stdError

    if (!students || students.length === 0) {
      return new Response(JSON.stringify({ message: 'Nenhum aluno com horário cadastrado' }), { headers: { 'Content-Type': 'application/json' } })
    }

    // Config de cobrança por escola (schools.billing_config) -- um mapa
    // school_id -> config mesclada com o default, buscado de uma vez só
    // pras escolas que aparecem entre os alunos deste lote.
    const schoolIds = [...new Set(students.map(s => s.school_id))]
    const { data: schoolsData, error: schoolsError } = await supabase
      .from('schools')
      .select('id, billing_config')
      .in('id', schoolIds)
    if (schoolsError) throw schoolsError
    const billingConfigBySchool = new Map<string, BillingConfig>(
      (schoolsData || []).map(s => [s.id, mergeBillingConfig(s.billing_config)])
    )

    // 1. Garantir que todo aluno tenha uma linha na daily_attendance_status de hoje em BATCH
    const upsertData = students.map(student => ({
      student_id: student.id,
      school_id: student.school_id,
      date: todayStr
    }))

    if (upsertData.length > 0) {
      await supabase
        .from('daily_attendance_status')
        .upsert(upsertData, { onConflict: 'student_id,date', ignoreDuplicates: true })
    }

    // 2. Buscar todos os status de hoje
    const { data: dailyStatuses, error: statusError } = await supabase
      .from('daily_attendance_status')
      .select('*')
      .eq('date', todayStr)

    if (statusError) throw statusError

    // 3. Buscar os logs de attendance de hoje para saber se o aluno já fez checkin/out
    // Definir início e fim do dia atual (em UTC ou local, dependendo do fuso do projeto)
    // Brasília meia-noite = UTC 03:00 do mesmo dia
    // Brasília 23:59 = UTC 02:59 do dia seguinte
    const startOfDay = new Date(todayStr + 'T03:00:00.000Z').toISOString()
    const endOfDayDate = new Date(todayStr + 'T03:00:00.000Z')
    endOfDayDate.setDate(endOfDayDate.getDate() + 1)
    const endOfDay = new Date(endOfDayDate.getTime() - 1).toISOString()

    const { data: attendanceLogs, error: logsError } = await supabase
      .from('attendance_logs')
      .select('student_id, event_type, event_time')
      .gte('event_time', startOfDay)
      .lte('event_time', endOfDay)

    if (logsError) throw logsError

    // Agrupar logs por aluno para consulta rápida -- guarda também o horário
    // do PRIMEIRO entry do dia (necessário pro cálculo de check-in antecipado).
    const logsByStudent = attendanceLogs.reduce((acc: any, log) => {
      if (!acc[log.student_id]) acc[log.student_id] = { entry: false, exit: false, firstEntryTime: null as string | null }
      if (log.event_type === 'entry') {
        acc[log.student_id].entry = true
        if (!acc[log.student_id].firstEntryTime || log.event_time < acc[log.student_id].firstEntryTime) {
          acc[log.student_id].firstEntryTime = log.event_time
        }
      }
      if (log.event_type === 'exit') acc[log.student_id].exit = true
      return acc
    }, {})

    const notificationsToInsert: any[] = []
    const statusUpdates: any[] = []
    const studentsToMarkAbsent: string[] = []

    const currentMinutesOfDay = brasiliaTime.getUTCHours() * 60 + brasiliaTime.getUTCMinutes()

    const timeToMinutes = (timeStr: string) => {
      if (!timeStr) return 0;
      const [h, m] = timeStr.split(':').map(Number)
      return h * 60 + m
    }

    for (const student of students) {
      const statusRow = dailyStatuses.find(s => s.student_id === student.id)
      if (!statusRow) continue

      const billingConfig = billingConfigBySchool.get(student.school_id) || mergeBillingConfig(null)
      const studentLogs = logsByStudent[student.id]
      const hasEntryLog = studentLogs?.entry || false
      const hasExitLog = studentLogs?.exit || false

      let statusChanged = false
      const newStatus = { ...statusRow }

      // --- CHECAGEM DE ENTRADA (Atraso > 5 min e Falta > 30 min) ---
      if (student.contracted_entry_time && !hasEntryLog) {
        const entryMinutes = timeToMinutes(student.contracted_entry_time)

        // Transição automática para Ausente se passou de 30 min e ainda está idle
        if (currentMinutesOfDay >= entryMinutes + 30 && student.status === 'idle') {
          studentsToMarkAbsent.push(student.id)
        }


      }

      // --- CHECAGEM DE CHECK-IN ANTECIPADO (cobrança de hora extra na entrada) ---
      // Ativado por billing_config.charge_early_checkin (a escola pode desligar só
      // esse lado sem desligar a cobrança de saída tardia). Compara o horário REAL
      // do primeiro entry do dia contra o horário de entrada efetivo (contratado ou
      // weekly_schedule daquele dia) menos a tolerância configurada.
      if (billingConfig.charge_early_checkin && student.contracted_entry_time && hasEntryLog && studentLogs.firstEntryTime && !newStatus.notified_early_checkin_billing) {
        const effectiveEntryTime = getEffectiveEntryTime(student.contracted_entry_time, todayStr, student.weekly_schedule)
        if (effectiveEntryTime) {
          const entryMinutes = timeToMinutes(effectiveEntryTime)
          // Mesmo shift usado em `brasiliaTime` (não aritmética direta em
          // minutos, que quebraria perto da meia-noite UTC) -- desloca o
          // instante do log e lê hora:minuto UTC do resultado, que já
          // corresponde ao horário de Brasília.
          const actualEntryDate = new Date(new Date(studentLogs.firstEntryTime).getTime() + brasiliaOffset * 60 * 1000)
          const actualEntryMinutes = actualEntryDate.getUTCHours() * 60 + actualEntryDate.getUTCMinutes()
          const minutesEarly = entryMinutes - actualEntryMinutes

          if (minutesEarly > billingConfig.early_checkin_tolerance_min) {
            notificationsToInsert.push({
              school_id: student.school_id,
              family_id: student.family_id,
              student_id: student.id,
              type: 'early_checkin_billing',
              message: `Atenção: O check-in de ${student.name} foi antecipado além da tolerância. Cobrança de hora extra ativada.`
            })
            newStatus.notified_early_checkin_billing = true
            statusChanged = true
          }
        }
      }

      // --- CHECAGEM DE SAÍDA ---
      // Só faz sentido se o aluno já entrou (tem entry log) e não tem exit log
      if (student.contracted_exit_time && hasEntryLog && !hasExitLog) {
        // Horário contratado EFETIVO de hoje -- override de students.weekly_schedule
        // pro dia da semana correspondente, se houver. Sem override configurado pro
        // dia, é igual ao contracted_exit_time de sempre (comportamento inalterado
        // pra quem não usa a feature).
        const effectiveExitTime = getEffectiveExitTime(student.contracted_exit_time, todayStr, student.weekly_schedule)
        const exitMinutes = timeToMinutes(effectiveExitTime)
        const billingThreshold = billingConfig.late_checkout_tolerance_min
        const warningThreshold = Math.max(0, billingThreshold - 5) // mesmo intervalo de 5min do valor fixo original (10min aviso / 15min cobrança)

        // Tolerância (Aviso de Cobrança)
        if (currentMinutesOfDay >= exitMinutes + billingThreshold && !newStatus.notified_late_exit_15_billing) {
          notificationsToInsert.push({
            school_id: student.school_id,
            family_id: student.family_id,
            student_id: student.id,
            type: 'late_exit_15min_billing',
            message: `Atenção: O check-out de ${student.name} passou do limite de tolerância. Cobrança de hora extra ativada.`
          })
          newStatus.notified_late_exit_15_billing = true
          // Se pular direto para a cobrança, marca o aviso como true também para não mandar atrasado
          newStatus.notified_late_exit_10 = true
          statusChanged = true
        }
        // Aviso (5min antes da cobrança)
        else if (currentMinutesOfDay >= exitMinutes + warningThreshold && !newStatus.notified_late_exit_10) {
          notificationsToInsert.push({
            school_id: student.school_id,
            family_id: student.family_id,
            student_id: student.id,
            type: 'late_exit_10min_warning',
            message: `Faltam 5 minutos para o limite de tolerância do check-out de ${student.name}. Após isso, a cobrança extra será iniciada.`
          })
          newStatus.notified_late_exit_10 = true
          statusChanged = true
        }
      }

      if (statusChanged) {
        statusUpdates.push(newStatus)
      }
    }

    // 4. Inserir notificações se houver
    if (notificationsToInsert.length > 0) {
      await supabase.from('notifications').insert(notificationsToInsert)
    }

    // 5. Atualizar os status diários modificados
    if (statusUpdates.length > 0) {
      for (const st of statusUpdates) {
        await supabase.from('daily_attendance_status').update({
          notified_late_entry_5: st.notified_late_entry_5,
          notified_late_exit_5: st.notified_late_exit_5,
          notified_late_exit_10: st.notified_late_exit_10,
          notified_late_exit_15_billing: st.notified_late_exit_15_billing,
          notified_early_checkin_billing: st.notified_early_checkin_billing
        }).eq('id', st.id)
      }
    }

    // 6. Atualizar os alunos para Ausente
    if (studentsToMarkAbsent.length > 0) {
      await supabase.from('students')
        .update({ status: 'absent' })
        .in('id', studentsToMarkAbsent)
    }

    return new Response(JSON.stringify({
      success: true,
      notificationsCreated: notificationsToInsert.length,
      statusesUpdated: statusUpdates.length,
      absencesMarked: studentsToMarkAbsent.length
    }), { headers: { 'Content-Type': 'application/json' } })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
