import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import { notifyAdmins } from '../_shared/notifyAdmins.ts'

// self-register-family — endpoint PÚBLICO (sem JWT de chamador): usado pela
// tela "Novo usuário?" da tela de login, onde ninguém está autenticado ainda.
//
// Diferenças de segurança em relação a create-family-user (que exige um
// chamador já logado):
//   - role é sempre fixado como 'family' no servidor, nunca vem do corpo.
//   - a conta é criada com status = 'pending' — não consegue logar até um
//     admin aprovar em Cadastros > Usuários (ver Login.jsx, que bloqueia
//     login de status !== 'active').
//   - a escola é resolvida por school_code (código público, ex: ZL001), não
//     por school_id — o cliente nunca sabe o UUID interno da escola.
//   - rate limit por IP (não há caller.id pra usar como chave).
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Ambiente não configurado corretamente.')
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    // Rate limit por IP — evita que um único visitante crie contas em série.
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const { data: rateLimitOk, error: rateLimitError } = await adminClient.rpc('check_rate_limit', {
      p_key: `edge:self-register-family:${ip}`,
      p_limit: 5,
      p_window_seconds: 600,
    })
    if (rateLimitError) throw rateLimitError
    if (!rateLimitOk) {
      return new Response(JSON.stringify({ error: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 429,
      })
    }

    const {
      school_code,
      name,
      email,
      password,
      phone,
      doc_type,
      doc_number,
      profession,
      civil_status,
      guardian_type,
      students,
    } = await req.json()

    if (!school_code || !name || !email || !password || !Array.isArray(students) || students.length === 0) {
      throw new Error('Preencha todos os campos obrigatórios, incluindo ao menos um aluno.')
    }
    if (password.length < 6) {
      throw new Error('A senha deve ter ao menos 6 caracteres.')
    }
    const invalidStudent = students.find((s: { name?: string; birth_date?: string }) => !s.name?.trim() || !s.birth_date)
    if (invalidStudent) {
      throw new Error('Cada aluno precisa de nome e data de nascimento.')
    }

    // Resolve a escola pelo código público — nunca confirma se um código
    // "quase certo" existe, sempre a mesma mensagem genérica.
    const { data: school, error: schoolError } = await adminClient
      .from('schools')
      .select('id')
      .eq('school_code', school_code.trim().toUpperCase())
      .maybeSingle()

    if (schoolError || !school) {
      throw new Error('Código de escola inválido. Confirme com a secretaria da escola.')
    }
    const schoolId = school.id

    // 1. Criar o usuário no Auth — email_confirm true pra já poder logar
    // assim que for aprovado, sem precisar confirmar e-mail depois.
    const { data: newAuthUser, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role: 'family', school_id: schoolId },
    })
    if (authError || !newAuthUser.user) {
      const msg = authError?.message || ''
      if (msg.includes('already registered') || msg.includes('already been registered')) {
        throw new Error('Este e-mail já está em uso.')
      }
      throw new Error(`Erro ao criar conta: ${msg || 'Erro desconhecido'}`)
    }
    const newUserId = newAuthUser.user.id

    // 2. Inserir em public.users — status 'pending', role sempre 'family'.
    const { error: publicUserError } = await adminClient
      .from('users')
      .insert({
        id: newUserId,
        name,
        email,
        phone: phone || null,
        doc_type: doc_type || null,
        doc_number: doc_number || null,
        profession: profession || null,
        civil_status: civil_status || null,
        guardian_type: guardian_type || 'Responsável',
        role: 'family',
        school_id: schoolId,
        status: 'pending',
      })

    if (publicUserError) {
      await adminClient.auth.admin.deleteUser(newUserId)
      if (publicUserError.code === '23505') throw new Error('Este e-mail já está em uso.')
      throw new Error(`Erro ao salvar cadastro: ${publicUserError.message}`)
    }

    // 3. Inserir os alunos e vincular como responsável principal.
    const studentsToInsert = students.map((s: {
      name: string; birth_date: string; turma?: string;
      contracted_hours?: number; turno?: string; periodo?: string;
    }) => ({
      name: s.name,
      birth_date: s.birth_date,
      turma: s.turma || null,
      contracted_hours: s.contracted_hours || 6,
      turno: s.turno || null,
      periodo: s.periodo || null,
      family_id: newUserId,
      school_id: schoolId,
      status: 'idle',
    }))

    const { data: insertedStudents, error: studentsError } = await adminClient
      .from('students')
      .insert(studentsToInsert)
      .select('id')

    if (studentsError) {
      // Rollback completo — sem alunos, o cadastro não tem utilidade e
      // deixaria um usuário pendente órfão.
      await adminClient.from('users').delete().eq('id', newUserId)
      await adminClient.auth.admin.deleteUser(newUserId)
      throw new Error(`Erro ao salvar alunos: ${studentsError.message}`)
    }

    // 4. Adiciona o titular como autorizado (mesmo padrão do cadastro feito
    // pelo admin) — biometria fica pra ser cadastrada depois, no Totem.
    await adminClient.from('authorized_persons').insert([{
      family_id: newUserId,
      name,
      relation: `${guardian_type || 'Responsável'} (Titular)`,
      has_photo: false,
      emergency_order: 1,
      school_id: schoolId,
    }])

    // 5. Avisa os admins da escola — antes disso, um cadastro pendente só
    // era descoberto se alguém entrasse manualmente em Usuários > Pendentes.
    // Best-effort: falha ao notificar nunca derruba o cadastro em si (já
    // está tudo gravado nos passos anteriores).
    try {
      await notifyAdmins(adminClient, {
        schoolId,
        type: 'pending_registration',
        message: `${name} se cadastrou e aguarda aprovação.`,
        url: '/?tab=users',
        pushTitle: 'Novo cadastro pendente',
        pushBody: `${name} está aguardando aprovação para acessar o Zela.`,
        pushTag: 'pending-registration',
      })
    } catch (notifyErr) {
      console.error('[self-register-family] Erro ao notificar admins:', notifyErr)
    }

    return new Response(JSON.stringify({
      success: true,
      pending: true,
      studentsCreated: insertedStudents?.length || 0,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
