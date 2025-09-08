#!/bin/bash

# Script para gestionar el servidor BeTerminal en puerto fijo 3001
# Siempre usa el puerto 3001, no importa qué

PORT=3001
SERVER_FILE="/root/Be-terminal/services/backend-minimal/server.js"
SERVER_DIR="/root/Be-terminal/services/backend-minimal"

echo "🚀 Iniciando BeTerminal Server en puerto $PORT..."

# Función para liberar el puerto
free_port() {
    echo "🔄 Liberando puerto $PORT..."
    
    # Buscar procesos usando el puerto
    PIDS=$(lsof -ti:$PORT 2>/dev/null)
    
    if [ ! -z "$PIDS" ]; then
        echo "📋 Procesos encontrados en puerto $PORT: $PIDS"
        
        # Intentar terminación graceful
        echo "⏱️  Intentando terminación graceful..."
        echo $PIDS | xargs kill -TERM 2>/dev/null
        sleep 3
        
        # Verificar si siguen corriendo
        REMAINING=$(lsof -ti:$PORT 2>/dev/null)
        if [ ! -z "$REMAINING" ]; then
            echo "💥 Forzando terminación..."
            echo $REMAINING | xargs kill -9 2>/dev/null
            sleep 2
        fi
    fi
    
    # Verificación final
    FINAL_CHECK=$(lsof -ti:$PORT 2>/dev/null)
    if [ ! -z "$FINAL_CHECK" ]; then
        echo "❌ Error: No se pudo liberar el puerto $PORT"
        exit 1
    else
        echo "✅ Puerto $PORT liberado exitosamente"
    fi
}

# Función para iniciar el servidor
start_server() {
    echo "🌟 Iniciando servidor en $SERVER_DIR..."
    cd "$SERVER_DIR"
    
    # Asegurar que el puerto esté libre
    free_port
    
    # Iniciar servidor
    echo "🎯 Iniciando BeTerminal en puerto $PORT..."
    PORT=$PORT node "$SERVER_FILE"
}

# Función para verificar el estado
check_status() {
    PID=$(lsof -ti:$PORT 2>/dev/null)
    if [ ! -z "$PID" ]; then
        echo "✅ Servidor corriendo en puerto $PORT (PID: $PID)"
        return 0
    else
        echo "❌ Servidor no está corriendo en puerto $PORT"
        return 1
    fi
}

# Función para reiniciar
restart_server() {
    echo "🔄 Reiniciando servidor..."
    free_port
    sleep 1
    start_server
}

# Función para detener
stop_server() {
    echo "🛑 Deteniendo servidor..."
    free_port
    echo "✅ Servidor detenido"
}

# Procesar argumentos
case "$1" in
    start)
        start_server
        ;;
    stop)
        stop_server
        ;;
    restart)
        restart_server
        ;;
    status)
        check_status
        ;;
    *)
        echo "Uso: $0 {start|stop|restart|status}"
        echo ""
        echo "Comandos:"
        echo "  start   - Inicia el servidor en puerto $PORT"
        echo "  stop    - Detiene el servidor"
        echo "  restart - Reinicia el servidor"
        echo "  status  - Muestra el estado del servidor"
        echo ""
        echo "El servidor SIEMPRE usa el puerto $PORT fijo."
        exit 1
        ;;
esac
