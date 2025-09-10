const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function createBackup() {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDir = path.join(__dirname, '..', 'backups');
        const dbPath = path.join(__dirname, '..', 'database.sqlite');
        const backupPath = path.join(backupDir, `database_backup_${timestamp}.sqlite`);
        
        // Crear directorio si no existe
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
        
        // Copiar base de datos
        fs.copyFileSync(dbPath, backupPath);
        
        // Comprimir backup
        const zipPath = `${backupPath}.gz`;
        execSync(`gzip "${backupPath}"`);
        
        console.log(`✅ Backup creado: ${zipPath}`);
        
        // Limpiar backups antiguos (mantener solo los últimos 10)
        cleanOldBackups(backupDir);
        
        return zipPath;
        
    } catch (error) {
        console.error('❌ Error creando backup:', error);
        throw error;
    }
}

function cleanOldBackups(backupDir) {
    try {
        const files = fs.readdirSync(backupDir)
            .filter(file => file.startsWith('database_backup_') && file.endsWith('.gz'))
            .map(file => ({
                name: file,
                path: path.join(backupDir, file),
                time: fs.statSync(path.join(backupDir, file)).mtime
            }))
            .sort((a, b) => b.time - a.time);
        
        // Mantener solo los 10 más recientes
        if (files.length > 10) {
            const filesToDelete = files.slice(10);
            filesToDelete.forEach(file => {
                fs.unlinkSync(file.path);
                console.log(`🗑️ Backup antiguo eliminado: ${file.name}`);
            });
        }
        
    } catch (error) {
        console.error('❌ Error limpiando backups antiguos:', error);
    }
}

function scheduleBackups() {
    // Backup inmediato
    createBackup();
    
    // Limpiar backups inmediatamente después del primero
    const backupDir = path.join(__dirname, '..', 'backups');
    cleanOldBackups(backupDir);
    
    // Backup cada 6 horas
    setInterval(() => {
        console.log('⏰ Iniciando backup programado...');
        createBackup();
        cleanOldBackups(backupDir);
    }, 6 * 60 * 60 * 1000);
    
    console.log('📅 Backups programados cada 6 horas');
}

// Si se ejecuta directamente
if (require.main === module) {
    createBackup();
}

module.exports = {
    createBackup,
    scheduleBackups,
    cleanOldBackups
};
