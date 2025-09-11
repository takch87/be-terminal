#!/bin/bash

# Script de monitoreo para BeTerminal Backend
# Verifica si el servidor está ejecutándose y lo reinicia si es necesario

BACKEND_DIR="/home/client_4752_1/be-terminal/services/backend-minimal"
PID_FILE="$BACKEND_DIR/beterminal.pid"
LOG_FILE="$BACKEND_DIR/monitor.log"

cd "$BACKEND_DIR"

# Función para logging
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# Verificar si el proceso está ejecutándose
check_process() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            return 0  # Proceso está ejecutándose
        fi
    fi
    return 1  # Proceso no está ejecutándose
}

# Verificar si el servidor responde
check_server() {
    curl -s --max-time 10 http://localhost:3002/ > /dev/null 2>&1
    return $?
}

# Iniciar el servidor
start_server() {
    log "Iniciando servidor BeTerminal..."
    nohup node server.js > server.log 2>&1 & 
    echo $! > "$PID_FILE"
    sleep 3
    if check_process && check_server; then
        log "Servidor iniciado correctamente (PID: $(cat $PID_FILE))"
        return 0
    else
        log "Error al iniciar el servidor"
        return 1
    fi
}

# Función principal
main() {
    log "Verificando estado del servidor..."
    
    if check_process; then
        if check_server; then
            log "Servidor funcionando correctamente"
            exit 0
        else
            log "Proceso existe pero servidor no responde. Reiniciando..."
            kill $(cat "$PID_FILE") 2>/dev/null
            rm -f "$PID_FILE"
        fi
    else
        log "Proceso no encontrado. Iniciando servidor..."
    fi
    
    start_server
    
    if [ $? -eq 0 ]; then
        log "Monitoreo completado exitosamente"
        exit 0
    else
        log "Error en el monitoreo"
        exit 1
    fi
}

main
