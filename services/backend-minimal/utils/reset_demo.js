const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('database.sqlite');

const newPassword = 'demo123';
const hashedPassword = bcrypt.hashSync(newPassword, 10);

db.run('UPDATE users SET password = ? WHERE username = ?', [hashedPassword, 'demo'], function(err) {
    if (err) {
        console.error('Error updating password:', err);
    } else {
        console.log('Demo password updated successfully');
        console.log('Username: demo');
        console.log('Password: demo123');
    }
    db.close();
});
