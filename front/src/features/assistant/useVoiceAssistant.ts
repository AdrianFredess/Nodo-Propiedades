import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { config } from '../../shared/api/client';
import type { RealtimeStatus } from '../../shared/hooks/useRealtime';
import type { Lead } from '../../shared/types/lead';
import {
  onAssistantActivity,
  type AssistantActivityItem,
} from './assistantActivity';
import { buildLiveContext, formatCanalName } from './assistantContext';
import {
  buildCatchUpReport,
  catchUpSpeech,
  seedActivityFromLeads,
} from './assistantCatchUp';
import {
  getCatchUpSinceIso,
  markAssistantSeen,
  msSinceLastSeen,
} from './assistantSession';
import { processAssistantCommand } from './buildReply';
import { humanizeAssistantSpeech } from './humanizeReply';
import { polishSpeechLocal } from './sanitizeSpeech';
import {
  createSpeechRecognizer,
  isSpeechRecognitionSupported,
} from './speechRecognition';
import {
  ensureVoicesLoaded,
  getTtsVoiceLabel,
  resolveTtsMode,
  speakText,
  stopSpeaking,
} from './tts';
import { shouldHumanizeIntent } from './shouldHumanize';
import type { AssistantReply } from './assistantTypes';

const ALERTS_KEY = 'asistente-live-alerts';
const BRIEFING_GAP_MS = 20 * 60 * 1000;

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  at: string;
}

export interface UseVoiceAssistantOptions {
  leads: Lead[];
  realtimeStatus?: RealtimeStatus;
  onRefreshLeads?: () => Promise<Lead[]>;
}

export interface UseVoiceAssistantResult {
  open: boolean;
  setOpen: (v: boolean) => void;
  listening: boolean;
  speaking: boolean;
  thinking: boolean;
  syncing: boolean;
  interim: string;
  messages: AssistantMessage[];
  error: string | null;
  speechSupported: boolean;
  ttsMode: ReturnType<typeof resolveTtsMode>;
  ttsVoiceLabel: string;
  voiceEnabled: boolean;
  setVoiceEnabled: (v: boolean) => void;
  liveAlerts: boolean;
  setLiveAlerts: (v: boolean) => void;
  realtimeConnected: boolean;
  startListening: () => void;
  stopListening: () => void;
  submitText: (text: string) => Promise<void>;
  lastReply: AssistantReply | null;
}

function nowId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readAlertsPref(): boolean {
  try {
    const v =
      localStorage.getItem(ALERTS_KEY) ??
      localStorage.getItem('jarvis-live-alerts');
    if (v === 'false') return false;
  } catch {
    /* ignore */
  }
  return true;
}

