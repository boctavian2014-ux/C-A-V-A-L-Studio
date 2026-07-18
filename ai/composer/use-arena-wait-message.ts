import { useEffect, useMemo, useRef, useState } from 'react';
import type { MultiAgentPhase } from './chat-activity-types';
import {
  createWaitMessagePicker,
  formatWaitElapsed,
  waitSceneContextKey,
  type WaitMessagePicker,
  type WaitSceneContext,
} from './arena-wait-copy';

export interface ArenaWaitMessageState {
  message: string;
  statusLine: string;
  visible: boolean;
}

export function useArenaWaitMessage(
  phase: MultiAgentPhase | undefined,
  active: boolean,
  rotateMs = 3500,
  detail?: string,
  ctx?: WaitSceneContext
): ArenaWaitMessageState {
  const ctxKey = useMemo(() => waitSceneContextKey(ctx), [ctx]);
  const pickerRef = useRef<WaitMessagePicker>(createWaitMessagePicker(phase, ctx));
  const [message, setMessage] = useState(() => pickerRef.current.next());
  const [visible, setVisible] = useState(true);
  const [elapsedSec, setElapsedSec] = useState(0);
  const phaseStartedAt = useRef(Date.now());

  useEffect(() => {
    pickerRef.current.reset(phase, ctx);
    setMessage(pickerRef.current.next());
    setVisible(true);
    phaseStartedAt.current = Date.now();
    setElapsedSec(0);
  }, [phase, ctxKey]);

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      setVisible(false);
      window.setTimeout(() => {
        setMessage(pickerRef.current.next());
        setVisible(true);
      }, 280);
    }, rotateMs);
    return () => window.clearInterval(id);
  }, [active, rotateMs, phase, ctxKey]);

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - phaseStartedAt.current) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [active, phase]);

  const statusLine = [formatWaitElapsed(elapsedSec, phase), detail].filter(Boolean).join(' · ');

  return {
    message,
    statusLine,
    visible,
  };
}
