#!/bin/bash

# Script simple para gestionar BeTerminal en puerto 3001
cd /root/Be-terminal/services/backend-minimal

case "$1" in
    start)
        echo "🚀 Iniciando BeTerminal Server..."
        node server.js
        ;;
    stop)
        echo "🛑 Deteniendo servidor..."
        pkill -f "node.*server.js"
        echo "✅ Servidor detenido"
        ;;
    restart)
        echo "🔄 Reiniciando servidor..."
        pkill -f "node.*server.js"
        sleep 3
        node server.js
        ;;
    status)
        PID=$(pgrep -f "node.*server.js")
        if [ ! -z "$PID" ]; then
            echo "✅ Servidor corriendo (PID: $PID)"
            lsof -i:3001
        else
            echo "❌ Servidor no está corriendo"
        fi
        ;;
    *)
        echo "Uso: $0 {start|stop|restart|status}"
        echo "Puerto fijo: 3001"
        ;;
esac
