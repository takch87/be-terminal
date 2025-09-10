const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

class Database {
  constructor(dbPath = './database.sqlite') {
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
      } else {
        console.log('Connected to SQLite database');
        this.initTables();
      }
    });
  }

  initTables() {
    // Tabla de usuarios
    this.db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabla de eventos
    this.db.run(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        user_id INTEGER,
        active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `);

    // Tabla de relación usuario-evento
    this.db.run(`
      CREATE TABLE IF NOT EXISTS user_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        event_id INTEGER,
        role TEXT DEFAULT 'operator',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (event_id) REFERENCES events (id),
        UNIQUE(user_id, event_id)
      )
    `);

    // Tabla de configuración
    this.db.run(`
      CREATE TABLE IF NOT EXISTS config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Crear usuario admin por defecto
    this.createDefaultAdmin();
  }

  async createDefaultAdmin() {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    this.db.run(
      'INSERT OR IGNORE INTO users (username, password) VALUES (?, ?)',
      ['admin', hashedPassword],
      function(err) {
        if (err) {
          console.error('Error creating admin user:', err);
        } else if (this.changes > 0) {
          console.log('Default admin user created');
        }
      }
    );
  }

  // Métodos para usuarios
  getUserByUsername(username) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM users WHERE username = ?',
        [username],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  getUserById(id) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM users WHERE id = ?',
        [id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  createUser(username, password) {
    return new Promise(async (resolve, reject) => {
      try {
        const hashedPassword = await bcrypt.hash(password, 10);
        this.db.run(
          'INSERT INTO users (username, password) VALUES (?, ?)',
          [username, hashedPassword],
          function(err) {
            if (err) reject(err);
            else resolve({ id: this.lastID, username });
          }
        );
      } catch (error) {
        reject(error);
      }
    });
  }

  // Métodos para eventos
  createEvent(code, name, description, userId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO events (code, name, description, user_id) VALUES (?, ?, ?, ?)',
        [code, name, description, userId],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID, code, name, description, userId });
        }
      );
    });
  }

  getEventByCode(code) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM events WHERE UPPER(code) = UPPER(?) AND active = 1',
        [code],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  getEventsByUser(userId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM events WHERE user_id = ? ORDER BY created_at DESC',
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  getAllEvents() {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT e.*, u.username FROM events e LEFT JOIN users u ON e.user_id = u.id ORDER BY e.created_at DESC',
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  // Métodos para gestión de usuarios
  getAllUsers() {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT id, username, created_at FROM users ORDER BY created_at DESC',
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  deleteUser(userId) {
    return new Promise((resolve, reject) => {
      // Primero eliminar relaciones usuario-evento
      this.db.run('DELETE FROM user_events WHERE user_id = ?', [userId], (err) => {
        if (err) {
          reject(err);
          return;
        }
        // Luego eliminar el usuario
        this.db.run('DELETE FROM users WHERE id = ?', [userId], function(err) {
          if (err) reject(err);
          else resolve({ changes: this.changes });
        });
      });
    });
  }

  // Métodos para gestión de eventos
  updateEvent(eventId, { name, description, active }) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE events SET name = ?, description = ?, active = ? WHERE id = ?',
        [name, description, active, eventId],
        function(err) {
          if (err) reject(err);
          else resolve({ changes: this.changes });
        }
      );
    });
  }

  deleteEvent(eventId) {
    return new Promise((resolve, reject) => {
      // Primero eliminar relaciones usuario-evento
      this.db.run('DELETE FROM user_events WHERE event_id = ?', [eventId], (err) => {
        if (err) {
          reject(err);
          return;
        }
        // Luego eliminar el evento
        this.db.run('DELETE FROM events WHERE id = ?', [eventId], function(err) {
          if (err) reject(err);
          else resolve({ changes: this.changes });
        });
      });
    });
  }

  // Métodos para relación usuario-evento
  linkUserToEvent(userId, eventId, role = 'operator') {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT OR REPLACE INTO user_events (user_id, event_id, role) VALUES (?, ?, ?)',
        [userId, eventId, role],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID, userId, eventId, role });
        }
      );
    });
  }

  unlinkUserFromEvent(userId, eventId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM user_events WHERE user_id = ? AND event_id = ?',
        [userId, eventId],
        function(err) {
          if (err) reject(err);
          else resolve({ changes: this.changes });
        }
      );
    });
  }

  getUserEventLinks(userId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT ue.*, e.code, e.name as event_name, e.description 
         FROM user_events ue 
         JOIN events e ON ue.event_id = e.id 
         WHERE ue.user_id = ?`,
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  getEventUserLinks(eventId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT ue.*, u.username 
         FROM user_events ue 
         JOIN users u ON ue.user_id = u.id 
         WHERE ue.event_id = ?`,
        [eventId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  // Validar si un usuario puede acceder a un evento
  hasUserEventPermission(userId, eventId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT 1 FROM user_events WHERE user_id = ? AND event_id = ?',
        [userId, eventId],
        (err, row) => {
          if (err) reject(err);
          else resolve(!!row);
        }
      );
    });
  }

  // Métodos de configuración
  saveConfig(key, value) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT OR REPLACE INTO config (key, value, updated_at) 
         VALUES (?, ?, CURRENT_TIMESTAMP)`,
        [key, value],
        function(err) {
          if (err) reject(err);
          else resolve({ key, value });
        }
      );
    });
  }

  getConfig(key) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT value FROM config WHERE key = ?',
        [key],
        (err, row) => {
          if (err) reject(err);
          else resolve(row ? row.value : null);
        }
      );
    });
  }

  getAllConfig() {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT key, value FROM config',
        [],
        (err, rows) => {
          if (err) reject(err);
          else {
            const config = {};
            rows.forEach(row => {
              config[row.key] = row.value;
            });
            resolve(config);
          }
        }
      );
    });
  }

  close() {
    this.db.close();
  }
}

module.exports = Database;
