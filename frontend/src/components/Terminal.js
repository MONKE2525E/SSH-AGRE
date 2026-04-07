import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';
import { WS_URL } from '../config';

function Terminal({ id, sessionId, connectionId, isActive, onStatusChange, onDisconnect }) {
  const terminalRef = useRef(null);
  const xtermRef = useRef(null);
  const fitAddonRef = useRef(null);
  const wsRef = useRef(null);
  const connectionStatusRef = useRef('connecting');
  const [connectionStatus, setConnectionStatus] = useState('connecting');

  // Keep ref in sync with state
  useEffect(() => {
    connectionStatusRef.current = connectionStatus;
  }, [connectionStatus]);

  useEffect(() => {
    // Initialize xterm.js with full color and Unicode support
    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: 'block',
      // Use a font with better Unicode and box-drawing support
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Consolas, "Liberation Mono", Menlo, Courier, monospace',
      fontSize: 14,
      scrollback: 10000,
      convertEol: true,
      allowProposedApi: true,
      // Enable Unicode and emoji support
      allowTransparency: true,
      drawBoldTextInBrightColors: true,
      minimumContrastRatio: 1,
      // Vibrant theme with saturated colors for Gemini CLI
      theme: {
        background: '#0d1117',
        foreground: '#f0f6fc',
        cursor: '#f0f6fc',
        cursorAccent: '#0d1117',
        selectionBackground: '#2d4a6f',
        selectionForeground: '#f0f6fc',
        // Vibrant saturated ANSI colors
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
    const ws = new WebSocket(`${WS_URL}/ws/terminal?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[WS] Connected, requesting SSH connection...');
      ws.send(JSON.stringify({
        type: 'connect',
        connectionId: connectionId
      }));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'connected':
          setConnectionStatus('connected');
          onStatusChange('connected');
          // Send initial resize
          const dims = fitAddon.proposeDimensions();
          if (dims) {
            ws.send(JSON.stringify({
              type: 'resize',
              columns: dims.cols,
              rows: dims.rows
            }));
          }
          break;

        case 'data':
          term.write(message.data);
          break;

        case 'error':
          setConnectionStatus('error');
          onStatusChange('error');
          term.write(`\r\n\x1b[31mError: ${message.message}\x1b[0m\r\n`);
          break;

        case 'disconnected':
        case 'timeout':
          setConnectionStatus('disconnected');
          onStatusChange('disconnected');
          term.write(`\r\n\x1b[33m${message.message || 'Disconnected'}\x1b[0m\r\n`);
          break;

        case 'ready':
          // Server is ready for commands
          break;

        default:
          console.log('[WS] Unknown message type:', message.type);
      }
    };

    ws.onerror = (error) => {
      console.error('[WS] WebSocket error:', error);
      setConnectionStatus('error');
      onStatusChange('error');
      term.write('\r\n\x1b[31mWebSocket connection error\x1b[0m\r\n');
    };

    ws.onclose = () => {
      console.log('[WS] WebSocket closed');
      setConnectionStatus('disconnected');
      onStatusChange('disconnected');
    };

    // Handle terminal input with proper copy/paste support
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN && connectionStatusRef.current === 'connected') {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    // Custom key handler for copy/paste (Ctrl+C, Ctrl+V, Ctrl+Shift+V)
    term.attachCustomKeyEventHandler((e) => {
      if (e.type === 'mousedown') {
        term.focus();
        return true;
      }
      
      // Handle Ctrl+Shift+V (paste - most reliable cross-browser)
      if (e.ctrlKey && e.shiftKey && e.key === 'V') {
        return true; // Let browser handle it
      }
      
      // Handle Ctrl+C (copy when text is selected, otherwise send to terminal)
      if (e.ctrlKey && e.key === 'c' && term.hasSelection()) {
        return true; // Let browser handle copy
      }
      
      // Handle Ctrl+V (paste)
      if (e.ctrlKey && e.key === 'v') {
        return true; // Let browser paste handle it
      }
      
      return true;
    });

    // Handle paste events
    terminalRef.current.addEventListener('paste', async (e) => {
      e.preventDefault();
      const text = e.clipboardData.getData('text');
      if (text && ws.readyState === WebSocket.OPEN && connectionStatusRef.current === 'connected') {
        // Write pasted text to terminal so user can see it
        term.write(text);
        // Send to SSH session
        ws.send(JSON.stringify({ type: 'input', data: text }));
      }
    });

    // Focus terminal
    setTimeout(() => term.focus(), 100);

    // Handle custom command event
    const handleRunCommand = (e) => {
      console.log('[Terminal] Received run-command event:', e.detail);
      console.log('[Terminal] WebSocket state:', ws.readyState, 'Connection status:', connectionStatusRef.current);
      if (ws.readyState === WebSocket.OPEN && connectionStatusRef.current === 'connected') {
        console.log('[Terminal] Sending command to WebSocket');
        ws.send(JSON.stringify({ type: 'command', command: e.detail }));
      } else {
        console.log('[Terminal] Cannot send - WS not open or not connected');
      }
    };
    terminalRef.current.addEventListener('run-command', handleRunCommand);
    console.log('[Terminal] Added run-command listener to', terminalRef.current.id);

    // Cleanup
    return () => {
      terminalRef.current?.removeEventListener('run-command', handleRunCommand);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'disconnect' }));
      }
      ws.close();
      term.dispose();
    };
  }, [sessionId, connectionId]);

  // Handle resize and focus when active
  useEffect(() => {
    if (isActive && fitAddonRef.current && wsRef.current) {
      setTimeout(() => {
        fitAddonRef.current.fit();
        xtermRef.current?.focus();
        const dims = fitAddonRef.current.proposeDimensions();
        if (dims && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'resize',
            columns: dims.cols,
            rows: dims.rows
          }));
        }
      }, 100);
    }
  }, [isActive]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
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
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isActive]);

  return (
    <div 
      id={id}
      ref={terminalRef} 
      style={{ 
        width: '100%', 
        height: '100%',
        padding: '4px'
      }}
    />
  );
}

export default Terminal;
