# BeTerminal Backend - Configuración y Uso

## Funcionalidades del Dashboard

### 🔐 Sistema de Autenticación
- Login con JWT tokens
- Usuario admin por defecto: `admin` / `admin123`
- Gestión de usuarios con contraseñas hasheadas (bcrypt)

### 👥 Gestión de Usuarios
- ✅ Crear nuevos usuarios
- ✅ Listar todos los usuarios
- ✅ Eliminar usuarios (excepto admin)
- ✅ Ver eventos asignados por usuario
- ✅ Asignar/desasignar eventos a usuarios

### 📅 Gestión de Eventos
- ✅ Crear eventos con códigos únicos
- ✅ Listar todos los eventos
- ✅ Activar/desactivar eventos
- ✅ Eliminar eventos
- ✅ Ver usuarios asignados por evento
- ✅ Asociar eventos a usuarios

### � Relaciones Usuario-Evento
- ✅ Sistema de vinculación usuario-evento
- ✅ Roles por usuario (operator, admin, etc.)
- ✅ Gestión bidireccional de asignaciones
- ✅ Interfaz gráfica para gestionar vinculaciones

### �💳 APIs de Stripe Terminal
- ✅ Connection tokens para inicializar SDK
- ✅ PaymentIntents para cobros presenciales
- ✅ Validación de eventos en transacciones
- ✅ Webhook handler opcional

### 🌐 Dashboard Web
- ✅ Interfaz gráfica completa
- ✅ Modal para gestión de eventos de usuario
- ✅ Tablas interactivas con acciones
- ✅ Logo BeTicket integrado
- ✅ Responsive design

## URLs de Acceso

- **Dashboard**: https://be-terminal.beticket.net/dashboard
- **Login**: https://be-terminal.beticket.net/login
- **API Health**: https://be-terminal.beticket.net/healthz

## Credenciales por Defecto

```
Usuario: admin
Contraseña: admin123
```

## APIs Disponibles

### Autenticación
```bash
POST /api/auth/login
Body: { "username": "admin", "password": "admin123" }
Response: { "token": "jwt_token", "user": {...} }
```

### Gestión de Usuarios
```bash
# Listar usuarios
GET /api/users
Headers: Authorization: Bearer <token>
Response: [{ "id": 1, "username": "admin", "created_at": "..." }, ...]

# Crear usuario
POST /api/users
Headers: Authorization: Bearer <token>
Body: { "username": "nuevo_usuario", "password": "password123" }

# Eliminar usuario
DELETE /api/users/:id
Headers: Authorization: Bearer <token>
```

### Gestión de Eventos
```bash
# Listar eventos
GET /api/events
Headers: Authorization: Bearer <token>
Response: [{ "id": 1, "code": "EVT001", "name": "Evento", ... }, ...]

# Crear evento
POST /api/events
Headers: Authorization: Bearer <token>
Body: { "code": "EVT001", "name": "Evento Prueba", "description": "..." }

# Actualizar evento
PUT /api/events/:id
Headers: Authorization: Bearer <token>
Body: { "name": "Nuevo nombre", "description": "...", "active": true }

# Eliminar evento
DELETE /api/events/:id
Headers: Authorization: Bearer <token>
```

### Gestión de Relaciones Usuario-Evento
```bash
# Vincular usuario a evento
POST /api/user-events/link
Headers: Authorization: Bearer <token>
Body: { "userId": 1, "eventId": 1, "role": "operator" }

# Desvincular usuario de evento
DELETE /api/user-events/unlink
Headers: Authorization: Bearer <token>
Body: { "userId": 1, "eventId": 1 }

# Obtener eventos de un usuario
GET /api/users/:id/events
Headers: Authorization: Bearer <token>
Response: [{ "event_id": 1, "code": "EVT001", "event_name": "...", "role": "operator" }, ...]

# Obtener usuarios de un evento
GET /api/events/:id/users
Headers: Authorization: Bearer <token>
Response: [{ "user_id": 1, "username": "admin", "role": "operator" }, ...]
```

### Validación de Eventos (Público - para Android)
```bash
POST /api/events/validate
Body: { "code": "EVT001" }
Response: { "valid": true, "event": {...} }
```

### Stripe Terminal
```bash
POST /connection_token
Response: { "secret": "pst_..." }

POST /create_payment_intent
Body: { "amount_cents": 1000, "event_code": "EVT001", "description": "Test" }
Response: { "id": "pi_...", "client_secret": "pi_...", "status": "..." }
```

## Base de Datos

Utiliza SQLite con las siguientes tablas:
- `users`: Gestión de usuarios
- `events`: Gestión de eventos

Los datos se persisten en el archivo `database.sqlite`.

## Variables de Entorno

```env
STRIPE_SECRET_KEY=sk_test_...
JWT_SECRET=your-secret-key
PORT=8001
DB_PATH=./database.sqlite
ALLOW_ORIGINS=https://be-terminal.beticket.net,...
```

## Desarrollo Local

```bash
cd services/backend-minimal
npm install
cp .env.example .env
# Editar .env con tus claves
npm start
```

## Producción con Docker

```bash
cd infra/docker
docker-compose -f docker-compose.prod.yml up -d
```
