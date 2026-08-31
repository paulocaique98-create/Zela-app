import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// P2.1 (Prompt Mestre de Evolução) — o chat carregava o histórico inteiro
// de uma thread sem limit(). AdminChat/DeveloperChatSupport/FamilyChat
// agora paginam (PAGE_SIZE=50, "carregar mensagens anteriores"). Este
// teste exercita o EXATO padrão de query usado pelos 3 componentes
// (primeira página desc+limit+reverse, página seguinte com .lt() na mais
// antiga já carregada) contra uma thread real com mais de 1 página de
// mensagens.
const runIf = hasIntegrationCredentials ? describe : describe.skip;
const PAGE_SIZE = 5; // pequeno de propósito, só pra não inserir 50+ linhas de teste

runIf('Paginação de chat — mesmo padrão usado pelos componentes', () => {
  let school, family, thread;
  const TOTAL_MESSAGES = 12; // gera 3 páginas de 5 (5+5+2)

  beforeAll(async () => {
    school = await createTestSchool();
    family = await createTestUser({ role: 'family', schoolId: school });

    const { data: t, error } = await adminClient
      .from('chat_threads')
      .insert({ school_id: school, family_id: family.id, setor: 'administrativo' })
      .select('id')
      .single();
    if (error) throw error;
    thread = t.id;

    // Insere em sequência, com created_at explícito e crescente pra
    // garantir ordem determinística (inserts muito rápidos podem cair no
    // mesmo timestamp de outra forma).
    const base = Date.now();
    for (let i = 0; i < TOTAL_MESSAGES; i++) {
      await adminClient.from('chat_messages').insert({
        thread_id: thread, sender_id: family.id, sender_role: 'family',
        body: `Mensagem ${i}`,
        created_at: new Date(base + i * 1000).toISOString(),
      });
    }
  });

  afterAll(async () => {
    await adminClient.from('chat_messages').delete().eq('thread_id', thread);
    await adminClient.from('chat_threads').delete().eq('id', thread);
    await deleteTestUser(family.id);
    await deleteTestSchool(school);
  });

  it('1ª página traz só as PAGE_SIZE mensagens mais recentes, em ordem cronológica', async () => {
    const { data } = await adminClient
      .from('chat_messages')
      .select('body, created_at')
      .eq('thread_id', thread)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    const page = data.slice().reverse();

    expect(page).toHaveLength(PAGE_SIZE);
    // As 5 mais recentes são "Mensagem 7".."Mensagem 11"
    expect(page.map(m => m.body)).toEqual(['Mensagem 7', 'Mensagem 8', 'Mensagem 9', 'Mensagem 10', 'Mensagem 11']);
  });

  it('"carregar anteriores" busca a página seguinte pra trás, sem repetir nem pular mensagens', async () => {
    // 1ª página (mais recentes)
    const { data: firstRaw } = await adminClient
      .from('chat_messages')
      .select('body, created_at')
      .eq('thread_id', thread)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    const firstPage = firstRaw.slice().reverse();

    // 2ª página: tudo ANTES da mais antiga já carregada
    const { data: secondRaw } = await adminClient
      .from('chat_messages')
      .select('body, created_at')
      .eq('thread_id', thread)
      .lt('created_at', firstPage[0].created_at)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    const secondPage = secondRaw.slice().reverse();

    expect(secondPage).toHaveLength(PAGE_SIZE);
    expect(secondPage.map(m => m.body)).toEqual(['Mensagem 2', 'Mensagem 3', 'Mensagem 4', 'Mensagem 5', 'Mensagem 6']);

    // 3ª página: as 2 restantes (menos que PAGE_SIZE -- sinaliza "não tem mais")
    const { data: thirdRaw } = await adminClient
      .from('chat_messages')
      .select('body, created_at')
      .eq('thread_id', thread)
      .lt('created_at', secondPage[0].created_at)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    const thirdPage = thirdRaw.slice().reverse();

    expect(thirdPage).toHaveLength(2);
    expect(thirdPage.map(m => m.body)).toEqual(['Mensagem 0', 'Mensagem 1']);

    // Junta as 3 páginas na ordem que os componentes montam (prepend) e
    // confirma que reconstrói o histórico completo, sem duplicar/pular.
    const rebuilt = [...thirdPage, ...secondPage, ...firstPage].map(m => m.body);
    expect(rebuilt).toEqual(Array.from({ length: TOTAL_MESSAGES }, (_, i) => `Mensagem ${i}`));
  });
});
