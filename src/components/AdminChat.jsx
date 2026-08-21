import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, Loader2, ArrowLeft, Send, Clock, Building2, GraduationCap, Users2, Contact, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SETORES_CHAT } from '../lib/constants';
import { notifyChatMessage } from '../lib/notifyChatMessage';

const SETOR_ICONS = {
  administrativo: Building2,
  diretoria_pedagogica: GraduationCap,
  coordenacao: Users2,
  recepcao: Contact,
};

const SETORES_ADMIN = SETORES_CHAT.filter(s => s.value !== 'suporte_zela');

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function isBusinessHoursNow() {
  const hour = Number(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }));
  return hour >= 7 && hour < 19;
}

export default function AdminChat({ currentUser, currentSchool }) {
  const schoolId = currentSchool?.id || currentUser?.school_id;
  const allowedSetores = currentUser?.chat_visibilidade_total
    ? SETORES_ADMIN
    : SETORES_ADMIN.filter(s => s.value === currentUser?.departamento);

  const [threads, setThreads] = useState([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [tab, setTab] = useState(allowedSetores[0]?.value || null);

  const [activeThread, setActiveThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [inBusinessHours, setInBusinessHours] = useState(isBusinessHoursNow());

  const channelRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => setInBusinessHours(isBusinessHoursNow()), 60000);
    return () => clearInterval(timer);
  }, []);

  const fetchThreads = async () => {
    if (!schoolId) return;
    setIsLoadingList(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('chat_threads')
        .select('*, family:users!chat_threads_family_id_fkey(name)')
        .eq('school_id', schoolId)
        .order('updated_at', { ascending: false });
      if (fetchError) throw fetchError;
      setThreads(data || []);
    } catch (err) {
      console.error('[AdminChat] Erro ao buscar conversas:', err);
    } finally {
      setIsLoadingList(false);
    }
  };

  useEffect(() => {
    fetchThreads();
  }, [schoolId]);

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
      await supabase.from('chat_threads').update({ staff_last_read_at: new Date().toISOString() }).eq('id', thread.id);
    } catch (err) {
      console.error('[AdminChat] Erro ao abrir conversa:', err);
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
      .channel(`chat-thread-admin-${activeThread.id}`)
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
    if (!body.trim() || !activeThread || !inBusinessHours) return;
    setIsSending(true);
    setError('');
    try {
      const { data, error: sendError } = await supabase
        .from('chat_messages')
        .insert({ thread_id: activeThread.id, sender_id: currentUser.id, sender_role: 'admin', body: body.trim() })
        .select()
        .single();
      if (sendError) throw sendError;
      setMessages(prev => (prev.some(m => m.id === data.id) ? prev : [...prev, data]));
      setBody('');
      notifyChatMessage(activeThread.id);
    } catch (err) {
      console.error('[AdminChat] Erro ao enviar mensagem:', err);
      setError('Não foi possível enviar a mensagem. Confira se ainda está dentro do horário comercial (07h-19h).');
    } finally {
      setIsSending(false);
    }
  };

  if (!currentUser?.departamento && !currentUser?.chat_visibilidade_total) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-white rounded-3xl border border-slate-200 shadow-sm p-8 text-center">
        <MessageCircle className="text-slate-300 w-12 h-12 mb-3" />
        <h2 className="text-lg font-bold text-slate-800 mb-1">Nenhum departamento configurado</h2>
        <p className="text-slate-500 text-sm max-w-sm">
          Peça ao admin principal da escola para configurar seu departamento em Gestão de Usuários, para começar a ver as conversas do chat.
        </p>
      </div>
    );
  }

  if (activeThread) {
    return (
      <div className="h-full flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 p-4 sm:p-5 border-b border-slate-100 shrink-0">
          <button onClick={closeThread} className="p-2 -ml-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition shrink-0">
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-800 truncate">{activeThread.family?.name || 'Responsável'}</h2>
            <p className="text-xs text-slate-400">{SETORES_ADMIN.find(s => s.value === activeThread.setor)?.label}</p>
          </div>
        </div>

        {!inBusinessHours && (
          <div className="bg-amber-50 border-b border-amber-100 text-amber-700 px-4 sm:px-5 py-2 text-xs font-semibold flex items-center gap-2 shrink-0">
            <Clock size={14} className="shrink-0" /> Fora do horário comercial (07h-19h) — só é possível ler, envio de mensagem está bloqueado.
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {isLoadingThread ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <MessageCircle className="mx-auto h-12 w-12 text-slate-300 mb-3" />
              <p className="text-sm font-semibold text-slate-600">Nenhuma mensagem ainda.</p>
            </div>
          ) : (
            messages.map(m => {
              const mine = m.sender_role !== 'family';
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
            placeholder={inBusinessHours ? 'Digite sua mensagem...' : 'Envio bloqueado fora do horário comercial'}
            disabled={!inBusinessHours}
            className="flex-1 min-w-0 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={isSending || !body.trim() || !inBusinessHours}
            className="flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white p-2.5 sm:px-4 sm:py-2.5 rounded-xl font-bold transition-all active:scale-95 shrink-0"
          >
            {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            <span className="hidden sm:inline">Enviar</span>
          </button>
        </form>
      </div>
    );
  }

  const filteredThreads = threads.filter(t => t.setor === tab);

  return (
    <div className="h-full flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 p-5 sm:p-6 border-b border-slate-100 shrink-0">
        <div className="bg-indigo-50 p-2.5 rounded-xl text-indigo-600">
          <MessageCircle size={22} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">Chat</h2>
          <p className="text-slate-500 text-sm hidden sm:block">Converse com as famílias por setor.</p>
        </div>
      </div>

      {allowedSetores.length > 1 && (
        <div className="flex items-center justify-between gap-2 px-5 sm:px-6 pt-4 shrink-0">
          <button
            onClick={() => {
              const i = allowedSetores.findIndex(s => s.value === tab);
              setTab(allowedSetores[(i - 1 + allowedSetores.length) % allowedSetores.length].value);
            }}
            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition shrink-0"
          >
            <ChevronLeft size={20} />
          </button>
          <span key={tab} className="flex-1 text-center bg-indigo-50 text-indigo-700 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wide leading-tight animate-in fade-in duration-150">
            {allowedSetores.find(s => s.value === tab)?.label}
          </span>
          <button
            onClick={() => {
              const i = allowedSetores.findIndex(s => s.value === tab);
              setTab(allowedSetores[(i + 1) % allowedSetores.length].value);
            }}
            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition shrink-0"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-2">
        {isLoadingList ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          </div>
        ) : filteredThreads.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <MessageCircle className="mx-auto h-12 w-12 text-slate-300 mb-3" />
            <p className="text-sm font-semibold text-slate-600">Nenhuma conversa neste setor ainda.</p>
          </div>
        ) : (
          filteredThreads.map(t => {
            const unread = t.staff_last_read_at ? new Date(t.updated_at) > new Date(t.staff_last_read_at) : true;
            return (
              <button
                key={t.id}
                onClick={() => openThread(t)}
                className="w-full flex items-center gap-3 p-4 bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 rounded-2xl transition text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-800 text-sm truncate">{t.family?.name || 'Responsável'}</p>
                  <p className="text-slate-400 text-xs">Atualizado em {formatTime(t.updated_at)}</p>
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
