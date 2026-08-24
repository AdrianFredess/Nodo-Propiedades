import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from 'react-router-dom';
import { AppShell } from './app/layout/AppShell';
import { CatalogoPage } from './features/catalogo/CatalogoPage';
import { PropiedadDetailPage } from './features/catalogo/PropiedadDetailPage';
import { LeadDetailPage } from './features/lead-detail/LeadDetailPage';
import { PipelinePage } from './features/pipeline/PipelinePage';
import { ResumenPage } from './features/resumen/ResumenPage';
import { useChatUnread } from './shared/hooks/useChatUnread';
import { useLeads } from './shared/hooks/useLeads';
import { useTempNotifications } from './shared/hooks/useTempNotifications';
import { formatDateTime } from './shared/lib/time';
import type { Propiedad } from './shared/types/lead';

function openLeadIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/leads\/([^/]+)/);
  if (!m?.[1]) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

function LeadDetailRoute({
  findLead,
  loading,
  getHighlightKeys,
  clearHighlight,
  appendChatMessage,
}: {
  findLead: ReturnType<typeof useLeads>['findLead'];
  loading: boolean;
  getHighlightKeys: (leadId: string) => Set<string>;
  clearHighlight: (leadId: string) => void;
  appendChatMessage: ReturnType<typeof useLeads>['appendChatMessage'];
}) {
  const { leadId } = useParams();
  const decoded = leadId ? decodeURIComponent(leadId) : '';
  const lead = decoded ? findLead(decoded) : undefined;
  return (
    <LeadDetailPage
      lead={lead}
      loading={loading && !lead}
      highlightKeys={lead ? getHighlightKeys(lead.id) : undefined}
      onClearHighlight={lead ? () => clearHighlight(lead.id) : undefined}
      appendChatMessage={appendChatMessage}
    />
  );
}

function PropiedadDetailRoute({
  propiedades,
  loading,
}: {
  propiedades: Propiedad[];
  loading: boolean;
}) {
  const { propiedadId } = useParams();
  const decoded = propiedadId ? decodeURIComponent(propiedadId) : '';
  const propiedad = propiedades.find((p) => p.id === decoded);
  return (
    <PropiedadDetailPage
      propiedad={propiedad}
      loading={loading && !propiedad}
    />
  );
}

export default function App() {
  const location = useLocation();
  const openLeadId = openLeadIdFromPath(location.pathname);

  const {
    leads,
    propiedades,
    payload,
    loading,
    error,
    lastUpdated,
    findLead,
    patchPropiedad,
    appendChatMessage,
    realtimeStatus,
  } = useLeads();

  const { toasts, dismiss, markAllRead, unreadCount } =
    useTempNotifications(leads);

  const { unreadByLead, getHighlightKeys, clearHighlight } = useChatUnread(
    leads,
    openLeadId,
  );

  const realtimeLabel =
    realtimeStatus === 'open'
      ? 'vivo'
      : realtimeStatus === 'connecting'
        ? 'conectando…'
        : realtimeStatus === 'closed'
          ? 'polling'
          : undefined;

  return (
    <Routes>
      <Route
        element={
          <AppShell
            payload={payload}
            lastUpdated={lastUpdated}
            tempToasts={toasts}
            tempUnread={unreadCount}
            onDismissTemp={dismiss}
            onMarkTempRead={markAllRead}
            realtimeStatus={realtimeStatus}
          />
        }
      >
        <Route
          index
          element={
            <>
              {error ? <div className="error-banner">{error}</div> : null}
              {loading && !payload ? (
                <div className="empty-state">Cargando panel…</div>
              ) : (
                <ResumenPage
                  leads={leads}
                  sourceLabel={payload?.source ?? 'live'}
                  lastUpdatedLabel={
                    lastUpdated ? formatDateTime(lastUpdated) : '—'
                  }
                />
              )}
            </>
          }
        />
        <Route
          path="pipeline"
          element={
            <div className="pipeline-route">
              {error ? <div className="error-banner">{error}</div> : null}
              <PipelinePage leads={leads} unreadByLead={unreadByLead} />
            </div>
          }
        />
        <Route
          path="catalogo"
          element={
            <CatalogoPage
              propiedades={propiedades}
              loading={loading}
              error={error}
              realtimeLabel={realtimeLabel}
              onLocalPatch={patchPropiedad}
            />
          }
        />
        <Route
          path="catalogo/:propiedadId"
          element={
            <PropiedadDetailRoute
              propiedades={propiedades}
              loading={loading}
            />
          }
        />
        <Route
          path="leads/:leadId"
          element={
            <LeadDetailRoute
              findLead={findLead}
              loading={loading}
              getHighlightKeys={getHighlightKeys}
              clearHighlight={clearHighlight}
              appendChatMessage={appendChatMessage}
            />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
