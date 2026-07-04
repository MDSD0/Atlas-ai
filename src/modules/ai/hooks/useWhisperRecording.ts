import { createOpenAI } from "@ai-sdk/openai";
import { experimental_transcribe as transcribe } from "ai";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useChatStore } from "../store/chatStore";
import { createProxyFetch } from "../lib/proxyFetch";

// Mirrors agent.ts's singleton: raw webview fetch to api.openai.com fails
// CORS, so transcription must go through the same Tauri-proxied fetch every
// other cloud provider call uses.
const cloudProxyFetch = createProxyFetch({ allowPrivateNetwork: false });

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const m of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return undefined;
}

/** Pure — extracted so it's directly testable without a hook-rendering
 * harness (this codebase has none) or mocking `DOMException`/`MediaRecorder`. */
export function micErrorMessage(e: unknown): string {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Microphone access was denied. Allow it in your browser/OS settings and try again.";
  }
  if (name === "NotFoundError") return "No microphone was found.";
  return "Couldn't access the microphone.";
}

/** Pure — see {@link micErrorMessage}. */
export function transcriptionErrorMessage(e: unknown): string {
  const detail = e instanceof Error ? e.message : String(e);
  return detail.slice(0, 200);
}

async function transcribeBlob(blob: Blob, apiKey: string): Promise<string> {
  const openai = createOpenAI({ apiKey, fetch: cloudProxyFetch });
  const buf = new Uint8Array(await blob.arrayBuffer());
  const { text } = await transcribe({
    model: openai.transcription("whisper-1"),
    audio: buf,
  });
  return text;
}

type State = "idle" | "recording" | "transcribing";

export function useWhisperRecording({
  onResult,
}: {
  onResult: (text: string) => void;
}) {
  const apiKey = useChatStore((s) => s.apiKeys.openai);
  const [state, setState] = useState<State>("idle");
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const supported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined";

  const teardownStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }, []);

  const start = useCallback(async () => {
    if (!supported || !apiKey || state !== "idle") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMime();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, {
          type: rec.mimeType || "audio/webm",
        });
        chunksRef.current = [];
        teardownStream();
        if (blob.size === 0) {
          setState("idle");
          return;
        }
        setState("transcribing");
        try {
          const text = await transcribeBlob(blob, apiKey);
          if (text.trim()) onResult(text.trim());
        } catch (e) {
          console.error("whisper.transcribe", e);
          toast.error("Voice transcription failed", {
            description: transcriptionErrorMessage(e),
          });
        } finally {
          setState("idle");
        }
      };
      recRef.current = rec;
      rec.start();
      setState("recording");
    } catch (e) {
      console.error("whisper.getUserMedia", e);
      toast.error("Voice input unavailable", { description: micErrorMessage(e) });
      teardownStream();
      setState("idle");
    }
  }, [apiKey, onResult, state, supported]);

  useEffect(() => {
    return () => {
      recRef.current?.stop();
      teardownStream();
    };
  }, []);

  return {
    state,
    recording: state === "recording",
    transcribing: state === "transcribing",
    start,
    stop,
    supported,
    hasKey: !!apiKey,
  };
}
