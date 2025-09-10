const fs = require('fs');
const path = require('path');

class TransactionLogger {
    constructor() {
        this.logsDir = path.join(__dirname, 'logs');
        this.ensureLogsDir();
    }
    
    ensureLogsDir() {
        if (!fs.existsSync(this.logsDir)) {
            fs.mkdirSync(this.logsDir, { recursive: true });
        }
    }
    
    getLogFileName(type = 'transactions') {
        const today = new Date().toISOString().split('T')[0];
        return path.join(this.logsDir, `${type}_${today}.log`);
    }
    
    log(level, message, data = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            data,
            pid: process.pid
        };
        
        const logLine = JSON.stringify(logEntry) + '\n';
        
        // Log general
        fs.appendFileSync(this.getLogFileName('general'), logLine);
        
        // Log específico si es transacción
        if (data.transaction_id || message.includes('payment') || message.includes('transaction')) {
            fs.appendFileSync(this.getLogFileName('transactions'), logLine);
        }
        
        // Log de errores
        if (level === 'ERROR') {
            fs.appendFileSync(this.getLogFileName('errors'), logLine);
        }
        
        // También mostrar en consola
        console.log(`[${timestamp}] ${level}: ${message}`, data);
    }
    
    info(message, data = {}) {
        this.log('INFO', message, data);
    }
    
    error(message, data = {}) {
        this.log('ERROR', message, data);
    }
    
    warn(message, data = {}) {
        this.log('WARN', message, data);
    }
    
    debug(message, data = {}) {
        this.log('DEBUG', message, data);
    }
    
    transaction(action, data = {}) {
        this.log('TRANSACTION', `Transaction ${action}`, {
            action,
            ...data
        });
    }
    
    // Limpiar logs antiguos (mantener 30 días)
    cleanOldLogs() {
        try {
            const files = fs.readdirSync(this.logsDir);
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            files.forEach(file => {
                const filePath = path.join(this.logsDir, file);
                const stats = fs.statSync(filePath);
                
                if (stats.mtime < thirtyDaysAgo) {
                    fs.unlinkSync(filePath);
                    this.info(`Old log file deleted: ${file}`);
                }
            });
        } catch (error) {
            this.error('Error cleaning old logs', { error: error.message });
        }
    }
    
    // Rotar logs diariamente
    scheduleLogRotation() {
        // Limpiar logs antiguos al inicio
        this.cleanOldLogs();
        
        // Programar limpieza diaria
        setInterval(() => {
            this.cleanOldLogs();
        }, 24 * 60 * 60 * 1000);
        
        this.info('Log rotation scheduled');
    }
}

module.exports = new TransactionLogger();
