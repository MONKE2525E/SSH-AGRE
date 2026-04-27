import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';
import { WS_URL } from '../config';

// Simple debounce helper
function debounce(fn, ms) {
  let timeoutId;
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), ms);
  };
}

function Terminal({ id, sessionId, connectionId, isActive, onStatusChange, onDisconnect }) {
  const terminalRef = useRef(null);
  const xtermRef = useRef(null);
  const fitAddonRef = useRef(null);
  const wsRef = useRef(null);
  const connectionStatusRef = useRef('connecting');
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const copyBufferRef = useRef('');
  const pendingCommandsRef = useRef([]);
  const timersRef = useRef([]);
  const onStatusChangeRef = useRef(onStatusChange);

  // Keep refs in sync
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    connectionStatusRef.current = connectionStatus;
  }, [connectionStatus]);

  useEffect(() => {
    // Initialize xterm.js with full color and Unicode support
    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Consolas, "Liberation Mono", Menlo, Courier, monospace',
      fontSize: 14,
      scrollback: 10000,
      convertEol: true,
      allowProposedApi: true,
      allowTransparency: true,
      drawBoldTextInBrightColors: true,
      minimumContrastRatio: 1,
      theme: {
        background: '#0d1117',
        foreground: '#f0f6fc',
        cursor: '#f0f6fc',
        cursorAccent: '#0d1117',
        selectionBackground: '#2d4a6f',
        selectionForeground: '#f0f6fc',
        black: '#161b22',
        red: '#ff5555',
        green: '#00ff41',
        yellow: '#f1fa8c',
        blue: '#8be9fd',
        magenta: '#ff79c6',
        cyan: '#00f5d4',
        white: '#f8f8f2',
        brightBlack: '#6272a4',
        brightRed: '#ff6e6e',
        brightGreen: '#39ff14',
        brightYellow: '#ffffa5',
        brightBlue: '#a5f3fc',
        brightMagenta: '#ff92df',
        brightCyan: '#4df0ff',
        brightWhite: '#ffffff'
      }
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());

    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Connect to WebSocket
    const token = localStorage.getItem('token');
    
    // Validate token to prevent parameter manipulation
    if (token && !/^[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*$/.test(token)) {
      console.error('Invalid token format');
      return;
    }
    
    const ws = new WebSocket(`${WS_URL}/ws/terminal?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'connect',
          connectionId: connectionId
        }));
      }
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'connected':
          setConnectionStatus('connected');
          onStatusChangeRef.current('connected');
          const dims = fitAddon.proposeDimensions();
          if (dims && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'resize',
              columns: dims.cols,
              rows: dims.rows
            }));
          }
          while (pendingCommandsRef.current.length > 0) {
            const cmd = pendingCommandsRef.current.shift();
            ws.send(JSON.stringify({ type: 'input', data: cmd + '\n' }));
          }
          window.dispatchEvent(new CustomEvent('check-pending-command', {
            detail: { sessionId }
          }));
          checkPendingOnMount();
          terminalRef.current?.dispatchEvent(new CustomEvent('terminal-ready', { bubbles: true }));
          break;

        case 'data':
          term.write(message.data);
          break;

        case 'error':
          setConnectionStatus('error');
          onStatusChangeRef.current('error');
          term.write(`\r\n\x1b[31mError: ${message.message}\x1b[0m\r\n`);
          break;

        case 'disconnected':
        case 'timeout':
          setConnectionStatus('disconnected');
          onStatusChangeRef.current('disconnected');
          term.write(`\r\n\x1b[33m${message.message || 'Disconnected'}\x1b[0m\r\n`);
          break;

        default:
          break;
      }
    };

    ws.onerror = (error) => {
      setConnectionStatus('error');
      onStatusChangeRef.current('error');
      term.write('\r\n\x1b[31mWebSocket connection error\x1b[0m\r\n');
    };

    ws.onclose = () => {
      setConnectionStatus('disconnected');
      onStatusChangeRef.current('disconnected');
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN && connectionStatusRef.current === 'connected') {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    const handleKeyDown = async (e) => {
      if (e.ctrlKey && e.key === 'c' && !e.shiftKey) {
        if (term.hasSelection()) {
          e.preventDefault();
          const selectedText = term.getSelection();
          try {
            await navigator.clipboard.writeText(selectedText);
            term.clearSelection();
            copyBufferRef.current = selectedText;
          } catch (err) {
            copyBufferRef.current = selectedText;
          }
          return false;
        }
        return true;
      }
      
      if (e.ctrlKey && e.key === 'v' && !e.shiftKey) {
        e.preventDefault();
        try {
          const text = await navigator.clipboard.readText();
          if (text && ws.readyState === WebSocket.OPEN && connectionStatusRef.current === 'connected') {
            ws.send(JSON.stringify({ type: 'input', data: text }));
          }
        } catch (err) {
          if (copyBufferRef.current && ws.readyState === WebSocket.OPEN && connectionStatusRef.current === 'connected') {
            ws.send(JSON.stringify({ type: 'input', data: copyBufferRef.current }));
          }
        }
        return false;
      }
      return true;
    };
    
    document.addEventListener('keydown', handleKeyDown);
    
    term.attachCustomKeyEventHandler((e) => {
      if (e.type === 'keydown') {
        if (e.ctrlKey && (e.key === 'c' || e.key === 'v')) {
          return false;
        }
      }
      return true;
    });

    const handleCheckPending = (e) => {
      const { sessionId: eventSessionId, command: eventCommand } = e.detail || {};
      if (eventSessionId && eventSessionId !== sessionId) return;
      
      const pendingCmd = eventCommand || terminalRef.current?.getAttribute('data-pending-command');
      if (pendingCmd && ws && ws.readyState === WebSocket.OPEN && connectionStatusRef.current === 'connected') {
        ws.send(JSON.stringify({ type: 'input', data: pendingCmd + '\n' }));
        terminalRef.current?.removeAttribute('data-pending-command');
      }
    };
    window.addEventListener('check-pending-command', handleCheckPending);

    const handleRunCommand = (e) => {
      const command = e.detail;
      if (ws && ws.readyState === WebSocket.OPEN && connectionStatusRef.current === 'connected') {
        ws.send(JSON.stringify({ type: 'input', data: command + '\n' }));
      } else {
        pendingCommandsRef.current.push(command);
      }
    };
    terminalRef.current?.addEventListener('run-command', handleRunCommand);

    const checkPendingOnMount = () => {
      const pendingCmd = terminalRef.current?.getAttribute('data-pending-command');
      if (pendingCmd) {
        window.dispatchEvent(new CustomEvent('check-pending-command', {
          detail: { sessionId, command: pendingCmd }
        }));
      }
    };
    
    checkPendingOnMount();
    timersRef.current.push(setTimeout(checkPendingOnMount, 500));
    timersRef.current.push(setTimeout(checkPendingOnMount, 1500));

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      terminalRef.current?.removeEventListener('run-command', handleRunCommand);
      window.removeEventListener('check-pending-command', handleCheckPending);
      timersRef.current.forEach(clearTimeout);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'disconnect' }));
      }
      ws.close();
      term.dispose();
    };
  }, [sessionId, connectionId]);

  // Handle focus when active
  useEffect(() => {
    if (isActive) {
      const timer = setTimeout(() => {
        if (fitAddonRef.current) fitAddonRef.current.fit();
        xtermRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isActive]);

  // Handle window resize with debounce
  useEffect(() => {
    const handleResize = debounce(() => {
      if (fitAddonRef.current && isActive) {
        fitAddonRef.current.fit();
        const dims = fitAddonRef.current.proposeDimensions();
        if (dims && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'resize',
            columns: dims.cols,
            rows: dims.rows
          }));
        }
      }
    }, 250);

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isActive]);

  return (
    <div 
      id={id}
      ref={terminalRef} 
      style={{ width: '100%', height: '100%', padding: '4px' }}
    />
  );
}

export default Terminal;
