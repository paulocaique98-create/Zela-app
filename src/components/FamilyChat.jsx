import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, Loader2, ArrowLeft, Send, Clock, Building2, GraduationCap, Users2, Contact } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SETORES_CHAT } from '../lib/constants';
import { notifyChatMessage } from '../lib/notifyChatMessage';

// Suporte Zela não aparece pra família — só admins podem abrir conversa com o
// time Zela (ver AdminChat.jsx).
const SETORES_FAMILIA = SETORES_CHAT.filter(s => s.value !== 'suporte_zela');

const SETOR_ICONS = {
  administrativo: Building2,
  diretoria_pedagogica: GraduationCap,
  coordenacao: Users2,
  recepcao: Contact,
};

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function FamilyChat({ currentUser, currentSchool }) {
  const schoolId = currentSchool?.id || currentUser?.school_id;
  const [threads, setThreads] = useState(new Map()); // setor -> thread row
  const [lastMessages, setLastMessages] = useState(new Map()); // thread_id -> última mensagem
  const [isLoadingList, setIsLoadingList] = useState(true);

  const [activeSetor, setActiveSetor] = useState(null);
  const [activeThread, setActiveThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');

  const channelRef = useRef(null);
  const scrollRef = useRef(null);

  const fetchThreadList = async () => {
    if (!currentUser?.id) return;
    setIsLoadingList(true);
    try {
      const { data: threadRows, error: threadsError } = await supabase
        .from('chat_threads')
        .select('*')
        .eq('family_id', currentUser.id);
      if (threadsError) throw threadsError;

      const map = new Map();
      (threadRows || []).forEach(t => map.set(t.setor, t));
      setThreads(map);

      const threadIds = (threadRows || []).map(t => t.id);
      if (threadIds.length > 0) {
        const { data: msgRows } = await supabase
          .from('chat_messages')
          .select('thread_id, body, created_at, sender_role')
          .in('thread_id', threadIds)
          .order('created_at', { ascending: false });
        const lastMap = new Map();
        (msgRows || []).forEach(m => {
          if (!lastMap.has(m.thread_id)) lastMap.set(m.thread_id, m);
        });
        setLastMessages(lastMap);
      }
    } catch (err) {
      console.error('[FamilyChat] Erro ao buscar conversas:', err);
    } finally {
      setIsLoadingList(false);
    }
  };

  useEffect(() => {
    fetchThreadList();
  }, [currentUser?.id]);

  // Realtime na lista de setores: a trigger touch_chat_thread() atualiza
  // updated_at do thread a cada mensagem nova, então ouvir chat_threads cobre
  // o badge de não lida sem precisar abrir a conversa pra atualizar.
  useEffect(() => {
    if (!currentUser?.id || activeSetor) return;

    const channel = supabase
      .channel(`chat-threads-list-family-${currentUser.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_threads', filter: `family_id=eq.${currentUser.id}` }, () => {
        fetchThreadList();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id, activeSetor]);

  const openSetor = async (setorValue) => {
    setActiveSetor(setorValue);
    setIsLoadingThread(true);
    setError('');
    try {
      let thread = threads.get(setorValue);
      if (!thread) {
        const { data, error: upsertError } = await supabase
          .from('chat_threads')
          .upsert({ family_id: currentUser.id, school_id: schoolId, setor: setorValue }, { onConflict: 'family_id,setor' })
          .select()
          .single();
        if (upsertError) throw upsertError;
        thread = data;
        setThreads(prev => new Map(prev).set(setorValue, thread));
      }
      setActiveThread(thread);

      const { data: msgs, error: msgsError } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('thread_id', thread.id)
        .order('created_at', { ascending: true });
      if (msgsError) throw msgsError;
      setMessages(msgs || []);

      const { error: readError } = await supabase.from('chat_threads').update({ family_last_read_at: new Date().toISOString() }).eq('id', thread.id);
      if (readError) console.warn('[FamilyChat] Falha ao marcar conversa como lida:', readError);
    } catch (err) {
      console.error('[FamilyChat] Erro ao abrir conversa:', err);
      setError('Não foi possível abrir esta conversa.');
    } finally {
      setIsLoadingThread(false);
    }
  };

  const closeThread = () => {
    setActiveSetor(null);
    setActiveThread(null);
    setMessages([]);
    fetchThreadList();
  };

  // Realtime: acompanha novas mensagens da conversa aberta
  useEffect(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (!activeThread) return;

    const channel = supabase
      .channel(`chat-thread-${activeThread.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
        if (payload.new.thread_id !== activeThread.id) return;
        setMessages(prev => (prev.some(m => m.id === payload.new.id) ? prev : [...prev, payload.new]));
        if (payload.new.sender_role !== 'family') {
          supabase.from('chat_threads').update({ family_last_read_at: new Date().toISOString() }).eq('id', activeThread.id)
            .then(({ error: readError }) => {
              if (readError) console.warn('[FamilyChat] Falha ao marcar conversa como lida:', readError);
            });
        }
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
        .insert({ thread_id: activeThread.id, sender_id: currentUser.id, sender_role: 'family', body: body.trim() })
        .select()
        .single();
      if (sendError) throw sendError;
      setMessages(prev => (prev.some(m => m.id === data.id) ? prev : [...prev, data]));
      setBody('');
      notifyChatMessage(activeThread.id);
    } catch (err) {
      console.error('[FamilyChat] Erro ao enviar mensagem:', err);
      setError(err.message?.includes('Muitas mensagens') ? err.message : 'Não foi possível enviar a mensagem.');
    } finally {
      setIsSending(false);
    }
  };

  const isUnread = (setorValue) => {
    const thread = threads.get(setorValue);
    if (!thread) return false;
    const last = lastMessages.get(thread.id);
    if (!last || last.sender_role === 'family') return false;
    if (!thread.family_last_read_at) return true;
    return new Date(last.created_at) > new Date(thread.family_last_read_at);
  };

  if (activeSetor) {
    const setorInfo = SETORES_CHAT.find(s => s.value === activeSetor);
    const Icon = SETOR_ICONS[activeSetor] || MessageCircle;
    return (
      <div className="h-full flex flex-col bg-white rounded-zela-xl border border-outline-variant shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 p-4 sm:p-5 border-b border-outline-variant shrink-0">
          <button onClick={closeThread} className="p-2 -ml-1 text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container rounded-zela-md transition shrink-0">
            <ArrowLeft size={20} />
          </button>
          <div className="bg-primary/10 p-2 rounded-zela-md text-primary shrink-0">
            <Icon size={20} />
          </div>
          <h2 className="text-h3 text-on-surface">{setorInfo?.label}</h2>
        </div>

        {activeSetor !== 'suporte_zela' && (
          <div className="bg-amber-50 border-b border-amber-100 text-amber-700 px-4 sm:px-5 py-2 text-xs font-semibold flex items-center gap-2 shrink-0">
            <Clock size={14} className="shrink-0" /> A escola responde em horário comercial: das 07h às 19h.
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {isLoadingThread ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-16 text-on-surface-variant/70">
              <MessageCircle className="mx-auto h-12 w-12 text-outline-variant mb-3" />
              <p className="text-sm font-semibold text-on-surface-variant">Envie a primeira mensagem para {setorInfo?.label}.</p>
            </div>
          ) : (
            messages.map(m => {
              const mine = m.sender_role === 'family';
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] sm:max-w-[65%] rounded-zela-lg px-4 py-2.5 text-sm ${mine ? 'bg-primary text-white' : 'bg-surface-container text-on-surface'}`}>
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p className={`text-[10px] mt-1 ${mine ? 'text-indigo-200' : 'text-on-surface-variant/70'}`}>{formatTime(m.created_at)}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {error && (
          <div className="px-4 sm:px-5 pb-2">
            <div className="bg-red-50 border border-red-100 text-red-600 p-2.5 rounded-zela-md text-xs font-medium">{error}</div>
          </div>
        )}

        <form onSubmit={handleSend} className="flex items-center gap-2 p-4 sm:p-5 border-t border-outline-variant shrink-0">
          <input
            type="text"
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Digite sua mensagem..."
            className="flex-1 min-w-0 px-4 py-2.5 bg-surface-container-low border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary text-sm"
          />
          <button
            type="submit"
            disabled={isSending || !body.trim()}
            className="flex items-center justify-center gap-1.5 bg-primary hover:bg-primary-container disabled:bg-slate-300 text-white p-2.5 sm:px-4 sm:py-2.5 rounded-zela-md font-bold transition-all active:scale-95 shrink-0"
          >
            {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            <span className="hidden sm:inline">Enviar</span>
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white rounded-zela-xl border border-outline-variant shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 p-5 sm:p-6 border-b border-outline-variant shrink-0">
        <div className="bg-primary/10 p-2.5 rounded-zela-md text-primary">
          <MessageCircle size={22} />
        </div>
        <div>
          <h2 className="text-h3 text-on-surface">Chat</h2>
          <p className="text-on-surface-variant text-small hidden sm:block">Escolha o setor com quem deseja falar.</p>
        </div>
      </div>

      <div className="flex-1 min-h-0 p-5 sm:p-6 flex flex-col">
        {isLoadingList ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : (
          <div className="flex-1 flex flex-wrap content-start justify-center gap-3 min-h-0">
          {SETORES_FAMILIA.map(setor => {
            const Icon = SETOR_ICONS[setor.value] || MessageCircle;
            const unread = isUnread(setor.value);
            return (
              <button
                key={setor.value}
                onClick={() => openSetor(setor.value)}
                className="relative flex flex-col items-center justify-center gap-2 p-3 w-[calc(50%-0.375rem)] sm:w-[calc(33.333%-0.5rem)] aspect-square bg-white border border-outline-variant hover:border-primary/40 hover:bg-primary/5 rounded-zela-lg transition text-center"
              >
                {unread && <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-primary" />}
                <div className="bg-primary/10 p-2.5 rounded-zela-md text-primary shrink-0">
                  <Icon size={20} />
                </div>
                <p className="font-bold text-on-surface text-xs leading-tight">{setor.label}</p>
              </button>
            );
          })}
          </div>
        )}
      </div>
    </div>
  );
}
