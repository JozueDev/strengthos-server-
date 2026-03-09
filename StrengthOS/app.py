import sqlite3
import os
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

DB_NAME = "database.db"

def init_db():
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    # Tabla de clientes
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS clientes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT UNIQUE NOT NULL,
            nombre TEXT NOT NULL,
            contrasena_hash TEXT NOT NULL,
            es_admin BOOLEAN DEFAULT 0,
            fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    # Tabla de rutinas (ejemplo)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS rutinas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cliente_id INTEGER,
            dia TEXT,
            ejercicios TEXT,
            notas_cliente TEXT DEFAULT '',
            FOREIGN KEY(cliente_id) REFERENCES clientes(id)
        )
    ''')
    
    # Intentar añadir columnas si no existen
    try:
        cursor.execute("ALTER TABLE rutinas ADD COLUMN notas_cliente TEXT DEFAULT ''")
    except sqlite3.OperationalError:
        pass

    try:
        cursor.execute("ALTER TABLE clientes ADD COLUMN peso TEXT DEFAULT '--'")
        cursor.execute("ALTER TABLE clientes ADD COLUMN estatura TEXT DEFAULT '--'")
        cursor.execute("ALTER TABLE clientes ADD COLUMN edad TEXT DEFAULT '--'")
    except sqlite3.OperationalError:
        pass
    
    # Crear el usuario administrador
    cursor.execute("SELECT * FROM clientes WHERE user_id='admin'")
    if cursor.fetchone() is None:
        try:
            hashed_pw_admin = generate_password_hash("5384")
            cursor.execute("INSERT INTO clientes (user_id, nombre, contrasena_hash, es_admin) VALUES (?, ?, ?, ?)", 
                           ("admin", "Entrenador Josue", hashed_pw_admin, 1))
        except:
            pass
            
    conn.commit()
    conn.close()

# Iniciar siempre la base de datos al importar el archivo
init_db()

# Servir página web e index principal
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

# Forzar el envío de archivos estáticos (CSS, JS, media, etc.) explícitamente si algo falla con el middleware
@app.route('/<path:path>')
def serve_static(path):
    # Si el archivo existe físicamente en esta carpeta, envíalo:
    if os.path.exists(os.path.join('.', path)):
        return send_from_directory('.', path)
    # Si no, por defecto te regresamos al index
    return send_from_directory('.', 'index.html')

# API: Registro de nuevo cliente
@app.route('/api/clientes', methods=['POST'])
def crear_cliente():
    data = request.json
    nombre = data.get('nombre')
    contrasena = data.get('contrasena')

    if not nombre or not contrasena:
        return jsonify({"error": "Faltan datos obligatorios"}), 400

    hashed_pw = generate_password_hash(contrasena)
    
    try:
        conn = sqlite3.connect(DB_NAME)
        cursor = conn.cursor()
        
        # Generar secuencia automática: 0001, 0002...
        cursor.execute("SELECT user_id FROM clientes WHERE user_id != 'admin'")
        rows = cursor.fetchall()
        
        # Filtrar solo user_ids numéricos para obtener el máximo
        numericos = [int(r[0]) for r in rows if str(r[0]).isdigit()]
        siguiente_numero = max(numericos) + 1 if numericos else 1
        
        # Formatear el siguiente número con 4 ceros a la izquierda (Ej: 0001)
        nuevo_user_id = str(siguiente_numero).zfill(4)

        cursor.execute("INSERT INTO clientes (user_id, nombre, contrasena_hash, es_admin) VALUES (?, ?, ?, 0)", 
                       (nuevo_user_id, nombre, hashed_pw))
        conn.commit()
        conn.close()
        return jsonify({"mensaje": "Cliente creado exitosamente", "user_id": nuevo_user_id}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# API: Obtener todos los clientes (Solo para ti como admin)
@app.route('/api/clientes', methods=['GET'])
def obtener_clientes():
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, user_id, nombre, fecha_registro, peso, estatura, edad FROM clientes")
        clientes = [{"id": row[0], "user_id": row[1], "nombre": row[2], "fecha_registro": row[3], "peso": row[4], "estatura": row[5], "edad": row[6]} for row in cursor.fetchall()]
    except sqlite3.OperationalError:
        cursor.execute("SELECT id, user_id, nombre, fecha_registro FROM clientes")
        clientes = [{"id": row[0], "user_id": row[1], "nombre": row[2], "fecha_registro": row[3], "peso": "--", "estatura": "--", "edad": "--"} for row in cursor.fetchall()]
    conn.close()
    return jsonify(clientes)

# API: Actualizar perfil de cliente
@app.route('/api/cliente/<user_id>/perfil', methods=['PUT'])
def actualizar_perfil(user_id):
    data = request.json
    peso     = data.get('peso', '').strip()
    estatura = data.get('estatura', '').strip()
    edad     = data.get('edad', '').strip()

    # Solo actualizar campos que realmente se enviaron (no vacíos)
    campos = {}
    if peso:     campos['peso']     = peso
    if estatura: campos['estatura'] = estatura
    if edad:     campos['edad']     = edad

    if not campos:
        return jsonify({"error": "No se enviaron datos para actualizar"}), 400

    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    try:
        set_clause = ", ".join(f"{k}=?" for k in campos)
        valores = list(campos.values()) + [user_id]
        cursor.execute(f"UPDATE clientes SET {set_clause} WHERE user_id=?", valores)
        conn.commit()
    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 500
    conn.close()
    return jsonify({"mensaje": "Perfil actualizado exitosamente"}), 200

# API: Obtener perfil de cliente individual
@app.route('/api/cliente/<user_id>/perfil', methods=['GET'])
def obtener_perfil(user_id):
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, user_id, nombre, fecha_registro, peso, estatura, edad FROM clientes WHERE user_id=?", (user_id,))
        row = cursor.fetchone()
        if row:
            cliente = {"id": row[0], "user_id": row[1], "nombre": row[2], "fecha_registro": row[3], "peso": row[4], "estatura": row[5], "edad": row[6]}
        else:
            conn.close()
            return jsonify({"error": "No encontrado"}), 404
    except sqlite3.OperationalError:
        cursor.execute("SELECT id, user_id, nombre, fecha_registro FROM clientes WHERE user_id=?", (user_id,))
        row = cursor.fetchone()
        if row:
            cliente = {"id": row[0], "user_id": row[1], "nombre": row[2], "fecha_registro": row[3], "peso": "--", "estatura": "--", "edad": "--"}
        else:
            conn.close()
            return jsonify({"error": "No encontrado"}), 404
    conn.close()
    return jsonify(cliente)

# API: Login de cliente
@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    user_id = data.get('user_id')
    contrasena = data.get('contrasena')

    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, nombre, contrasena_hash, es_admin, peso, estatura, edad FROM clientes WHERE user_id=?", (user_id,))
        cliente = cursor.fetchone()
    except sqlite3.OperationalError:
        try:
            cursor.execute("SELECT id, nombre, contrasena_hash, es_admin FROM clientes WHERE user_id=?", (user_id,))
            cliente = cursor.fetchone()
            if cliente:
                cliente = (cliente[0], cliente[1], cliente[2], cliente[3], "--", "--", "--")
        except sqlite3.OperationalError:
            cursor.execute("SELECT id, nombre, contrasena_hash FROM clientes WHERE user_id=?", (user_id,))
            cliente = cursor.fetchone()
            if cliente:
                cliente = (cliente[0], cliente[1], cliente[2], False, "--", "--", "--")
            
    conn.close()

    if cliente and check_password_hash(cliente[2], contrasena):
        es_admin = bool(cliente[3]) if len(cliente) > 3 else False
        return jsonify({
            "mensaje": "Login exitoso",
            "cliente": {
                "id": cliente[0],
                "nombre": cliente[1],
                "user_id": user_id,
                "es_admin": es_admin,
                "peso": cliente[4] if len(cliente) > 4 else "--",
                "estatura": cliente[5] if len(cliente) > 5 else "--",
                "edad": cliente[6] if len(cliente) > 6 else "--"
            }
        }), 200
    else:
        return jsonify({"error": "Usuario o contraseña incorrectos"}), 401

# API: Eliminar cliente
@app.route('/api/clientes/<user_id>', methods=['DELETE'])
def eliminar_cliente(user_id):
    data = request.json
    if not data:
        return jsonify({"error": "Faltan credenciales de administrador"}), 400
        
    admin_user = data.get('admin_user')
    admin_pass = data.get('admin_pass')

    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    
    # Validar credenciales y permisos de admin
    try:
        cursor.execute("SELECT contrasena_hash, es_admin FROM clientes WHERE user_id=?", (admin_user,))
        admin_data = cursor.fetchone()
    except sqlite3.OperationalError:
        cursor.execute("SELECT contrasena_hash FROM clientes WHERE user_id=?", (admin_user,))
        admin_data = cursor.fetchone()
        if admin_data:
            admin_data = (admin_data[0], False)

    if not admin_data or not check_password_hash(admin_data[0], admin_pass) or not admin_data[1]:
        conn.close()
        return jsonify({"error": "Credenciales inválidas o no tienes permisos de administrador"}), 403

    # Si todo es correcto, eliminar
    cursor.execute("DELETE FROM clientes WHERE user_id=?", (user_id,))
    conn.commit()
    conn.close()
    return jsonify({"mensaje": "Cliente eliminado exitosamente"}), 200

# API: Cambiar contraseña (Admin)
@app.route('/api/admin/cambiar-password', methods=['PUT'])
def admin_cambiar_password():
    data = request.json
    user_id = data.get('user_id')
    nueva_contrasena = data.get('nueva_contrasena')
    admin_user = data.get('admin_user')
    admin_pass = data.get('admin_pass')

    if not all([user_id, nueva_contrasena, admin_user, admin_pass]):
        return jsonify({"error": "Faltan datos"}), 400

    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    
    # Validar admin
    try:
        cursor.execute("SELECT contrasena_hash, es_admin FROM clientes WHERE user_id=?", (admin_user,))
        admin_data = cursor.fetchone()
    except sqlite3.OperationalError:
        cursor.execute("SELECT contrasena_hash FROM clientes WHERE user_id=?", (admin_user,))
        admin_data = cursor.fetchone()
        if admin_data:
            admin_data = (admin_data[0], False)

    if not admin_data or not check_password_hash(admin_data[0], admin_pass) or not admin_data[1]:
        conn.close()
        return jsonify({"error": "Credenciales de administrador inválidas"}), 403

    hashed_pw = generate_password_hash(nueva_contrasena)
    cursor.execute("UPDATE clientes SET contrasena_hash=? WHERE user_id=?", (hashed_pw, user_id))
    conn.commit()
    conn.close()
    
    return jsonify({"mensaje": "Contraseña actualizada exitosamente"}), 200

# API: Cambiar contraseña (Cliente)
@app.route('/api/cliente/cambiar-password', methods=['PUT'])
def cliente_cambiar_password():
    data = request.json
    user_id = data.get('user_id')
    contrasena_actual = data.get('contrasena_actual')
    nueva_contrasena = data.get('nueva_contrasena')

    if not all([user_id, contrasena_actual, nueva_contrasena]):
        return jsonify({"error": "Faltan datos"}), 400

    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute("SELECT id, contrasena_hash FROM clientes WHERE user_id=?", (user_id,))
    cliente = cursor.fetchone()

    if not cliente or not check_password_hash(cliente[1], contrasena_actual):
        conn.close()
        return jsonify({"error": "Contraseña actual incorrecta"}), 401

    hashed_pw = generate_password_hash(nueva_contrasena)
    cursor.execute("UPDATE clientes SET contrasena_hash=? WHERE id=?", (hashed_pw, cliente[0]))
    conn.commit()
    conn.close()
    
    return jsonify({"mensaje": "Contraseña actualizada exitosamente"}), 200

# API: Obtener rutinas de cliente (Mesociclo)
@app.route('/api/cliente/<user_id>/rutinas', methods=['GET'])
def obtener_rutinas(user_id):
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM clientes WHERE user_id=?", (user_id,))
    cliente = cursor.fetchone()
    
    if not cliente:
        conn.close()
        return jsonify({"error": "Cliente no encontrado"}), 404
        
    cliente_id = cliente[0]
    # Ahora pedimos también id y notas_cliente
    cursor.execute("SELECT id, dia, ejercicios, notas_cliente FROM rutinas WHERE cliente_id=?", (cliente_id,))
    rutinas = cursor.fetchall()
    
    rutinas_format = [{"id": r[0], "dia": r[1], "ejercicios": r[2], "notas_cliente": r[3] or ""} for r in rutinas]
    conn.close()
    return jsonify(rutinas_format), 200

# API: Guardar progreso del cliente en una rutina
@app.route('/api/cliente/rutina/<int:rutina_id>', methods=['PUT'])
def guardar_progreso_rutina(rutina_id):
    data = request.json
    notas_cliente = data.get('notas_cliente', '')
    
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    
    # Validar que la rutina exista
    cursor.execute("SELECT id FROM rutinas WHERE id=?", (rutina_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({"error": "Rutina no encontrada"}), 404
        
    cursor.execute("UPDATE rutinas SET notas_cliente=? WHERE id=?", (notas_cliente, rutina_id))
    conn.commit()
    conn.close()
    
    return jsonify({"mensaje": "Progreso guardado exitosamente"}), 200

# API: Actualizar rutina de un cliente por fecha
@app.route('/api/admin/rutina', methods=['POST'])
def actualizar_rutina():
    data = request.json
    user_id = data.get('user_id')
    dia = data.get('dia') # Formato 'YYYY-MM-DD'
    ejercicios = data.get('ejercicios')
    
    if not all([str(user_id), dia, ejercicios is not None]):
        return jsonify({"error": "Faltan datos"}), 400
        
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()

    # Get cliente DB ID from user_id
    cursor.execute("SELECT id FROM clientes WHERE user_id=?", (str(user_id),))
    cliente = cursor.fetchone()
    if not cliente:
        conn.close()
        return jsonify({"error": "Cliente no encontrado"}), 404
        
    cliente_id = cliente[0]

    # Checar si ya existe rutina en ese día para ese cliente
    cursor.execute("SELECT id FROM rutinas WHERE cliente_id=? AND dia=?", (cliente_id, dia))
    rutina_existente = cursor.fetchone()
    
    if rutina_existente:
        # Actualizar
        if ejercicios.strip() == "":
            cursor.execute("DELETE FROM rutinas WHERE id=?", (rutina_existente[0],))
        else:
            cursor.execute("UPDATE rutinas SET ejercicios=? WHERE id=?", (ejercicios, rutina_existente[0]))
    else:
        # Insertar
        if ejercicios.strip() != "":
            cursor.execute("INSERT INTO rutinas (cliente_id, dia, ejercicios) VALUES (?, ?, ?)", (cliente_id, dia, ejercicios))
            
    conn.commit()
    conn.close()
    
    return jsonify({"mensaje": "Rutina guardada exitosamente"}), 200

if __name__ == '__main__':
    print("Servidor iniciado en http://localhost:5000")
    app.run(host='0.0.0.0', port=5000, debug=True)

