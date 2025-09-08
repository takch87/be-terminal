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

# Verificar que el puerto esté libre
if lsof -ti:$PORT >/dev/null 2>&1; then
    echo "Error: Puerto $PORT aún está en uso"
    lsof -i:$PORT
    exit 1
fi

echo "Puerto $PORT liberado exitosamente"

# Iniciar el servidor
echo "Iniciando servidor..."
cd "$(dirname "$0")"
node server.js
