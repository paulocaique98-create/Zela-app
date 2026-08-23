import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, Loader2, ArrowLeft, Send, Clock, Building2, GraduationCap, Users2, Contact, ChevronLeft, ChevronRight, LifeBuoy } from 'lucide-react';
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
const SUPORTE_ZELA_LABEL = SETORES_CHAT.find(s => s.value === 'suporte_zela')?.label || 'Suporte Zela';

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
        .order('updated_at', { ascending: false })
        .limit(300);
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

  // Realtime na lista de conversas: a trigger touch_chat_thread() atualiza
  // updated_at do thread a cada mensagem nova, então ouvir chat_threads cobre
  // tanto "chegou mensagem nova" quanto "badge de não lida" sem precisar abrir
  // a conversa pra atualizar.
  useEffect(() => {
    if (!schoolId || activeThread) return;

    const channel = supabase
      .channel(`chat-threads-list-admin-${schoolId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_threads', filter: `school_id=eq.${schoolId}` }, () => {
        fetchThreads();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [schoolId, activeThread]);

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
      if (readError) console.warn('[AdminChat] Falha ao marcar conversa como lida:', readError);
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

  // Suporte Zela é uma conversa própria do admin com o time Zela (não uma
  // lista de famílias) — abre direto, criando a thread se ainda não existir.
  const [isOpeningSupport, setIsOpeningSupport] = useState(false);
  const openSupportThread = async () => {
    setIsOpeningSupport(true);
    setError('');
    try {
      const { data, error: upsertError } = await supabase
        .from('chat_threads')
        .upsert({ family_id: currentUser.id, school_id: schoolId, setor: 'suporte_zela' }, { onConflict: 'family_id,setor' })
        .select()
        .single();
      if (upsertError) throw upsertError;
      await openThread(data);
    } catch (err) {
      console.error('[AdminChat] Erro ao abrir conversa com o Suporte Zela:', err);
      setError('Não foi possível abrir a conversa com o Suporte Zela.');
    } finally {
      setIsOpeningSupport(false);
    }
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

  const isSupportThread = activeThread?.setor === 'suporte_zela';
  const canSend = isSupportThread || inBusinessHours;

  const handleSend = async (e) => {
    e.preventDefault();
    if (!body.trim() || !activeThread || !canSend) return;
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
      if (err.message?.includes('Muitas mensagens')) {
        setError(err.message);
      } else {
        setError(isSupportThread ? 'Não foi possível enviar a mensagem.' : 'Não foi possível enviar a mensagem. Confira se ainda está dentro do horário comercial (07h-19h).');
      }
    } finally {
      setIsSending(false);
    }
  };

  if (!currentUser?.departamento && !currentUser?.chat_visibilidade_total) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-white rounded-zela-xl border border-outline-variant shadow-sm p-8 text-center gap-4">
        <div>
          <MessageCircle className="text-outline-variant w-12 h-12 mb-3 mx-auto" />
          <h2 className="text-h3 text-on-surface mb-1">Nenhum departamento configurado</h2>
          <p className="text-on-surface-variant text-small max-w-sm">
            Peça ao admin principal da escola para configurar seu departamento em Gestão de Usuários, para começar a ver as conversas do chat.
          </p>
        </div>
        <button
          onClick={openSupportThread}
          disabled={isOpeningSupport}
          className="flex items-center gap-2 bg-primary/10 hover:bg-primary/20 text-primary px-4 py-2.5 rounded-zela-md font-bold transition-all active:scale-95 text-sm disabled:opacity-60"
        >
          {isOpeningSupport ? <Loader2 size={16} className="animate-spin" /> : <LifeBuoy size={16} />}
          Falar com o Suporte Zela
        </button>
      </div>
    );
  }

  if (activeThread) {
    return (
      <div className="h-full flex flex-col bg-white rounded-zela-xl border border-outline-variant shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 p-4 sm:p-5 border-b border-outline-variant shrink-0">
          <button onClick={closeThread} className="p-2 -ml-1 text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container rounded-zela-md transition shrink-0">
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <h2 className="text-h3 text-on-surface">{isSupportThread ? 'Suporte Zela' : (activeThread.family?.name || 'Responsável')}</h2>
            <p className="text-xs text-on-surface-variant/70">{isSupportThread ? 'Equipe da plataforma Zela' : SETORES_ADMIN.find(s => s.value === activeThread.setor)?.label}</p>
          </div>
        </div>

        {!isSupportThread && !inBusinessHours && (
          <div className="bg-amber-50 border-b border-amber-100 text-amber-700 px-4 sm:px-5 py-2 text-xs font-semibold flex items-center gap-2 shrink-0">
            <Clock size={14} className="shrink-0" /> Fora do horário comercial (07h-19h) — só é possível ler, envio de mensagem está bloqueado.
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
              <p className="text-sm font-semibold text-on-surface-variant">Nenhuma mensagem ainda.</p>
            </div>
          ) : (
            messages.map(m => {
              const mine = m.sender_id === currentUser.id;
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
            placeholder={canSend ? 'Digite sua mensagem...' : 'Envio bloqueado fora do horário comercial'}
            disabled={!canSend}
            className="flex-1 min-w-0 px-4 py-2.5 bg-surface-container-low border border-outline-variant rounded-zela-md focus:outline-none focus:ring-2 focus:ring-primary text-sm disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={isSending || !body.trim() || !canSend}
            className="flex items-center justify-center gap-1.5 bg-primary hover:bg-primary-container disabled:bg-slate-300 text-white p-2.5 sm:px-4 sm:py-2.5 rounded-zela-md font-bold transition-all active:scale-95 shrink-0"
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
    <div className="h-full flex flex-col bg-white rounded-zela-xl border border-outline-variant shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-5 sm:p-6 border-b border-outline-variant shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="bg-primary/10 p-2.5 rounded-zela-md text-primary shrink-0">
            <MessageCircle size={22} />
          </div>
          <div className="min-w-0">
            <h2 className="text-h3 text-on-surface">Chat</h2>
            <p className="text-on-surface-variant text-small hidden sm:block truncate">Converse com as famílias por setor.</p>
          </div>
        </div>
        <button
          onClick={openSupportThread}
          disabled={isOpeningSupport}
          title="Falar com o Suporte Zela"
          className="flex items-center gap-1.5 bg-primary/10 hover:bg-primary/20 text-primary px-3 py-2 rounded-zela-md font-bold transition-all active:scale-95 text-xs shrink-0 disabled:opacity-60"
        >
          {isOpeningSupport ? <Loader2 size={14} className="animate-spin" /> : <LifeBuoy size={14} />}
          <span className="hidden sm:inline">{SUPORTE_ZELA_LABEL}</span>
        </button>
      </div>

      {allowedSetores.length > 1 && (
        <div className="flex items-center justify-between gap-2 px-5 sm:px-6 pt-4 shrink-0">
          <button
            onClick={() => {
              const i = allowedSetores.findIndex(s => s.value === tab);
              setTab(allowedSetores[(i - 1 + allowedSetores.length) % allowedSetores.length].value);
            }}
            className="p-2 text-on-surface-variant/70 hover:text-primary hover:bg-primary/10 rounded-zela-md transition shrink-0"
          >
            <ChevronLeft size={20} />
          </button>
          <span key={tab} className="flex-1 text-center bg-primary/10 text-primary px-3 py-2 rounded-zela-md text-xs font-black uppercase tracking-wide leading-tight animate-in fade-in duration-150">
            {allowedSetores.find(s => s.value === tab)?.label}
          </span>
          <button
            onClick={() => {
              const i = allowedSetores.findIndex(s => s.value === tab);
              setTab(allowedSetores[(i + 1) % allowedSetores.length].value);
            }}
            className="p-2 text-on-surface-variant/70 hover:text-primary hover:bg-primary/10 rounded-zela-md transition shrink-0"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-2">
        {isLoadingList ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : filteredThreads.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant/70">
            <MessageCircle className="mx-auto h-12 w-12 text-outline-variant mb-3" />
            <p className="text-sm font-semibold text-on-surface-variant">Nenhuma conversa neste setor ainda.</p>
          </div>
        ) : (
          filteredThreads.map(t => {
            const unread = t.staff_last_read_at ? new Date(t.updated_at) > new Date(t.staff_last_read_at) : true;
            return (
              <button
                key={t.id}
                onClick={() => openThread(t)}
                className="w-full flex items-center gap-3 p-4 bg-white border border-outline-variant hover:border-primary/40 hover:bg-primary/5 rounded-zela-lg transition text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-on-surface text-sm truncate">{t.family?.name || 'Responsável'}</p>
                  <p className="text-on-surface-variant/70 text-xs">Atualizado em {formatTime(t.updated_at)}</p>
                </div>
                {unread && <span className="w-2.5 h-2.5 rounded-full bg-primary shrink-0" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
