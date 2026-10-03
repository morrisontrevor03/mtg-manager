"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

export type SpeechSupport = "unknown" | "supported" | "unsupported";

interface Options {
  /** Called once per finalised utterance. */
  onFinal: (transcript: string) => void;
  lang?: string;
}

function speechRecognitionCtor(): { new (): SpeechRecognition } | undefined {
  if (typeof window === "undefined") return undefined;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

// Support never changes for the life of the page, so the store never notifies.
const neverChanges = () => () => {};
const clientSupport = (): SpeechSupport =>
  speechRecognitionCtor() ? "supported" : "unsupported";
const serverSupport = (): SpeechSupport => "unknown";

/**
 * Wraps the Web Speech API recognition loop.
 *
 * Browsers end the stream on silence, so an active session restarts it from
 * `onend`. The latest `onFinal` lives in a ref so restarting never rebinds the
 * recognizer or drops audio between utterances.
 */
export function useSpeechRecognition({ onFinal, lang = "en-US" }: Options) {
  // Read through an external store rather than an effect, so the first client
  // render already knows and SSR stays "unknown".
  const support = useSyncExternalStore(neverChanges, clientSupport, serverSupport);

  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const wantListeningRef = useRef(false);
  const onFinalRef = useRef(onFinal);

  useEffect(() => {
    onFinalRef.current = onFinal;
  });

  useEffect(() => {
    const Ctor = speechRecognitionCtor();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let pending = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) {
          const trimmed = text.trim();
          if (trimmed) onFinalRef.current(trimmed);
        } else {
          pending += text;
        }
      }
      setInterim(pending.trim());
    };

    recognition.onerror = (event) => {
      // Silence between cards is expected, not an error worth surfacing.
      if (event.error === "no-speech" || event.error === "aborted") return;
      setError(
        event.error === "not-allowed"
          ? "Microphone access was denied. Allow it in your browser settings to use voice entry."
          : `Speech recognition error: ${event.error}`,
      );
      wantListeningRef.current = false;
      setListening(false);
    };

    recognition.onend = () => {
      setInterim("");
      if (wantListeningRef.current) {
        // Restart after the browser's silence cutoff.
        try {
          recognition.start();
        } catch {
          // start() throws if it is already running; that is harmless.
        }
      } else {
        setListening(false);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      wantListeningRef.current = false;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
      recognitionRef.current = null;
    };
  }, [lang]);

  const start = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    setError(null);
    wantListeningRef.current = true;
    setListening(true);
    try {
      recognition.start();
    } catch {
      // Already started.
    }
  }, []);

  const stop = useCallback(() => {
    wantListeningRef.current = false;
    setListening(false);
    setInterim("");
    recognitionRef.current?.stop();
  }, []);

  const toggle = useCallback(() => {
    if (wantListeningRef.current) stop();
    else start();
  }, [start, stop]);

  return { support, listening, interim, error, start, stop, toggle };
}
