import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Interface para facilitar a tipagem
interface Student {
  id: string
  school_id: string
  family_id: string
  name: string
  contracted_entry_time: string | null
  contracted_exit_time: string | null
}

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase URL ou Key faltando.')
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Pegar horário e data atual (UTC ou configurado no timezone do servidor)
    const now = new Date()
    // Como a data é extraída do formato ISO 8601 YYYY-MM-DD
    const todayStr = now.toISOString().split('T')[0]
    
    // Obter todos os alunos com horários contratados ativos
    const { data: students, error: stdError } = await supabase
      .from('students')
      .select('id, school_id, family_id, name, contracted_entry_time, contracted_exit_time')
      // Vamos checar apenas alunos que tenham ao menos 1 dos horários cadastrados
      .or('contracted_entry_time.not.is.null,contracted_exit_time.not.is.null')

    if (stdError) throw stdError

    if (!students || students.length === 0) {
      return new Response(JSON.stringify({ message: 'Nenhum aluno com horário cadastrado' }), { headers: { 'Content-Type': 'application/json' } })
    }

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
    const startOfDay = new Date(todayStr + 'T00:00:00.000Z').toISOString()
    const endOfDay = new Date(todayStr + 'T23:59:59.999Z').toISOString()

    const { data: attendanceLogs, error: logsError } = await supabase
      .from('attendance_logs')
      .select('student_id, event_type')
      .gte('event_time', startOfDay)
      .lte('event_time', endOfDay)

    if (logsError) throw logsError

    // Agrupar logs por aluno para consulta rápida
    const logsByStudent = attendanceLogs.reduce((acc: any, log) => {
      if (!acc[log.student_id]) acc[log.student_id] = { entry: false, exit: false }
      if (log.event_type === 'entry') acc[log.student_id].entry = true
      if (log.event_type === 'exit') acc[log.student_id].exit = true
      return acc
    }, {})

    const notificationsToInsert: any[] = []
    const statusUpdates: any[] = []

    const currentMinutesOfDay = now.getHours() * 60 + now.getMinutes()

    const timeToMinutes = (timeStr: string) => {
      if (!timeStr) return 0;
      const [h, m] = timeStr.split(':').map(Number)
      return h * 60 + m
    }

    for (const student of students) {
      const statusRow = dailyStatuses.find(s => s.student_id === student.id)
      if (!statusRow) continue

      const hasEntryLog = logsByStudent[student.id]?.entry || false
      const hasExitLog = logsByStudent[student.id]?.exit || false

      let statusChanged = false
      const newStatus = { ...statusRow }

      // --- CHECAGEM DE ENTRADA (Atraso > 5 min) ---
      if (student.contracted_entry_time && !hasEntryLog && !newStatus.notified_late_entry_5) {
        const entryMinutes = timeToMinutes(student.contracted_entry_time)
        if (currentMinutesOfDay >= entryMinutes + 5) {
          notificationsToInsert.push({
            school_id: student.school_id,
            family_id: student.family_id,
            student_id: student.id,
            type: 'late_entry_5min',
            message: `${student.name} está com o check-in pendente há mais de 5 minutos.`
          })
          newStatus.notified_late_entry_5 = true
          statusChanged = true
        }
      }

      // --- CHECAGEM DE SAÍDA ---
      // Só faz sentido se o aluno já entrou (tem entry log) e não tem exit log
      if (student.contracted_exit_time && hasEntryLog && !hasExitLog) {
        const exitMinutes = timeToMinutes(student.contracted_exit_time)

        // 15 minutos (Aviso de Cobrança)
        if (currentMinutesOfDay >= exitMinutes + 15 && !newStatus.notified_late_exit_15_billing) {
          notificationsToInsert.push({
            school_id: student.school_id,
            family_id: student.family_id,
            student_id: student.id,
            type: 'late_exit_15min_billing',
            message: `Atenção: O check-out de ${student.name} passou do limite de tolerância. Cobrança de hora extra ativada.`
          })
          newStatus.notified_late_exit_15_billing = true
          // Se pular direto para 15, marca os outros como true também para não mandar atrasado
          newStatus.notified_late_exit_10 = true
          newStatus.notified_late_exit_5 = true
          statusChanged = true
        }
        // 10 minutos (Aviso de tolerância)
        else if (currentMinutesOfDay >= exitMinutes + 10 && !newStatus.notified_late_exit_10) {
          notificationsToInsert.push({
            school_id: student.school_id,
            family_id: student.family_id,
            student_id: student.id,
            type: 'late_exit_10min_warning',
            message: `Faltam 5 minutos para o limite de tolerância do check-out de ${student.name}. Após isso, a cobrança extra será iniciada.`
          })
          newStatus.notified_late_exit_10 = true
          newStatus.notified_late_exit_5 = true
          statusChanged = true
        }
        // 5 minutos
        else if (currentMinutesOfDay >= exitMinutes + 5 && !newStatus.notified_late_exit_5) {
          notificationsToInsert.push({
            school_id: student.school_id,
            family_id: student.family_id,
            student_id: student.id,
            type: 'late_exit_5min',
            message: `${student.name} está com o check-out pendente há mais de 5 minutos.`
          })
          newStatus.notified_late_exit_5 = true
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
          notified_late_exit_15_billing: st.notified_late_exit_15_billing
        }).eq('id', st.id)
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      notificationsCreated: notificationsToInsert.length,
      statusesUpdated: statusUpdates.length
    }), { headers: { 'Content-Type': 'application/json' } })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
