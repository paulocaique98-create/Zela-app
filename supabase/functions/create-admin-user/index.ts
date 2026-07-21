import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // Get the session or user object
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      throw new Error('Não autorizado');
    }

    // Verify if requester is admin or developer
    const { data: userData } = await supabaseClient
      .from('users')
      .select('role, school_id')
      .eq('id', user.id)
      .single();

    if (!userData || (userData.role !== 'admin' && userData.role !== 'developer')) {
      throw new Error('Permissão negada');
    }

    const { email, password, name, role, school_id, extra_fields } = await req.json();

    // Se for admin, só pode criar para a própria escola
    let finalSchoolId = school_id;
    if (userData.role === 'admin') {
      finalSchoolId = userData.school_id;
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: newAuthUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: {
        name,
        role,
        school_id: finalSchoolId
      }
    });

    if (createUserError) throw createUserError;

    // Inserir no public.users
    const { data: newUser, error: dbError } = await supabaseAdmin
      .from('users')
      .insert({
        id: newAuthUser.user.id,
        name,
        email,
        role,
        school_id: finalSchoolId,
        ...extra_fields
      })
      .select()
      .single();

    if (dbError) {
      // Rollback se falhar no public.users
      await supabaseAdmin.auth.admin.deleteUser(newAuthUser.user.id);
      throw dbError;
    }

    return new Response(JSON.stringify(newUser), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
