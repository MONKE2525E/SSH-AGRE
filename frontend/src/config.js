const API_URL = '';  // Use same origin (nginx will proxy to backend)
const WS_URL = process.env.REACT_APP_WS_URL || (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host;

export { API_URL, WS_URL };
