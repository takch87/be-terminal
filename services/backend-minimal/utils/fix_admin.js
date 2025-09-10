const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();

async function createFreshAdmin() {
  const db = new sqlite3.Database('./be_terminal.db');
  const password = '123456';
  
  console.log('🔑 Contraseña a usar:', password);
  
  // Generar hash y verificarlo inmediatamente
  const hash = await bcrypt.hash(password, 10);
  const verification = await bcrypt.compare(password, hash);
  
  console.log('🔐 Hash generado:', hash);
  console.log('✅ Verificación inmediata:', verification);
  
  if (!verification) {
    console.log('❌ ERROR: Hash no funciona!');
    db.close();
    return;
  }
  
  // Eliminar usuarios existentes
  db.run('DELETE FROM users', (err) => {
    if (err) {
      console.error('Error limpiando usuarios:', err);
      return;
    }
    
    console.log('🗑️ Usuarios anteriores eliminados');
    
    // Insertar nuevo usuario
    db.run('INSERT INTO users (username, password) VALUES (?, ?)', ['admin', hash], function(err) {
      if (err) {
        console.error('❌ Error insertando usuario:', err);
      } else {
        console.log('✅ Usuario admin creado correctamente con ID:', this.lastID);
        
        // Verificar inmediatamente
        db.get('SELECT * FROM users WHERE username = ?', ['admin'], async (err, user) => {
          if (err || !user) {
            console.log('❌ Error verificando usuario:', err);
            return;
          }
          
          const finalTest = await bcrypt.compare(password, user.password);
          console.log('🎯 Verificación final en BD:', finalTest ? '✅ ÉXITO' : '❌ FALLO');
          
          db.close();
        });
      }
    });
  });
}

createFreshAdmin().catch(console.error);
