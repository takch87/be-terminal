# BeTerminal - Configuración de Seguridad SSH y Fail2ban

Este documento explica cómo resolver los problemas de conectividad SSH y configurar una conexión segura y robusta para BeTerminal.

## 📋 Resumen del Problema

- **Problema**: Cambio de IP del servidor y configuración incorrecta de SSH keys
- **Solución**: Configuración automática de SSH keys, fail2ban con whitelist, y gestión de IP dinámica

## 🛠️ Scripts Disponibles

### En el Servidor

1. **`security-setup.sh`** - Script maestro con menú interactivo
2. **`ssh-setup.sh`** - Diagnóstico de configuración SSH
3. **`setup-ssh-security.sh`** - Configuración segura de SSH
4. **`setup-fail2ban.sh`** - Configuración de fail2ban con whitelist
5. **`betTerminal-client.sh`** - Script para el cliente (tu PC)

### En tu PC (Cliente)

- **`betTerminal-client.sh`** - Gestión completa de conexión SSH

## 🚀 Configuración Rápida

### Paso 1: En el Servidor

```bash
# Ir al directorio de infraestructura
cd /path/to/be-terminal/infra

# Ejecutar configuración automática
sudo ./security-setup.sh
```

Selecciona la opción **4** para configuración rápida automática.

### Paso 2: En tu PC

```bash
# Copiar el script cliente a tu PC
scp usuario@servidor:/path/to/be-terminal/infra/betTerminal-client.sh ~/betTerminal-client.sh
chmod +x ~/betTerminal-client.sh

# Configuración inicial
./betTerminal-client.sh setup
```

## 📖 Instrucciones Detalladas

### 🔧 Configuración del Servidor

#### 1. Diagnóstico Inicial

```bash
./security-setup.sh
# Seleccionar opción 1: Diagnóstico completo
```

Esto te mostrará:
- Estado actual de SSH
- Configuración de claves
- Estado de fail2ban
- Información de red

#### 2. Configuración SSH Segura

```bash
./setup-ssh-security.sh
```

Esto configurará:
- ✅ Autenticación solo por clave SSH
- ❌ Deshabilitará autenticación por contraseña
- ✅ Banner de seguridad
- ✅ Configuración de logging
- ✅ Scripts para gestión de claves

#### 3. Configuración de Fail2ban

```bash
./setup-fail2ban.sh
```

Esto configurará:
- 🛡️ Protección SSH con fail2ban
- 📝 Whitelist automática de tu IP
- 🚫 Bloqueo de IPs maliciosas
- 📊 Logging y monitoreo

### 🖥️ Configuración del Cliente (Tu PC)

#### 1. Configuración Inicial

```bash
./betTerminal-client.sh setup
```

Esto:
- Generará una clave SSH única para tu PC
- Configurará SSH config local
- Te mostrará la clave pública para copiar al servidor

#### 2. Copia de Clave al Servidor

En el servidor, ejecuta:
```bash
# Método 1: Manual
echo 'TU_CLAVE_PUBLICA_AQUI' >> ~/.ssh/authorized_keys

# Método 2: Con script (si ya configuraste SSH security)
sudo add-betTerminal-key /path/to/clave.pub
```

#### 3. Probar Conexión

```bash
./betTerminal-client.sh test
```

#### 4. Conectarse

```bash
./betTerminal-client.sh connect
# O simplemente:
ssh betTerminal
```

## 🔄 Gestión de IP Dinámica

### Cuando Cambie tu IP

En tu PC:
```bash
./betTerminal-client.sh update-ip
```

Esto actualizará la configuración SSH sin necesidad de regenerar claves.

### Cuando Cambie la IP del Servidor

En tu PC:
```bash
./betTerminal-client.sh update-ip
```

En el servidor (si es necesario actualizar fail2ban):
```bash
sudo ./setup-fail2ban.sh
```

## 🛡️ Características de Seguridad

