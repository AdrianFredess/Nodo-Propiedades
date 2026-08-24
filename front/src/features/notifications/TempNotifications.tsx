import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck, Flame, Thermometer, X } from 'lucide-react';
import type { TempToast } from '../../shared/hooks/useTempNotifications';
import { TEMPERATURA_LABEL } from '../../shared/lib/labels';

interface TempNotificationsProps {
  toasts: TempToast[];
  unreadCount: number;
  dismiss: (id: string) => void;
  markAllRead: () => void;
}

function toastTitle(toast: TempToast): string {
  if (toast.to === 'caliente') return 'Lead caliente';
  if (toast.to === 'tibio') return 'Lead tibio';
  return 'Temperatura subió';
}

function ToastIcon({ toast }: { toast: TempToast }) {
  if (toast.to === 'caliente') {
    return <Flame className="temp-toast__icon" size={18} strokeWidth={2} aria-hidden />;
  }
  return <Thermometer className="temp-toast__icon" size={18} strokeWidth={2} aria-hidden />;
}

export function TempNotifications({
  toasts,
  unreadCount,
  dismiss,
  markAllRead,
}: TempNotificationsProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const root = rootRef.current;
      if (!root || root.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function toggleOpen() {
    setOpen((prev) => {
      const next = !prev;
      if (next) markAllRead();
      return next;
    });
  }

  return (
    <div className="temp-notif" ref={rootRef}>
      <button
        type="button"
        className={`temp-notif__bell${unreadCount ? ' temp-notif__bell--active' : ''}${open ? ' temp-notif__bell--open' : ''}`}
        title={
          unreadCount
            ? `${unreadCount} notificación(es) sin leer`
            : 'Notificaciones'
        }
        aria-label="Notificaciones"
        aria-expanded={open}
        aria-controls="temp-notif-panel"
        onClick={toggleOpen}
      >
        <Bell size={18} strokeWidth={2} aria-hidden />
        {unreadCount > 0 ? (
          <span className="temp-notif__count" aria-hidden>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id="temp-notif-panel"
          className="temp-notif__dropdown"
          role="dialog"
          aria-label="Lista de notificaciones"
        >
          <div className="temp-notif__header">
            <strong>Notificaciones</strong>
            {toasts.some((t) => !t.read) ? (
              <button
                type="button"
                className="temp-notif__mark-read"
                onClick={markAllRead}
              >
                <CheckCheck size={14} strokeWidth={2} aria-hidden />
                Marcar leídas
              </button>
            ) : null}
          </div>

          <div className="temp-notif__list">
            {toasts.length === 0 ? (
              <div className="temp-toast temp-toast--empty" role="status">
                <div className="temp-toast__body">
                  <strong>Sin alertas</strong>
                  <p>
                    Cuando un lead pase a tibio o caliente, vas a verlo acá.
                  </p>
                </div>
              </div>
            ) : (
              toasts.map((toast) => (
                <div
                  key={toast.id}
                  className={`temp-toast${toast.to === 'caliente' ? ' temp-toast--hot' : ''}${toast.to === 'tibio' ? ' temp-toast--warm' : ''}${toast.read ? ' temp-toast--read' : ''}`}
                  role="status"
                >
                  <ToastIcon toast={toast} />
                  <div className="temp-toast__body">
                    <strong>{toastTitle(toast)}</strong>
                    <p>
                      <Link
                        to={`/leads/${encodeURIComponent(toast.leadId)}`}
                        onClick={() => setOpen(false)}
                      >
                        {toast.nombre}
                      </Link>
                      {': '}
                      {toast.from === 'nuevo'
                        ? 'nuevo'
                        : TEMPERATURA_LABEL[toast.from]}{' '}
                      → <em>{TEMPERATURA_LABEL[toast.to]}</em>
                    </p>
                  </div>
                  <button
                    type="button"
                    className="temp-toast__close"
                    aria-label="Quitar notificación"
                    onClick={() => dismiss(toast.id)}
                  >
                    <X size={16} strokeWidth={2} aria-hidden />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
