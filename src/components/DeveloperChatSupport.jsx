import React, { useEffect, useRef, useState } from 'react';
import { LifeBuoy, Loader2, ArrowLeft, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { notifyChatMessage } from '../lib/notifyChatMessage';

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function DeveloperChatSupport({ currentUser }) {
  const [threads, setThreads] = useState([]);
  const [isLoadingList, setIsLoadingList] = useState(true);

  const [activeThread, setActiveThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');

  const channelRef = useRef(null);
  const scrollRef = useRef(null);

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

  const openThread = async (thread) => {
    setActiveThread(thread);
    setIsLoadingThread(true);
    setError('');
    try {
      const { data: msgs, error: msgsError } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('thread_id', thread.id)
        .order('created_at', { ascending: true });
      if (msgsError) throw msgsError;
      setMessages(msgs || []);
      const { error: readError } = await supabase.from('chat_threads').update({ staff_last_read_at: new Date().toISOString() }).eq('id', thread.id);
      if (readError) console.warn('[DeveloperChatSupport] Falha ao marcar conversa como lida:', readError);
    } catch (err) {
      console.error('[DeveloperChatSupport] Erro ao abrir conversa:', err);
      setError('Não foi possível abrir esta conversa.');
    } finally {
      setIsLoadingThread(false);
    }
  };

  const closeThread = () => {
    setActiveThread(null);
    setMessages([]);
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
        setMessages(prev => (prev.some(m => m.id === payload.new.id) ? prev : [...prev, payload.new]));
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
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

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
      setMessages(prev => (prev.some(m => m.id === data.id) ? prev : [...prev, data]));
      setBody('');
      notifyChatMessage(activeThread.id);
    } catch (err) {
      console.error('[DeveloperChatSupport] Erro ao enviar mensagem:', err);
      setError('Não foi possível enviar a mensagem.');
    } finally {
      setIsSending(false);
    }
  };

  if (activeThread) {
    return (
      <div className="h-full flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 p-4 sm:p-5 border-b border-slate-100 shrink-0">
          <button onClick={closeThread} className="p-2 -ml-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition shrink-0">
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-800 truncate">{activeThread.family?.name || 'Responsável'}</h2>
            <p className="text-xs text-slate-400 truncate">{activeThread.school?.school_code} — {activeThread.school?.name}</p>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {isLoadingThread ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <LifeBuoy className="mx-auto h-12 w-12 text-slate-300 mb-3" />
              <p className="text-sm font-semibold text-slate-600">Nenhuma mensagem ainda.</p>
            </div>
          ) : (
            messages.map(m => {
              const mine = m.sender_role === 'developer';
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] sm:max-w-[65%] rounded-2xl px-4 py-2.5 text-sm ${mine ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p className={`text-[10px] mt-1 ${mine ? 'text-indigo-200' : 'text-slate-400'}`}>{formatTime(m.created_at)}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {error && (
          <div className="px-4 sm:px-5 pb-2">
            <div className="bg-red-50 border border-red-100 text-red-600 p-2.5 rounded-xl text-xs font-medium">{error}</div>
          </div>
        )}

        <form onSubmit={handleSend} className="flex items-center gap-2 p-4 sm:p-5 border-t border-slate-100 shrink-0">
          <input
            type="text"
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Digite sua mensagem..."
            className="flex-1 min-w-0 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          />
          <button
            type="submit"
            disabled={isSending || !body.trim()}
            className="flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white p-2.5 sm:px-4 sm:py-2.5 rounded-xl font-bold transition-all active:scale-95 shrink-0"
          >
            {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            <span className="hidden sm:inline">Enviar</span>
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 p-5 sm:p-6 border-b border-slate-100 shrink-0">
        <div className="bg-indigo-50 p-2.5 rounded-xl text-indigo-600">
          <LifeBuoy size={22} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">Suporte Zela</h2>
          <p className="text-slate-500 text-sm hidden sm:block">Conversas de responsáveis de todas as escolas.</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-2">
        {isLoadingList ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          </div>
        ) : threads.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <LifeBuoy className="mx-auto h-12 w-12 text-slate-300 mb-3" />
            <p className="text-sm font-semibold text-slate-600">Nenhuma conversa de suporte ainda.</p>
          </div>
        ) : (
          threads.map(t => {
            const unread = t.staff_last_read_at ? new Date(t.updated_at) > new Date(t.staff_last_read_at) : true;
            return (
              <button
                key={t.id}
                onClick={() => openThread(t)}
                className="w-full flex items-center gap-3 p-4 bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 rounded-2xl transition text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-800 text-sm truncate">{t.family?.name || 'Responsável'}</p>
                  <p className="text-slate-400 text-xs truncate">{t.school?.school_code} — {t.school?.name} • Atualizado em {formatTime(t.updated_at)}</p>
                </div>
                {unread && <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 shrink-0" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
