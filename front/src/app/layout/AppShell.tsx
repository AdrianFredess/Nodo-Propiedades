import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { TempNotifications } from '../../features/notifications/TempNotifications';
import { config } from '../../shared/api/client';
import type { RealtimeStatus } from '../../shared/hooks/useRealtime';
import type { TempToast } from '../../shared/hooks/useTempNotifications';
import type { LeadsPayload } from '../../shared/types/lead';
import { formatDateTime } from '../../shared/lib/time';

interface AppShellProps {
  payload: LeadsPayload | null;
  lastUpdated: string | null;
  tempToasts?: TempToast[];
  tempUnread?: number;
  onDismissTemp?: (id: string) => void;
  onMarkTempRead?: () => void;
  realtimeStatus?: RealtimeStatus;
}

const links = [
  { to: '/', label: 'Resumen', end: true },
  { to: '/pipeline', label: 'Pipeline', end: false },
  { to: '/catalogo', label: 'Catálogo', end: false },
];

function realtimeText(status: RealtimeStatus | undefined): string {
  if (status === 'open') return 'WebSocket vivo';
  if (status === 'connecting') return 'WebSocket…';
  if (status === 'closed') return 'Polling suave';
  return 'Sin realtime';
}

export function AppShell({
  payload,
  lastUpdated,
  tempToasts = [],
  tempUnread = 0,
  onDismissTemp,
  onMarkTempRead,
  realtimeStatus = 'off',
}: AppShellProps) {
  const location = useLocation();
  const source = payload?.source ?? (config.useMock ? 'mock' : 'live');
  const routeKey = location.pathname.startsWith('/pipeline')
    ? 'pipeline'
    : location.pathname.startsWith('/catalogo')
      ? 'catalogo'
      : location.pathname.startsWith('/leads')
        ? 'lead'
        : 'resumen';

  return (
    <div className={`shell shell--${routeKey}`}>
      <aside className="shell__nav">
        <div className="shell__brand">
          <span className="shell__brand-mark">Nodo Propiedades</span>
          <span className="shell__brand-sub">Panel comercial</span>
        </div>
        <nav className="shell__links" aria-label="Principal">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }: { isActive: boolean }) =>
                isActive ? 'shell__link shell__link--active' : 'shell__link'
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="shell__meta">
          <div>
            Fuente:{' '}
            {source === 'mock' ? 'Datos de demostración' : 'Planilla en vivo'}
          </div>
          <div>
            Actualizado:{' '}
            {lastUpdated ? formatDateTime(lastUpdated) : '—'}
          </div>
          <div className="shell__meta-live">
            <span
              className={`shell__meta-live-dot${
                realtimeStatus === 'open'
                  ? ' is-open'
                  : realtimeStatus === 'connecting'
                    ? ' is-connecting'
                    : ''
              }`}
            />
            {realtimeText(realtimeStatus)}
          </div>
        </div>
      </aside>
      <main className="shell__main">
        <header className="shell__topbar" aria-label="Acciones del panel">
          <TempNotifications
            toasts={tempToasts}
            unreadCount={tempUnread}
            dismiss={onDismissTemp ?? (() => undefined)}
            markAllRead={onMarkTempRead ?? (() => undefined)}
          />
        </header>
        <div className="shell__content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
