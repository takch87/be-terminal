const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('database.sqlite');

async function createTestUser() {
    const username = 'test';
    const password = 'test123';
    
    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Insert user
    db.run(
        'INSERT OR REPLACE INTO users (username, password) VALUES (?, ?)',
        [username, hashedPassword],
        function(err) {
            if (err) {
                console.error('Error creating user:', err.message);
            } else {
                console.log(`✅ Usuario creado: ${username} / ${password}`);
            }
            db.close();
        }
    );
}

createTestUser();
