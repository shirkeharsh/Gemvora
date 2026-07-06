#!/bin/zsh

echo "==========================================="
echo "🔄 PulseHealth AI Server Restarter"
echo "==========================================="

echo "🛑 1. Terminating old servers on ports 5173, 5174, and 5175..."
PIDS=$(lsof -t -i:5173 -i:5174 -i:5175)
if [ -n "$PIDS" ]; then
  echo "Found processes: $PIDS"
  echo "$PIDS" | xargs kill -9 2>/dev/null
  echo "✅ Ports cleared."
else
  echo "ℹ️ No active processes found on these ports."
fi

sleep 1

echo "🚀 2. Launching diagnostics logger server on port 5174..."
nohup node loggerServer.js > loggerServer.log 2>&1 &
LOGGER_PID=$!
echo "✅ Logger server started (PID: $LOGGER_PID)."

echo "🚀 3. Launching Vite development server..."
nohup npm run dev > devServer.log 2>&1 &
VITE_PID=$!
echo "✅ Vite server started (PID: $VITE_PID)."

echo "⏳ 4. Waiting for servers to initialize..."
sleep 3

echo "🌐 5. Auto-launching both tabs in Google Chrome..."
open -a "Google Chrome" "http://localhost:5173" "http://localhost:5174"

echo "==========================================="
echo "🎉 Done! Servers are running in the background."
echo "📝 logs are saved in: loggerServer.log, devServer.log"
echo "==========================================="
