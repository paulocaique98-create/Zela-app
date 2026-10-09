import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LifeBuoy, Loader2, ArrowLeft, Send, ChevronUp, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { notifyChatMessage } from '../lib/notifyChatMessage';

// P2.1 — ver AdminChat.jsx pro mesmo padrão de paginação.
const PAGE_SIZE = 50;

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// Pendente = mensagem mais nova que a última leitura da equipe.
const isUnread = (t) => (t.staff_last_read_at ? new Date(t.updated_at) > new Date(t.staff_last_read_at) : true);

export default function DeveloperChatSupport({ currentUser }) {
  const [threads, setThreads] = useState([]);
  const [isLoadingList, setIsLoadingList] = useState(true);

  const [activeThread, setActiveThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [busca, setBusca] = useState('');
  // Escolas abertas ou fechadas à mão; sem escolha, abre só quem tem pendência.
  const [abertas, setAbertas] = useState({});

  const channelRef = useRef(null);
  const scrollRef = useRef(null);
  const appendedRef = useRef(true);

  const fetchThreads = async () => {
    setIsLoadingList(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('chat_threads')
        .select('*, family:users!chat_threads_family_id_fkey(name), school:schools!chat_threads_school_id_fkey(name, school_code)')
        .eq('setor', 'suporte_zela')
        .order('updated_at', { ascending: false })
        .limit(300);
      if (fetchError) throw fetchError;
      setThreads(data || []);
    } catch (err) {
      console.error('[DeveloperChatSupport] Erro ao buscar conversas:', err);
    } finally {
      setIsLoadingList(false);
    }
  };

  useEffect(() => {
    fetchThreads();
  }, []);

  // Marca a conversa como lida pela equipe. A resposta da própria equipe também
  // mexe em updated_at (trigger), então sem isso ela voltaria como pendente.
  const markRead = async (threadId) => {
    const { error: readError } = await supabase.from('chat_threads').update({ staff_last_read_at: new Date().toISOString() }).eq('id', threadId);
    if (readError) console.warn('[DeveloperChatSupport] Falha ao marcar conversa como lida:', readError);
  };

  const openThread = async (thread) => {
    setActiveThread(thread);
    setIsLoadingThread(true);
    setError('');
    try {
      const { data: msgs, error: msgsError } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('thread_id', thread.id)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);
      if (msgsError) throw msgsError;
      const page = (msgs || []).slice().reverse();
      appendedRef.current = true;
      setMessages(page);
      setHasMoreOlder(page.length === PAGE_SIZE);
      await markRead(thread.id);
    } catch (err) {
      console.error('[DeveloperChatSupport] Erro ao abrir conversa:', err);
      setError('Não foi possível abrir esta conversa.');
    } finally {
      setIsLoadingThread(false);
    }
  };

  const loadOlderMessages = async () => {
    if (!activeThread || messages.length === 0 || isLoadingOlder) return;
    setIsLoadingOlder(true);
    const el = scrollRef.current;
    const prevScrollHeight = el?.scrollHeight || 0;
    try {
      const { data: older, error: olderError } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('thread_id', activeThread.id)
        .lt('created_at', messages[0].created_at)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);
      if (olderError) throw olderError;
      const page = (older || []).slice().reverse();
      appendedRef.current = false;
      setMessages(prev => [...page, ...prev]);
      setHasMoreOlder(page.length === PAGE_SIZE);
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevScrollHeight;
      });
    } catch (err) {
      console.error('[DeveloperChatSupport] Erro ao carregar mensagens anteriores:', err);
    } finally {
      setIsLoadingOlder(false);
    }
  };

  const closeThread = () => {
    setActiveThread(null);
    setMessages([]);
    setHasMoreOlder(false);
    fetchThreads();
  };

  useEffect(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (!activeThread) return;

    const channel = supabase
      .channel(`chat-thread-dev-${activeThread.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
        if (payload.new.thread_id !== activeThread.id) return;
        appendedRef.current = true;
        setMessages(prev => (prev.some(m => m.id === payload.new.id) ? prev : [...prev, payload.new]));
        // Conversa aberta na tela: mensagem que chega já conta como vista.
        if (payload.new.sender_role !== 'developer') markRead(payload.new.thread_id);
      })
      .subscribe();
    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [activeThread?.id]);

  useEffect(() => {
    if (!appendedRef.current) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const grupos = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const porEscola = new Map();
    for (const t of threads) {
      const chave = t.school_id || t.school?.school_code || 'sem-escola';
      if (!porEscola.has(chave)) porEscola.set(chave, { chave, escola: t.school, conversas: [], pendentes: 0, ultima: 0 });
      const g = porEscola.get(chave);
      g.conversas.push(t);
      if (isUnread(t)) g.pendentes += 1;
      g.ultima = Math.max(g.ultima, new Date(t.updated_at).getTime());
    }
    let lista = [...porEscola.values()];
    if (termo) {
      lista = lista
        .map(g => {
          const escolaBate = `${g.escola?.school_code || ''} ${g.escola?.name || ''}`.toLowerCase().includes(termo);
          const conversas = escolaBate ? g.conversas : g.conversas.filter(t => (t.family?.name || '').toLowerCase().includes(termo));
          return { ...g, conversas };
        })
        .filter(g => g.conversas.length > 0);
    }
    // Quem tem pendência primeiro; depois a atividade mais recente.
    return lista.sort((a, b) => (b.pendentes > 0) - (a.pendentes > 0) || b.ultima - a.ultima);
  }, [threads, busca]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!body.trim() || !activeThread) return;
    setIsSending(true);
    setError('');
    try {
      const { data, error: sendError } = await supabase
        .from('chat_messages')
        .insert({ thread_id: activeThread.id, sender_id: currentUser.id, sender_role: 'developer', body: body.trim() })
        .select()
        .single();
      if (sendError) throw sendError;
      appendedRef.current = true;
      setMessages(prev => (prev.some(m => m.id === data.id) ? prev : [...prev, data]));
      setBody('');
      markRead(activeThread.id);
      notifyChatMessage(activeThread.id);
    } catch (err) {
      console.error('[DeveloperChatSupport] Erro ao enviar mensagem:', err);
      setError(err.message?.includes('Muitas mensagens') ? err.message : 'Não foi possível enviar a mensagem.');
    } finally {
      setIsSending(false);
    }
  };

  if (activeThread) {
    return (
      <div className="h-full flex flex-col bg-dev-surface -m-3 sm:m-0 rounded-none border-0 shadow-none overflow-hidden">
        <div className="flex items-center gap-3 p-4 sm:p-5 border-b border-dev-border shrink-0">
          <button onClick={closeThread} className="p-2 -ml-1 text-dev-text-muted hover:text-dev-text hover:bg-dev-surface-high rounded-zela-md transition shrink-0">
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <h2 className="text-h3 text-dev-text">{activeThread.family?.name || 'Admin'}</h2>
            <p className="text-xs text-dev-text-muted">{activeThread.school?.school_code} · {activeThread.school?.name}</p>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-none p-4 sm:p-5 space-y-3">
          {isLoadingThread ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-dev-primary animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-16 text-dev-text-muted">
              <LifeBuoy className="mx-auto h-12 w-12 text-dev-surface-high mb-3" />
              <p className="text-sm font-semibold text-dev-text-muted">Nenhuma mensagem ainda.</p>
            </div>
          ) : (
            <>
              {hasMoreOlder && (
                <div className="flex justify-center pb-2">
                  <button
                    onClick={loadOlderMessages}
                    disabled={isLoadingOlder}
                    className="flex items-center gap-1.5 text-xs font-bold text-dev-primary bg-dev-primary-container hover:brightness-110 px-3 py-1.5 rounded-zela-md transition disabled:opacity-60"
                  >
                    {isLoadingOlder ? <Loader2 size={14} className="animate-spin" /> : <ChevronUp size={14} />}
                    Carregar mensagens anteriores
                  </button>
                </div>
              )}
              {messages.map(m => {
                const mine = m.sender_role === 'developer';
                return (
                  <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] sm:max-w-[65%] rounded-zela-lg px-4 py-2.5 text-sm ${mine ? 'bg-dev-primary text-dev-bg' : 'bg-dev-surface-high text-dev-text'}`}>
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      <p className={`text-[10px] mt-1 ${mine ? 'text-dev-bg/70' : 'text-dev-text-muted'}`}>{formatTime(m.created_at)}</p>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {error && (
          <div className="px-4 sm:px-5 pb-2">
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-2.5 rounded-zela-md text-xs font-medium">{error}</div>
          </div>
        )}

        <form onSubmit={handleSend} className="flex items-center gap-2 p-4 sm:p-5 border-t border-dev-border shrink-0">
          <input
            type="text"
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Digite sua mensagem..."
            className="flex-1 min-w-0 px-4 py-2.5 bg-dev-bg border border-dev-border text-dev-text placeholder:text-dev-text-muted rounded-zela-md focus:outline-none focus:ring-2 focus:ring-dev-primary text-sm"
          />
          <button
            type="submit"
            disabled={isSending || !body.trim()}
            className="flex items-center justify-center gap-1.5 bg-dev-primary hover:brightness-110 disabled:bg-dev-surface-high disabled:text-dev-text-muted text-dev-bg p-2.5 sm:px-4 sm:py-2.5 rounded-zela-md font-bold transition-all active:scale-95 shrink-0"
          >
            {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            <span className="hidden sm:inline">Enviar</span>
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-dev-surface -m-3 sm:m-0 rounded-none border-0 shadow-none overflow-hidden">
      {/* Título "Suporte Zela" e ícone removidos (o Header do app já mostra
          o nome da tela dinamicamente); só a descrição, direto. */}
      <div className="flex items-center gap-3 p-4 sm:p-6 border-b border-dev-border shrink-0">
        <p className="text-dev-text-muted text-small hidden lg:block mr-auto">Conversas das escolas contratantes, agrupadas por escola.</p>
        <div className="relative w-full sm:w-72 lg:ml-auto">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dev-text-muted" aria-hidden="true" />
          <input
            type="search"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar escola ou pessoa"
            aria-label="Buscar escola ou pessoa"
            className="w-full pl-9 pr-3 py-2 bg-dev-bg border border-dev-border rounded-zela-md text-sm text-dev-text focus:ring-2 focus:ring-dev-primary outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-none p-4 sm:p-6 space-y-3">
        {isLoadingList ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-dev-primary animate-spin" />
          </div>
        ) : threads.length === 0 ? (
          <div className="text-center py-16 text-dev-text-muted">
            <LifeBuoy className="mx-auto h-12 w-12 text-dev-surface-high mb-3" />
            <p className="text-sm font-semibold text-dev-text-muted">Nenhuma conversa de suporte ainda.</p>
          </div>
        ) : grupos.length === 0 ? (
          <p className="text-center py-16 text-sm font-semibold text-dev-text-muted">Nenhuma escola ou pessoa encontrada.</p>
        ) : (
          grupos.map(g => {
            const aberta = busca.trim() ? true : (abertas[g.chave] ?? g.pendentes > 0);
            const Seta = aberta ? ChevronDown : ChevronRight;
            return (
              <section key={g.chave} className="border border-dev-border rounded-zela-lg overflow-hidden bg-dev-surface">
                <button
                  type="button"
                  onClick={() => setAbertas(prev => ({ ...prev, [g.chave]: !aberta }))}
                  aria-expanded={aberta}
                  className={`w-full flex items-center gap-3 px-4 py-3 bg-dev-bg hover:bg-dev-surface-high transition text-left border-l-4 ${g.pendentes > 0 ? 'border-l-warning' : 'border-l-transparent'}`}
                >
                  <Seta size={16} className="text-dev-text-muted shrink-0" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-dev-text text-sm truncate">{g.escola?.name || 'Escola sem nome'}</p>
                    <p className="text-dev-text-muted text-xs truncate">
                      <span className="font-mono">{g.escola?.school_code}</span> {g.conversas.length === 1 ? '1 conversa' : `${g.conversas.length} conversas`}
                    </p>
                  </div>
                  {g.pendentes > 0 && (
                    <span className="shrink-0 text-xs font-bold px-2 py-1 rounded-sm bg-warning/15 text-warning">
                      {g.pendentes === 1 ? '1 pendente' : `${g.pendentes} pendentes`}
                    </span>
                  )}
                </button>
                {aberta && (
                  <div className="divide-y divide-dev-border border-t border-dev-border">
                    {g.conversas.map(t => (
                      <button
                        key={t.id}
                        onClick={() => openThread(t)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-dev-surface-high transition text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm truncate text-dev-text ${isUnread(t) ? 'font-bold' : 'font-semibold'}`}>{t.family?.name || 'Admin'}</p>
                          <p className="text-dev-text-muted text-xs truncate">Atualizado em {formatTime(t.updated_at)}</p>
                        </div>
                        {isUnread(t) && <span className="w-2.5 h-2.5 rounded-full bg-warning shrink-0" aria-label="Mensagem pendente" />}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
