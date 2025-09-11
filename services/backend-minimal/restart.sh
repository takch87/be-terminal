#!/bin/bash

# Script para reiniciar el servidor BeTerminal correctamente

# Cargar variables de entorno
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

PORT=${PORT:-3001}

echo "Reiniciando BeTerminal server en puerto $PORT..."

# Buscar y terminar procesos existentes
echo "Buscando procesos existentes..."
PIDS=$(lsof -ti:$PORT 2>/dev/null)

if [ ! -z "$PIDS" ]; then
    echo "Terminando procesos en puerto $PORT: $PIDS"
    echo $PIDS | xargs kill -TERM 2>/dev/null
    sleep 3
    
    # Si aún hay procesos, forzar terminación
    REMAINING_PIDS=$(lsof -ti:$PORT 2>/dev/null)
    if [ ! -z "$REMAINING_PIDS" ]; then
        echo "Forzando terminación de procesos restantes: $REMAINING_PIDS"
        echo $REMAINING_PIDS | xargs kill -9 2>/dev/null
        sleep 2
    fi
fi

# Limpiar archivo PID obsoleto
if [ -f beterminal.pid ]; then
    OLD_PID=$(cat beterminal.pid)
    if ! ps -p $OLD_PID > /dev/null 2>&1; then
        echo "Limpiando archivo PID obsoleto ($OLD_PID)"
        rm -f beterminal.pid
    fi
fi

# Verificar que el puerto esté libre
if lsof -ti:$PORT >/dev/null 2>&1; then
    echo "Error: Puerto $PORT aún está en uso"
    lsof -i:$PORT
    exit 1
fi

echo "Puerto $PORT liberado exitosamente"

# Iniciar el servidor en background
echo "Iniciando servidor en background..."
cd "$(dirname "$0")"

# Iniciar con nohup y guardar PID
nohup node server.js > server.log 2>&1 &
SERVER_PID=$!

# Guardar PID
echo $SERVER_PID > beterminal.pid

echo "Servidor iniciado con PID: $SERVER_PID"
echo "Logs en: server.log"

# Esperar un poco y verificar que esté corriendo
sleep 3
if ps -p $SERVER_PID > /dev/null 2>&1; then
    echo "✅ Servidor corriendo exitosamente en puerto $PORT"
    echo "💡 Para ver logs en tiempo real: tail -f server.log"
    echo "💡 Para detener el servidor: kill $SERVER_PID"
else
    echo "❌ Error: El servidor no pudo iniciarse"
    echo "Ver logs para más detalles: cat server.log"
    exit 1
fi
