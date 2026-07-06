import http from 'http';
import fs from 'fs';

const PORT = 5174;
const clients = new Set();

const htmlPage = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>PulseHealth AI - Live Logs Dashboard</title>
  <style>
    body {
      background-color: #000;
      color: #34c759;
      font-family: 'Courier New', Courier, monospace;
      margin: 0;
      padding: 20px;
    }
    header {
      border-bottom: 2px solid #34c759;
      padding-bottom: 10px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    h1 {
      margin: 0;
      font-size: 20px;
    }
    #logs {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: calc(100vh - 100px);
      overflow-y: auto;
    }
    .log-entry {
      border-left: 3px solid #34c759;
      padding-left: 10px;
      line-height: 1.4;
      animation: fadeIn 0.2s ease-in-out;
    }
    .log-time {
      color: #888;
      font-size: 12px;
      margin-right: 10px;
    }
    .log-level {
      font-weight: bold;
      text-transform: uppercase;
      margin-right: 10px;
    }
    .level-info { color: #34c759; }
    .level-warn { color: #ff9500; border-color: #ff9500; }
    .level-error { color: #ff3b30; border-color: #ff3b30; }
    .level-ocr { color: #af52de; border-color: #af52de; }
    
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
  </style>
</head>
<body>
  <header>
    <h1>PulseHealth AI - Real-time Diagnostics Terminal</h1>
    <div style="font-size: 12px; color: #888;">Port ${PORT}</div>
  </header>
  <div id="logs"></div>

  <script>
    const logsContainer = document.getElementById('logs');
    const sse = new EventSource('/stream');
    
    sse.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const div = document.createElement('div');
      div.className = 'log-entry level-' + data.level;
      
      const timeSpan = document.createElement('span');
      timeSpan.className = 'log-time';
      timeSpan.textContent = new Date(data.timestamp).toLocaleTimeString();
      
      const levelSpan = document.createElement('span');
      levelSpan.className = 'log-level level-' + data.level;
      levelSpan.textContent = '[' + data.level + ']';
      
      const messageText = document.createElement('span');
      messageText.textContent = data.message;
      
      div.appendChild(timeSpan);
      div.appendChild(levelSpan);
      div.appendChild(messageText);
      
      logsContainer.appendChild(div);
      logsContainer.scrollTop = logsContainer.scrollHeight;
    };

    sse.onerror = () => {
      console.warn('SSE connection closed. Reconnecting...');
    };
  </script>
</body>
</html>
`;

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Any GET request (other than stream) serves the logging page
  if (req.method === 'GET' && req.url !== '/stream') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(htmlPage);
    return;
  }

  if (req.method === 'GET' && req.url === '/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    clients.add(res);

    req.on('close', () => {
      clients.delete(res);
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/set-webhook') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const webhookUrl = data.webhookUrl || '';
        fs.writeFileSync('.webhook_url', webhookUrl.trim());
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/log') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const logData = JSON.parse(body);
        const logPayload = JSON.stringify({
          timestamp: logData.timestamp || new Date().toISOString(),
          level: logData.level || 'info',
          message: logData.message || ''
        });

        for (const client of clients) {
          client.write(`data: ${logPayload}\n\n`);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`PulseHealth Logger Server running at http://localhost:${PORT}`);
});