export function useVoiceAssistant({
  leads,
  realtimeStatus = 'off',
  onRefreshLeads,
}: UseVoiceAssistantOptions): UseVoiceAssistantResult {
  const navigate = useNavigate();
  const [open, setOpenState] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [interim, setInterim] = useState('');
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastReply, setLastReply] = useState<AssistantReply | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [liveAlerts, setLiveAlertsState] = useState(readAlertsPref);
  const [ttsVoiceLabel, setTtsVoiceLabel] = useState('Voz del navegador');
  const recognizerRef = useRef<ReturnType<typeof createSpeechRecognizer>>(null);
  const leadsRef = useRef(leads);
  const busyRef = useRef(false);
  const catchUpDoneRef = useRef(false);
  const catchUpRunningRef = useRef(false);
  const deliverSpeechRef = useRef<
    (speech: string, reply: AssistantReply | null, speak: boolean) => Promise<void>
  >(async () => undefined);
  leadsRef.current = leads;

  const speechSupported = isSpeechRecognitionSupported();
  const ttsMode = resolveTtsMode();
  const realtimeConnected = realtimeStatus === 'open';

  const setLiveAlerts = useCallback((v: boolean) => {
    setLiveAlertsState(v);
    try {
      localStorage.setItem(ALERTS_KEY, v ? 'true' : 'false');
    } catch {
      /* ignore */
    }
  }, []);

  const pushMessage = useCallback((role: 'user' | 'assistant', text: string) => {
    setMessages((prev) => [
      ...prev.slice(-14),
      { id: nowId(), role, text, at: new Date().toISOString() },
    ]);
  }, []);

  const runActions = useCallback(
    (reply: AssistantReply) => {
      const nav = reply.actions.find((a) => a.type === 'navigate');
      if (nav && nav.type === 'navigate') {
        navigate(nav.path);
      }
    },
    [navigate],
  );

  const deliverSpeech = useCallback(
    async (speech: string, reply: AssistantReply | null, speak: boolean) => {
      pushMessage('assistant', speech);
      if (reply) {
        setLastReply(reply);
        runActions(reply);
      }
      if (speak && voiceEnabled) {
        setSpeaking(true);
        try {
          await speakText(speech, ttsMode);
        } catch (e) {
          const msg =
            e instanceof Error ? e.message : 'No pude reproducir la voz.';
          setError(msg);
        } finally {
          setSpeaking(false);
        }
      }
    },
    [pushMessage, runActions, ttsMode, voiceEnabled],
  );
  deliverSpeechRef.current = deliverSpeech;

  const runCatchUpOnOpen = useCallback(
    async (freshLeads: Lead[]) => {
      if (catchUpDoneRef.current || busyRef.current) return;
      const since = getCatchUpSinceIso();
      seedActivityFromLeads(freshLeads, since);
      const report = buildCatchUpReport(freshLeads, since);
      const away = msSinceLastSeen();
      const shouldBrief =
        report.hasNews || (away !== null && away >= BRIEFING_GAP_MS);

      if (!shouldBrief) return;

      catchUpDoneRef.current = true;
      busyRef.current = true;
      const speech = polishSpeechLocal(catchUpSpeech(report));
      const reply: AssistantReply = {
        speech,
        actions: [],
        leads: report.urgentLeads.length
          ? report.urgentLeads
          : report.highlights.length
            ? freshLeads.filter((l) => l.id === report.highlights[0]?.leadId)
            : undefined,
      };

      try {
        await deliverSpeechRef.current(speech, reply, voiceEnabled);
      } finally {
        busyRef.current = false;
      }
    },
    [voiceEnabled],
  );

  const setOpen = useCallback(
    (next: boolean) => {
      if (!next) {
        markAssistantSeen();
        catchUpDoneRef.current = false;
        setOpenState(false);
        return;
      }

      setOpenState(true);

      if (catchUpDoneRef.current || catchUpRunningRef.current) return;

      catchUpRunningRef.current = true;
      void (async () => {
        setSyncing(true);
        try {
          const fresh = onRefreshLeads
            ? await onRefreshLeads()
            : leadsRef.current;
          const list = fresh.length ? fresh : leadsRef.current;
          leadsRef.current = list;
          await runCatchUpOnOpen(list);
        } catch {
          await runCatchUpOnOpen(leadsRef.current);
        } finally {
          setSyncing(false);
          catchUpRunningRef.current = false;
        }
      })();
    },
    [onRefreshLeads, runCatchUpOnOpen],
  );

  const submitText = useCallback(
    async (text: string, options?: { silentUser?: boolean }) => {
      const trimmed = text.trim();
      if (!trimmed || busyRef.current) return;
      busyRef.current = true;
      setError(null);
      setInterim('');
      if (!options?.silentUser) pushMessage('user', trimmed);

      try {
        const { reply, intent } = processAssistantCommand(
          trimmed,
          leadsRef.current,
        );
        const liveContext = buildLiveContext(leadsRef.current);

        let speech = polishSpeechLocal(reply.speech);
        if (config.assistantHumanize && shouldHumanizeIntent(intent.kind)) {
          setThinking(true);
          try {
            speech = await humanizeAssistantSpeech({
              userCommand: trimmed,
              draftSpeech: reply.speech,
              intent: intent.kind,
              liveContext,
            });
          } catch {
            speech = polishSpeechLocal(reply.speech);
          } finally {
            setThinking(false);
          }
        }

        await deliverSpeech(speech, reply, true);
      } finally {
        busyRef.current = false;
      }
    },
    [deliverSpeech, pushMessage],
  );

  const announceLiveActivity = useCallback(
    async (item: AssistantActivityItem) => {
      if (!open || !liveAlerts || item.side !== 'client') return;
      if (busyRef.current) return;

      const canal = formatCanalName(item.canal);
      const draft = `${item.leadName} te escribió por ${canal}: ${item.preview.slice(0, 80)}`;
      const speech = polishSpeechLocal(draft);

      await deliverSpeech(speech, null, true);
    },
    [deliverSpeech, liveAlerts, open],
  );

  useEffect(() => {
    return onAssistantActivity((item) => {
      void announceLiveActivity(item);
    });
  }, [announceLiveActivity]);

  useEffect(() => {
    void ensureVoicesLoaded().then(() =>
      getTtsVoiceLabel(ttsMode).then(setTtsVoiceLabel),
    );
  }, [ttsMode]);

  const stopListening = useCallback(() => {
    recognizerRef.current?.stop();
    recognizerRef.current = null;
    setListening(false);
    setInterim('');
  }, []);

  const startListening = useCallback(() => {
    if (!speechSupported) {
      setError('Usá Chrome o Edge para comandos por voz.');
      return;
    }
    stopSpeaking();
    setError(null);
    setOpen(true);

    const rec = createSpeechRecognizer(
      (result) => {
        setInterim(result.transcript);
        if (result.isFinal && result.transcript) {
          stopListening();
          void submitText(result.transcript);
        }
      },
      (err) => {
        setError(
          err === 'not-allowed'
            ? 'Permití el micrófono en el navegador.'
            : `Micrófono: ${err}`,
        );
        stopListening();
      },
      () => {
        setListening(false);
      },
    );

    if (!rec) {
      setError('Reconocimiento de voz no disponible.');
      return;
    }

    recognizerRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setError('No pude activar el micrófono. Probá de nuevo.');
      stopListening();
    }
  }, [speechSupported, stopListening, submitText, setOpen]);

  useEffect(() => {
    return () => {
      stopListening();
      stopSpeaking();
    };
  }, [stopListening]);

  useEffect(() => {
    if (!leads.length) return;
    seedActivityFromLeads(leads, getCatchUpSinceIso());
  }, [leads]);

  return {
    open,
    setOpen,
    listening,
    speaking,
    thinking,
    syncing,
    interim,
    messages,
    error,
    speechSupported,
    ttsMode,
    ttsVoiceLabel,
    voiceEnabled,
    setVoiceEnabled,
    liveAlerts,
    setLiveAlerts,
    realtimeConnected,
    startListening,
    stopListening,
    submitText,
    lastReply,
  };
}
