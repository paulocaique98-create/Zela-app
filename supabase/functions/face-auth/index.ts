import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.11.0"

// CONSTANTES E CONFIGURAÇÕES
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const MATCH_THRESHOLD = 0.55 // Limite de distância euclidiana (menor = mais parecido)

serve(async (req) => {
  // CORS configuration
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers })

  try {
    const { snapshot_base64, nonce, student_ids, action, school_id } = await req.json()

    // 1. Instanciar Supabase Client com Service Role (Bypasses RLS para validação interna)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 2. Verificar Nonce (Challenge-Response)
    const { data: nonceData, error: nonceError } = await supabase
      .from('auth_nonces')
      .delete() // Consome o nonce imediatamente para evitar replay attacks
      .eq('nonce', nonce)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (nonceError || !nonceData) {
      return new Response(JSON.stringify({ error: 'Nonce inválido ou expirado' }), { status: 401, headers })
    }

    // 3. Processar Snapshot para Obter o Descritor (Requer lib de IA no Deno)
    // NOTA: No ambiente Deno real, você precisará de uma versão WASM do face-api.js 
    // ou enviar a imagem para uma API externa (ex: AWS Rekognition) para extrair o array de 128 floats.
    // Aqui simulamos a extração para fins de demonstração arquitetural.
    
    // const snapshotDescriptor = await extractFaceDescriptorWasm(snapshot_base64);
    const snapshotDescriptor = []; // Mock

    // 4. Buscar Descritores Salvos dos Responsáveis daquela Escola
    const { data: authorized, error: authError } = await supabase
      .from('authorized_persons')
      .select('id, face_descriptor, family_id')
      .eq('school_id', school_id)
      .not('face_descriptor', 'is', null)

    if (authError || !authorized) throw new Error('Erro ao buscar biometrias cadastradas')

    // 5. Comparar Descritor (Distância Euclidiana)
    let bestMatch = null;
    let minDistance = Infinity;

    for (const person of authorized) {
      try {
        const savedDescriptor = JSON.parse(person.face_descriptor)
        let distance = 0
        for (let i = 0; i < savedDescriptor.length; i++) {
          distance += Math.pow(snapshotDescriptor[i] - savedDescriptor[i], 2)
        }
        distance = Math.sqrt(distance)

        if (distance < minDistance) {
          minDistance = distance
          bestMatch = person
        }
      } catch (e) {
        console.warn('Erro ao parsear descritor para a pessoa:', person.id)
      }
    }

    if (minDistance > MATCH_THRESHOLD || !bestMatch) {
      return new Response(JSON.stringify({ error: 'Biometria não reconhecida' }), { status: 403, headers })
    }

    // 6. Atualizar Status dos Alunos
    const now = new Date();
    const nowStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = now.toISOString().split('T')[0];
    const fullRecordStr = `${dateStr}|${nowStr}`;

    for (const studentId of student_ids) {
      let updateData = { status: action }
      if (action === 'in_school' || action === 'pending_entry') {
        updateData.today_entry = fullRecordStr
        updateData.today_exit = null
      } else if (action === 'left' || action === 'pending_exit') {
        updateData.today_exit = fullRecordStr
      }

      await supabase.from('students').update(updateData).eq('id', studentId)
      
      // Criar log imutável
      await supabase.from('attendance_logs').insert([{
        student_id: studentId,
        family_id: bestMatch.family_id,
        school_id: school_id,
        event_type: action === 'in_school' ? 'entry' : 'exit',
        event_time: now.toISOString(),
        recorded_by: 'EDGE_FUNCTION_BIOMETRY',
      }])
    }

    return new Response(JSON.stringify({ success: true, match: bestMatch.id, distance: minDistance }), {
      headers: { ...headers, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers })
  }
})