### SSH Configurado
- ✅ Solo autenticación por clave
- ❌ Sin acceso root
- ✅ Logging verboso
- ✅ Timeouts configurados
- ✅ Banner de seguridad

### Fail2ban Configurado
- 🛡️ Protección SSH (3 intentos, ban 30min)
- 🛡️ Protección Nginx
- 🛡️ Protección contra bots
- 📝 Tu IP en whitelist permanente
- 📊 Logging de intentos

### Gestión de Claves
- 🔑 Claves únicas por dispositivo
- 🔄 Rotación de claves fácil
- 📋 Identificación clara de claves
- 🔒 Permisos correctos automáticamente

## 📊 Comandos Útiles

### En el Servidor

```bash
# Ver estado completo
./security-setup.sh # Opción 6

# Reiniciar servicios
sudo systemctl restart ssh fail2ban

# Ver logs SSH
sudo tail -f /var/log/auth.log

# Ver logs fail2ban
sudo tail -f /var/log/fail2ban.log

# Gestionar whitelist
manage-whitelist list
manage-whitelist add IP
manage-whitelist remove IP

# Ver IPs bloqueadas
sudo fail2ban-client status sshd
```

### En tu PC

```bash
# Ver estado de conexión
./betTerminal-client.sh status

# Probar conexión
./betTerminal-client.sh test

# Conectarse
./betTerminal-client.sh connect

# Actualizar IP del servidor
./betTerminal-client.sh update-ip

# Generar nueva clave (rotación)
./betTerminal-client.sh rotate
```

## 🚨 Resolución de Problemas

### No puedo conectarme por SSH

1. **Verifica la configuración del servidor:**
   ```bash
   sudo sshd -t  # Verificar configuración SSH
   sudo systemctl status ssh  # Ver estado del servicio
   ```

2. **Verifica que tu IP no está bloqueada:**
   ```bash
   sudo fail2ban-client status sshd
   sudo fail2ban-client set sshd unbanip TU_IP  # Si está bloqueada
   ```

3. **Verifica que tu clave está en el servidor:**
   ```bash
   cat ~/.ssh/authorized_keys | grep "$(cat TU_CLAVE.pub)"
   ```

### Fail2ban está bloqueando conexiones legítimas

```bash
# Ver IPs bloqueadas
sudo fail2ban-client status sshd

# Desbanear tu IP
sudo fail2ban-client set sshd unbanip TU_IP

# Agregar IP al whitelist permanente
manage-whitelist add TU_IP
```

### SSH rechaza mi clave

1. **Verifica permisos:**
   ```bash
   # En el servidor
   chmod 700 ~/.ssh
   chmod 600 ~/.ssh/authorized_keys
   
   # En tu PC
   chmod 600 ~/.ssh/id_*
   ```

2. **Verifica configuración SSH:**
   ```bash
   # En el servidor
   grep PubkeyAuthentication /etc/ssh/sshd_config
   ```

### Cambié de IP y no puedo conectar

```bash
# En tu PC
./betTerminal-client.sh update-ip

# Luego probar
./betTerminal-client.sh test
```

## 🔐 Modo de Emergencia

Si pierdes acceso SSH completamente:

1. **Acceso físico o consola del proveedor**
2. **Habilitar temporalmente autenticación por contraseña:**
   ```bash
   sudo nano /etc/ssh/sshd_config
   # Cambiar: PasswordAuthentication yes
   sudo systemctl restart ssh
   ```
3. **Acceder por contraseña y arreglar claves**
4. **Deshabilitar nuevamente PasswordAuthentication**

## 📞 Soporte

Para problemas específicos:
1. Ejecuta `./security-setup.sh` opción 1 (diagnóstico)
2. Revisa logs: `/var/log/auth.log` y `/var/log/fail2ban.log`
3. Verifica conectividad de red básica

---

**Nota**: Este sistema está diseñado para máxima seguridad. Una vez configurado, solo tu PC podrá acceder al servidor, incluso si cambias de IP.
