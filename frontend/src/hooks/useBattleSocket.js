/**
 * useBattleSocket — Real WebSocket connection for live battle updates.
 *
 * Connects to ws://<host>/ws/battle/{battle_id}?initData=...
 * Parses incoming JSON messages and exposes them via `scores` state.
 */
import { useEffect, useRef, useState, useCallback } from 'react';

export default function useBattleSocket(battleId) {
  const [scores, setScores] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);

  const connect = useCallback(() => {
    if (!battleId) return;

    // Build WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const initData = window.Telegram?.WebApp?.initData || '';
    const url = `${protocol}//${host}/ws/battle/${battleId}?initData=${encodeURIComponent(initData)}`;

    console.log('[WS] Connecting to', url);

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[WS] Connected to battle', battleId);
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setScores(data);
        setLastUpdate(Date.now());
      } catch (err) {
        console.error('[WS] Failed to parse message:', err);
      }
    };

    ws.onerror = (err) => {
      console.error('[WS] Error:', err);
    };

    ws.onclose = (event) => {
      console.log('[WS] Disconnected:', event.code, event.reason);
      setIsConnected(false);
      wsRef.current = null;

      // Auto-reconnect after 3 seconds if not intentionally closed
      if (event.code !== 1000) {
        reconnectTimer.current = setTimeout(() => {
          console.log('[WS] Reconnecting...');
          connect();
        }, 3000);
      }
    };
  }, [battleId]);

  useEffect(() => {
    if (!battleId) {
      setIsConnected(false);
      setScores(null);
      return;
    }

    connect();

    return () => {
      clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmount');
        wsRef.current = null;
      }
      setIsConnected(false);
    };
  }, [battleId, connect]);

  return { scores, isConnected, lastUpdate };
}
