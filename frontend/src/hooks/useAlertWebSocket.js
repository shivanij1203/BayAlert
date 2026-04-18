import { useState, useEffect, useRef, useCallback } from "react";

const WS_URL = "ws://localhost:8000/api/alerts/ws";

/**
 * Hook that connects to the alert WebSocket and buffers incoming alerts.
 * Uses a ref-based buffer pattern to prevent re-render storms.
 * Reference: ChristySchott/iot-sensor-dashboard (buffering pattern)
 */
export function useAlertWebSocket() {
  const [alerts, setAlerts] = useState([]);
  const [connected, setConnected] = useState(false);
  const bufferRef = useRef([]);
  const wsRef = useRef(null);
  const timerRef = useRef(null);

  const flushBuffer = useCallback(() => {
    if (bufferRef.current.length > 0) {
      setAlerts((prev) => [...bufferRef.current, ...prev].slice(0, 100));
      bufferRef.current = [];
    }
  }, []);

  useEffect(() => {
    function connect() {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);

      ws.onmessage = (event) => {
        try {
          const alert = JSON.parse(event.data);
          bufferRef.current.push(alert);
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        setConnected(false);
        // reconnect after 5 seconds
        setTimeout(connect, 5000);
      };

      ws.onerror = () => ws.close();
    }

    connect();

    // flush buffer every second (throttle UI updates)
    timerRef.current = setInterval(flushBuffer, 1000);

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [flushBuffer]);

  return { alerts, connected };
}
