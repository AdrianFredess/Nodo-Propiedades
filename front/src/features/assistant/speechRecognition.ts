export interface SpeechRecognitionResult {
  transcript: string;
  isFinal: boolean;
}

type RecognitionCtor = new () => {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: {
    results: { isFinal: boolean; 0: { transcript: string } }[];
  }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function getRecognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getRecognitionCtor() !== null;
}

export function createSpeechRecognizer(
  onResult: (result: SpeechRecognitionResult) => void,
  onError: (message: string) => void,
  onEnd: () => void,
): { start: () => void; stop: () => void } | null {
  const Ctor = getRecognitionCtor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.lang = 'es-AR';
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const last = event.results[event.results.length - 1];
    if (!last?.[0]) return;
    onResult({
      transcript: last[0].transcript.trim(),
      isFinal: last.isFinal,
    });
  };

  recognition.onerror = (event) => {
    if (event.error === 'aborted') return;
    onError(event.error || 'speech_error');
  };

  recognition.onend = () => onEnd();

  return {
    start: () => recognition.start(),
    stop: () => recognition.stop(),
  };
}
