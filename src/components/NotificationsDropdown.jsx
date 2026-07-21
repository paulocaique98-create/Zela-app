import React, { useState, useEffect, useRef } from 'react';
import { Bell, CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function NotificationsDropdown({ currentUser }) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!currentUser || currentUser.role !== 'family') return;

    fetchNotifications();

    // Subscribe to realtime notifications
    const channelName = `notifications-${currentUser.id}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `family_id=eq.${currentUser.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setNotifications((prev) => [payload.new, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setNotifications((prev) =>
              prev.map((n) => (n.id === payload.new.id ? payload.new : n))
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser]);

  useEffect(() => {
    const count = notifications.filter(n => !n.read_at).length;
    setUnreadCount(count);
  }, [notifications]);

  // Fechar ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchNotifications = async () => {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('family_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!error && data) {
      setNotifications(data);
    }
  };

  const markAllAsRead = async () => {
    const unreadIds = notifications.filter(n => !n.read_at).map(n => n.id);
    if (unreadIds.length === 0) return;

    // Atualiza o estado local imediatamente
    setNotifications(prev => prev.map(n => ({ ...n, read_at: new Date().toISOString() })));

    // Atualiza no banco
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .in('id', unreadIds);
  };

  const handleToggle = () => {
    if (!isOpen) {
      markAllAsRead();
    }
    setIsOpen(!isOpen);
  };

  const formatTime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Agora mesmo';
    if (diffMins < 60) return `Há ${diffMins} min`;
    if (diffHours < 24) return `Há ${diffHours} h`;
    if (diffDays === 1) return 'Ontem';
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  const getIconAndColor = (type) => {
    switch (type) {
      case 'checkin_confirmed':
      case 'checkout_confirmed':
        return { icon: <CheckCircle2 size={18} className="text-emerald-600" />, bg: 'bg-emerald-100', dot: 'bg-emerald-500' };
      case 'late_entry_5min':
      case 'late_exit_5min':
      case 'late_exit_10min_warning':
        return { icon: <AlertTriangle size={18} className="text-amber-600" />, bg: 'bg-amber-100', dot: 'bg-amber-500' };
      case 'late_exit_15min_billing':
        return { icon: <AlertCircle size={18} className="text-red-600" />, bg: 'bg-red-100', dot: 'bg-red-500' };
      case 'welcome':
      default:
        return { icon: <Info size={18} className="text-indigo-600" />, bg: 'bg-indigo-100', dot: 'bg-indigo-500' };
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleToggle}
        className={`relative p-2 rounded-xl transition flex items-center justify-center ${
          isOpen ? 'bg-indigo-100 text-indigo-700' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'
        }`}
        title="Notificações"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white animate-pulse"></span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden flex flex-col max-h-[85vh]">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Bell size={16} className="text-indigo-600" />
              Notificações
            </h3>
            {unreadCount > 0 && (
              <span className="text-xs font-semibold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                {unreadCount} novas
              </span>
            )}
            <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-700 md:hidden p-1">
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-slate-500 space-y-3">
                <div className="w-12 h-12 bg-indigo-50 text-indigo-300 rounded-full flex items-center justify-center mx-auto mb-2">
                  <Bell size={24} />
                </div>
                <h4 className="font-bold text-slate-700">Bem-vindo ao Portal Zela!</h4>
                <p className="text-sm text-slate-500 leading-relaxed">
                  Aqui você receberá avisos de check-in, check-out e lembretes importantes sobre o horário do seu filho.
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {notifications.map((n) => {
                  const style = getIconAndColor(n.type);
                  return (
                    <div 
                      key={n.id} 
                      className={`p-3 rounded-xl flex gap-3 transition-colors ${!n.read_at ? 'bg-slate-50' : 'hover:bg-slate-50'}`}
                    >
                      <div className={`w-10 h-10 rounded-full flex shrink-0 items-center justify-center ${style.bg}`}>
                        {style.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm text-slate-700 ${!n.read_at ? 'font-semibold' : ''}`}>
                          {n.message}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-1 font-medium">
                          {formatTime(n.created_at)}
                        </p>
                      </div>
                      {!n.read_at && (
                        <div className="w-2 h-2 shrink-0 rounded-full mt-1.5 shadow-sm" style={{ backgroundColor: style.dot }} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          
          <div className="p-2 border-t border-slate-100 bg-slate-50 text-center">
            <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Histórico Completo</p>
          </div>
        </div>
      )}
    </div>
  );
}
