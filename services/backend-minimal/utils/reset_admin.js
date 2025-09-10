const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('database.sqlite');

const newPassword = 'admin123';
const hashedPassword = bcrypt.hashSync(newPassword, 10);

db.run('UPDATE users SET password = ? WHERE username = ?', [hashedPassword, 'admin'], function(err) {
    if (err) {
        console.error('Error updating password:', err);
    } else {
        console.log('Admin password updated successfully');
        console.log('Username: admin');
        console.log('Password: admin123');
    }
    db.close();
});
