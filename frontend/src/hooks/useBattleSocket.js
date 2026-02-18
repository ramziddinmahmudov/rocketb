/**
 * Custom hook for the battle WebSocket connection.
 *
 * Connects to the backend WS endpoint and provides live
 * score updates + connection status.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const getWsUrl = () => {
  const apiBase = import.meta.env.VITE_API_BASE || window.location.origin;
  const wsProtocol = apiBase.startsWith('https') ? 'wss' : 'ws';
  // Remove protocol and trailing slash, then add ws protocol
  const host = apiBase.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return `${wsProtocol}://${host}`;
};

const WS_BASE = import.meta.env.VITE_WS_BASE || getWsUrl();

export default function useBattleSocket(battleId) {
  const [scores, setScores] = useState({ blue: 0, red: 0 });
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!battleId) return;

    const url = `${WS_BASE}/api/ws/battle/${battleId}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setIsConnected(true);
      console.log('[WS] Connected to battle', battleId);
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'score_update' || data.blue !== undefined) {
          setScores((prev) => ({
            blue: data.blue ?? prev.blue,
            red: data.red ?? prev.red,
          }));
          setLastUpdate(Date.now());
        }

        if (data.type === 'pong') {
          // keep-alive acknowledged
        }
      } catch (err) {
        console.warn('[WS] Parse error:', err);
      }
    };

    ws.onclose = (event) => {
      if (!mountedRef.current) return;
      setIsConnected(false);
      console.log('[WS] Disconnected, code:', event.code);

      // Auto-reconnect after 3s (unless unmounted)
      reconnectTimer.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, 3000);
    };

    ws.onerror = (err) => {
      console.error('[WS] Error:', err);
      ws.close();
    };
  }, [battleId]);

  // Keep-alive ping every 25s
  useEffect(() => {
    const interval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, 25000);

    return () => clearInterval(interval);
  }, []);

  // Connect on mount / battleId change
  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return { scores, isConnected, lastUpdate };
}
