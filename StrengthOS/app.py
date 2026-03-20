import sqlite3
import os
import json
import datetime
import base64
import io
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
import time
import re
from google import genai
from PIL import Image

load_dotenv()

# Configuración de Gemini
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

if not GEMINI_API_KEY or GEMINI_API_KEY == "YOUR_API_KEY_HERE":
    print("[ADVERTENCIA] GEMINI_API_KEY no esta configurada correctamente en el archivo .env")
    client = None
else:
    try:
        # Deshabilitar reintentos internos del SDK (tenacity) para que
        # nuestro propio _gemini_generate maneje el fallback entre modelos
        client = genai.Client(
            api_key=GEMINI_API_KEY,
            http_options={"retry_config": {"retries": 0}}
        )
        model_name = 'gemini-2.5-flash'
        print(f"[OK] Gemini Client inicializado. Modelo primario: {model_name}")
    except Exception as e:
        # Si el http_options no es compatible con esta version del SDK, inicializar sin el
        try:
            client = genai.Client(api_key=GEMINI_API_KEY)
            print(f"[OK] Gemini Client inicializado (sin retry config)")
        except Exception as e2:
            print(f"[ERROR] Error al inicializar Gemini Client: {e2}")
            client = None

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

# ── Lista de modelos Gemini por prioridad (fallback automático) ───────────────
GEMINI_MODELS = [
    'gemini-2.5-flash',          # Primero: el que tiene cuota disponible
    'gemini-2.0-flash',          # Segundo: fallback estable
    'gemini-1.5-flash',          # Tercero: último recurso
]

# ── Helper: llamada a Gemini con fallback de modelos y reintentos ──────────────
def _gemini_generate(contents, max_retries=2, config=None):
    """Intenta generar con la lista GEMINI_MODELS en orden.
    
    - config: dict opcional con GenerateContentConfig (ej: safety_settings)
    - 503 UNAVAILABLE: pasa al siguiente modelo inmediatamente
    - 429 cuota agotada: pasa al siguiente modelo
    - 429 rate-limit temporal (retry hint): espera y reintenta
    - Otro error HTTP: propaga
    """
    if not client:
        raise RuntimeError("Configuracion de IA no disponible (falta GEMINI_API_KEY)")

    # Importar la clase de error del SDK para detectar correctamente
    try:
        from google.genai import errors as genai_errors
        _api_error_cls = genai_errors.APIError
    except ImportError:
        _api_error_cls = Exception  # fallback: atrapar cualquier excepcion

    for model_name in GEMINI_MODELS:
        for attempt in range(max_retries):
            try:
                print(f"[Gemini] Modelo: {model_name} | Intento {attempt + 1}/{max_retries}")
                kwargs = dict(model=model_name, contents=contents)
                if config:
                    kwargs['config'] = config
                response = client.models.generate_content(**kwargs)
                return response  # Exito

            except Exception as e:
                error_str   = str(e)
                # Obtener el codigo HTTP del SDK si está disponible
                status_code = getattr(e, 'status_code', None) or getattr(e, 'code', None)
                if status_code is None:
                    # Intentar parsear del string como último recurso
                    m = re.search(r'\b(4\d{2}|5\d{2})\b', error_str)
                    status_code = int(m.group(1)) if m else 0

                print(f"[Gemini] Error en {model_name}: HTTP {status_code} — {error_str[:200]}")

                # ── 503 / 502 Alta demanda o error temporal del servidor ────
                if status_code in (502, 503):
                    print(f"[Gemini] {model_name} no disponible ({status_code}). Probando siguiente modelo...")
                    time.sleep(2)
                    break  # Siguiente modelo

                # ── 429 Cuota / Rate limit ─────────────────────────────────
                elif status_code == 429 or 'RESOURCE_EXHAUSTED' in error_str:
                    retry_match = re.search(r'retry in (\d+(?:\.\d+)?)s', error_str, re.IGNORECASE)
                    is_quota_exhausted = (
                        'limit: 0' in error_str or
                        'free_tier' in error_str.lower() or
                        (not retry_match)
                    )
                    if is_quota_exhausted:
                        print(f"[Gemini] Cuota agotada para {model_name}. Probando siguiente modelo...")
                        break  # Siguiente modelo

                    wait_seconds = 35
                    if retry_match:
                        wait_seconds = min(float(retry_match.group(1)) + 3, 90)
                    if attempt < max_retries - 1:
                        print(f"[Gemini] Rate limit en {model_name}. Esperando {wait_seconds:.0f}s...")
                        time.sleep(wait_seconds)
                        continue
                    break  # Siguiente modelo

                # ── 403 API key inválida / revocada / filtrada ────────────
                elif status_code == 403 or 'PERMISSION_DENIED' in error_str or 'leaked' in error_str.lower():
                    raise RuntimeError(
                        "API_KEY_INVALID: La API key de Gemini fue revocada (detectada como filtrada en GitHub). "
                        "El administrador debe generar una nueva key en aistudio.google.com y actualizar el .env."
                    )

                # ── 401 No autenticado ─────────────────────────────────────
                elif status_code == 401 or 'UNAUTHENTICATED' in error_str:
                    raise RuntimeError(
                        "API_KEY_INVALID: La API key de Gemini no es válida o expiró. "
                        "Verifica el archivo .env y asegúrate de que GEMINI_API_KEY sea correcta."
                    )

                # ── 400 ClientError: solicitud inválida (imagen rechazada, safety filter, etc.) ──
                elif status_code == 400 or type(e).__name__ == 'ClientError':
                    # Detectar si es por filtro de seguridad
                    if any(kw in error_str.upper() for kw in ['SAFETY', 'BLOCKED', 'HARM', 'PROHIBITED']):
                        raise RuntimeError(
                            "IMAGE_BLOCKED: La imagen fue interceptada por el filtro de seguridad de la IA."
                        )
                    # Otro error 400 (formato, tamaño, etc.)
                    raise RuntimeError(
                        f"IMAGE_REJECTED: La IA no pudo procesar la imagen ({error_str[:120]}). "
                        "Intenta con una foto más clara y de menor tamaño (JPG/PNG, máx. 4MB)."
                    )

                # ── Otro error → propagar ──────────────────────────────────
                else:
                    raise

    raise RuntimeError(
        "RATE_LIMIT: Todos los modelos de IA estan ocupados. "
        "Por favor espera 1-2 minutos y vuelve a intentarlo."
    )



@app.after_request
def add_header(response):
    # Evitar que el navegador guarde en caché las respuestas de la API
    if request.path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, post-check=0, pre-check=0, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '-1'
    return response

# Configuración de base de datos persistente para Fly.io/Render
DB_PATH_ENV = os.environ.get('DB_PATH')
if DB_PATH_ENV:
    DB_NAME = DB_PATH_ENV
elif os.path.exists('/var/lib/data'):
    DB_NAME = "/var/lib/data/database.db"
elif os.path.exists('/data'):
    DB_NAME = "/data/database.db"
else:
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
            fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            peso TEXT DEFAULT '--',
            estatura TEXT DEFAULT '--',
            edad TEXT DEFAULT '--',
            grasa_corporal TEXT DEFAULT '--',
            objetivo TEXT DEFAULT '',
            alergias TEXT DEFAULT '',
            alimentos TEXT DEFAULT '',
            plan_nutricional TEXT DEFAULT ''
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

    cols_a_añadir = [
        ("peso", "TEXT DEFAULT '--'"),
        ("estatura", "TEXT DEFAULT '--'"),
        ("edad", "TEXT DEFAULT '--'"),
        ("grasa_corporal", "TEXT DEFAULT '--'"),
        ("objetivo", "TEXT DEFAULT ''"),
        ("alergias", "TEXT DEFAULT ''"),
        ("alimentos", "TEXT DEFAULT ''"),
        ("plan_nutricional", "TEXT DEFAULT ''"),
        ("json_meals_cache", "TEXT DEFAULT ''")
    ]
    
    for col_name, col_type in cols_a_añadir:
        try:
            cursor.execute(f"ALTER TABLE clientes ADD COLUMN {col_name} {col_type}")
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
            
    # Tabla de comidas diarias
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS comidas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            cliente_id INTEGER,
            dia TEXT,
            nombre TEXT,
            calorias INTEGER DEFAULT 0,
            proteinas REAL DEFAULT 0,
            carbohidratos REAL DEFAULT 0,
            grasas REAL DEFAULT 0,
            completado BOOLEAN DEFAULT 0,
            fuente TEXT DEFAULT 'manual',
            FOREIGN KEY(cliente_id) REFERENCES clientes(id)
        )
    ''')
    # Columnas de comidas que podrían faltar en BDs antiguas
    for col, typ in [
        ("fuente", "TEXT DEFAULT 'manual'"),
        ("user_id", "TEXT"),
        ("detalle", "TEXT DEFAULT '[]'")
    ]:
        try:
            cursor.execute(f"ALTER TABLE comidas ADD COLUMN {col} {typ}")
        except sqlite3.OperationalError:
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
    
    # Si no tiene extensión, intentar buscar .html (Ej: /dashboard -> /dashboard.html)
    if '.' not in path:
        if os.path.exists(os.path.join('.', path + '.html')):
            return send_from_directory('.', path + '.html')
    
    # Solo redirigir al index si es una navegación de página que no existe
    # o si es un archivo .html que no existe. Evitar colisionar con /api/
    if not path.startswith('api/'):
        if '.' not in path or path.endswith('.html'):
            return send_from_directory('.', 'index.html')
    
    return jsonify({"error": "No encontrado"}), 404

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

# ── API: SEGUIMIENTO DE COMIDAS ──────────────────────────────

@app.route('/api/comidas/<user_id>', methods=['GET'])
def obtener_comidas_dia(user_id):
    dia = request.args.get('dia') # YYYY-MM-DD
    if not dia:
        return jsonify({"error": "Falta la fecha"}), 400
        
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM clientes WHERE user_id=?", (user_id,))
    cliente = cursor.fetchone()
    if not cliente:
        conn.close()
        return jsonify({"error": "Cliente no encontrado"}), 404
        
    cursor.execute("""
        SELECT id, nombre, calorias, proteinas, carbohidratos, grasas, completado, COALESCE(detalle, '[]')
        FROM comidas
        WHERE (user_id=? OR cliente_id=?) AND dia=?
        ORDER BY id ASC
    """, (user_id, cliente[0], dia))
    rows = cursor.fetchall()
    def parse_detalle(raw):
        try: return json.loads(raw) if raw else []
        except: return []
    comidas = [
        {"id": r[0], "nombre": r[1], "calorias": r[2], "proteinas": r[3],
         "carbohidratos": r[4], "grasas": r[5], "completado": bool(r[6]),
         "ingredientes": parse_detalle(r[7])}
        for r in rows
    ]
    
    # También obtener objetivos nutricionales del perfil
    cursor.execute("SELECT objetivo FROM clientes WHERE id=?", (cliente[0],))
    objetivo = cursor.fetchone()[0]
    
    conn.close()
    return jsonify({"comidas": comidas, "objetivo": objetivo})

@app.route('/api/comidas', methods=['POST'])
def agregar_comida():
    data = request.json
    user_id = data.get('user_id')
    dia = data.get('dia')
    nombre = data.get('nombre')
    calorias = data.get('calorias', 0)
    proteinas = data.get('proteinas', 0)
    carbohidratos = data.get('carbohidratos', 0)
    grasas = data.get('grasas', 0)
    
    if not all([user_id, dia, nombre]):
        return jsonify({"error": "Faltan datos"}), 400
        
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM clientes WHERE user_id=?", (user_id,))
    cliente = cursor.fetchone()
    if not cliente:
        conn.close()
        return jsonify({"error": "No encontrado"}), 404
        
    cursor.execute("INSERT INTO comidas (cliente_id, dia, nombre, calorias, proteinas, carbohidratos, grasas) VALUES (?, ?, ?, ?, ?, ?, ?)",
                   (cliente[0], dia, nombre, calorias, proteinas, carbohidratos, grasas))
    conn.commit()
    conn.close()
    return jsonify({"mensaje": "Comida agregada"}), 201

@app.route('/api/comidas/<int:comida_id>/toggle', methods=['PUT'])
def toggle_comida(comida_id):
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute("UPDATE comidas SET completado = NOT completado WHERE id=?", (comida_id,))
    conn.commit()
    conn.close()
    return jsonify({"mensaje": "Estado actualizado"}), 200

@app.route('/api/comidas/<int:comida_id>', methods=['DELETE'])
def eliminar_comida(comida_id):
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM comidas WHERE id=?", (comida_id,))
    conn.commit()
    conn.close()
    return jsonify({"mensaje": "Comida eliminada"}), 200

@app.route('/api/comidas/<int:comida_id>', methods=['PUT'])
def actualizar_comida(comida_id):
    data = request.json
    nombre = data.get('nombre')
    calorias = data.get('calorias', 0)
    proteinas = data.get('proteinas', 0)
    carbohidratos = data.get('carbohidratos', 0)
    grasas = data.get('grasas', 0)
    
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute("UPDATE comidas SET nombre=?, calorias=?, proteinas=?, carbohidratos=?, grasas=? WHERE id=?",
                   (nombre, calorias, proteinas, carbohidratos, grasas, comida_id))
    conn.commit()
    conn.close()
    return jsonify({"mensaje": "Comida actualizada"}), 200

@app.route('/api/nutricion/<user_id>/plan', methods=['PUT'])
def guardar_plan_manual(user_id):
    data = request.json
    plan = data.get('plan')
    if plan is None:
        return jsonify({"error": "No se proporcionó un plan"}), 400
        
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    
    if plan == "":
        # Si se borra el plan, también limpiamos los metadatos asociados para un reset total
        cursor.execute("UPDATE clientes SET plan_nutricional='', objetivo='', alergias='', alimentos='' WHERE user_id=?", (user_id,))
    else:
        cursor.execute("UPDATE clientes SET plan_nutricional=? WHERE user_id=?", (plan, user_id))
    
    # Si el plan se está borrando (es vacío), también borramos las comidas programadas
    # para que el dashboard del cliente se limpie totalmente.
    if plan == "":
        try:
            # Obtener el ID interno del cliente primero
            cursor.execute("SELECT id FROM clientes WHERE user_id=?", (user_id,))
            cliente_row = cursor.fetchone()
            if cliente_row:
                cursor.execute("DELETE FROM comidas WHERE cliente_id=?", (cliente_row[0],))
        except Exception as e:
            print(f"Error al limpiar comidas: {e}")

    conn.commit()
    conn.close()
    return jsonify({"mensaje": "Plan actualizado correctamente"})

# API: Actualizar perfil de cliente
@app.route('/api/cliente/<user_id>/perfil', methods=['PUT'])
def actualizar_perfil(user_id):
    data = request.json
    peso           = data.get('peso', '').strip()
    estatura       = data.get('estatura', '').strip()
    edad           = data.get('edad', '').strip()
    grasa_corporal = data.get('grasa_corporal', '').strip()

    # Solo actualizar campos que realmente se enviaron (no vacíos)
    campos = {}
    if peso:           campos['peso']           = peso
    if estatura:       campos['estatura']       = estatura
    if edad:           campos['edad']           = edad
    if grasa_corporal: campos['grasa_corporal'] = grasa_corporal

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
        cursor.execute("SELECT id, user_id, nombre, fecha_registro, peso, estatura, edad, grasa_corporal FROM clientes WHERE user_id=?", (user_id,))
        row = cursor.fetchone()
        if row:
            cliente = {
                "id": row[0], "user_id": row[1], "nombre": row[2], "fecha_registro": row[3], 
                "peso": row[4], "estatura": row[5], "edad": row[6], "grasa_corporal": row[7]
            }
        else:
            conn.close()
            return jsonify({"error": "No encontrado"}), 404
    except sqlite3.OperationalError:
        cursor.execute("SELECT id, user_id, nombre, fecha_registro, peso, estatura, edad FROM clientes WHERE user_id=?", (user_id,))
        row = cursor.fetchone()
        if row:
            cliente = {
                "id": row[0], "user_id": row[1], "nombre": row[2], "fecha_registro": row[3], 
                "peso": row[4], "estatura": row[5], "edad": row[6], "grasa_corporal": "--"
            }
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
        cursor.execute("SELECT id, nombre, contrasena_hash, es_admin, peso, estatura, edad, grasa_corporal FROM clientes WHERE user_id=?", (user_id,))
        cliente = cursor.fetchone()
    except sqlite3.OperationalError:
        try:
            cursor.execute("SELECT id, nombre, contrasena_hash, es_admin, peso, estatura, edad FROM clientes WHERE user_id=?", (user_id,))
            cliente = cursor.fetchone()
            if cliente:
                cliente = (cliente[0], cliente[1], cliente[2], cliente[3], cliente[4], cliente[5], cliente[6], "--")
        except sqlite3.OperationalError:
            cursor.execute("SELECT id, nombre, contrasena_hash, es_admin FROM clientes WHERE user_id=?", (user_id,))
            cliente = cursor.fetchone()
            if cliente:
                cliente = (cliente[0], cliente[1], cliente[2], cliente[3], "--", "--", "--", "--")
            
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
                "edad": cliente[6] if len(cliente) > 6 else "--",
                "grasa_corporal": cliente[7] if len(cliente) > 7 else "--"
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

# ── SECCIÓN DE NUTRICIÓN CON IA ─────────────────────────────

@app.route('/api/nutricion/estimar-grasa', methods=['POST'])
def estimar_grasa():
    if not client:
        return jsonify({"error": "Configuración de IA no disponible (falta GEMINI_API_KEY)"}), 503
    
    # ── Soporte para múltiples vistas (Frente, Lado, Espalda) ──────────────────
    vistas = {
        "frente": request.files.get('foto_frente'),
        "lado":   request.files.get('foto_lado'),
        "espalda": request.files.get('foto_espalda')
    }
    
    # Si no vienen vistas específicas, intentar con el campo 'foto' antiguo
    if not any(vistas.values()):
        if 'foto' in request.files:
            vistas["frente"] = request.files['foto']
        else:
            return jsonify({"error": "No se recibió ninguna imagen. Sube al menos una foto (frente, lado o espalda)."}), 400
    
    # Procesar imágenes válidas
    gemini_payload = []
    vistas_validas = []
    
    for nombre_vista, file in vistas.items():
        if file:
            try:
                img = Image.open(file.stream)
                img.load()
                gemini_payload.append(img)
                vistas_validas.append(nombre_vista)
            except Exception as e:
                print(f"[estimar_grasa] Error al procesar vista {nombre_vista}: {e}")
                # Si es una sola imagen y falla, error. Si son varias, intentamos seguir con las que sirvan.
                if len(vistas) == 1:
                    return jsonify({"error": "La imagen enviada no es válida o está corrupta."}), 400

    if not gemini_payload:
        return jsonify({"error": "No se pudo procesar ninguna de las imágenes enviadas."}), 400

    # ── Prompt clínico actualizado para múltiples vistas ─────────────────────
    prompt = f"""CONTEXTO CLINICO: Eres un sistema de inteligencia artificial especializado en
    evaluacion de composicion corporal para uso en centros de entrenamiento deportivo y clinicas
    de nutricion. Esta solicitud proviene de un profesional certificado en fitness.

    TAREA: Realizar una evaluacion visual de composicion corporal (porcentaje de grasa)
    basada en indicadores morfologicos externos. 
    
    ESTADO ACTUAL: Se proporcionan {len(gemini_payload)} imagenes correspondientes a las vistas: {', '.join(vistas_validas)}.
    Utiliza todas las perspectivas disponibles para triangular una estimacion mas precisa.

    METODOLOGIA DE EVALUACION CLINICA:
    1. Distribucion de tejido adiposo subcutaneo (region abdominal, lumbar, escapular, tricipital, suprailiaca).
    2. Grado de definicion del tejido muscular esqueletico visible en diferentes planos.
    3. Patron de distribucion de grasa corporal: androide vs ginecoide.
    4. Clasificacion somatotipica aparente (ectomorfo, mesomorfo, endomorfo).
    5. Proporcion de masa magra estimada vs tejido adiposo total.

    ESCALA DE REFERENCIA (ACSM/NSCA):
    - 5-9%: Competicion (hipertrofia extrema, vascularizacion abdominal visible).
    - 10-14%: Atletico (definicion abdominal clara, separacion muscular evidente).
    - 15-19%: Fitness (leve relieve abdominal, buena tonicidad general).
    - 20-24%: Promedio (adiposidad abdominal moderada, sin definicion visible).
    - 25-29%: Por encima del promedio (adiposidad visible en tronco y extremidades).
    - 30%+: Sobrepeso/obesidad leve (adiposidad generalizada).

    INSTRUCCIONES:
    - Cruza los datos de todas las fotos (ej: pliegue lumbar en foto de espalda + abdomen en frente).
    - Proporciona un rango realista basado en indicadores visuales objetivos.
    - Menciona los marcadores anatomicos especificos observados en las distintas vistas.
    - Tono profesional, objetivo e instructivo.
    - Responde en espanol.

    Responde UNICAMENTE en formato JSON valido (sin bloques de codigo markdown, sin texto adicional):
    {{"porcentaje": "XX-XX%", "explicacion": "Analisis morfologico cruzado basado en las vistas proporcionadas y recomendacion profesional"}}
    """

    # ── Config con safety_settings permisivos para uso clínico ───────────────
    try:
        from google.genai import types as genai_types
        safety_cfg = [
            genai_types.SafetySetting(category='HARM_CATEGORY_HARASSMENT', threshold='BLOCK_NONE'),
            genai_types.SafetySetting(category='HARM_CATEGORY_HATE_SPEECH', threshold='BLOCK_NONE'),
            genai_types.SafetySetting(category='HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold='BLOCK_ONLY_HIGH'),
            genai_types.SafetySetting(category='HARM_CATEGORY_DANGEROUS_CONTENT', threshold='BLOCK_NONE'),
        ]
        gemini_config = genai_types.GenerateContentConfig(safety_settings=safety_cfg)
    except Exception:
        gemini_config = None

    try:
        # Enviar el prompt seguido de todas las imágenes
        response = _gemini_generate([prompt] + gemini_payload, config=gemini_config)

        # Verificar si la respuesta fue bloqueada aunque no lanzó excepción
        # (el SDK a veces devuelve finish_reason=SAFETY sin lanzar error)
        if hasattr(response, 'candidates') and response.candidates:
            candidate = response.candidates[0]
            finish_reason = getattr(candidate, 'finish_reason', None)
            finish_reason_str = str(finish_reason).upper() if finish_reason else ''
            if 'SAFETY' in finish_reason_str or 'BLOCKED' in finish_reason_str:
                print(f"[estimar_grasa] Respuesta bloqueada silenciosamente: finish_reason={finish_reason}")
                return jsonify({"bloqueada": True}), 200

        text = response.text.strip()
        
        # Limpiar bloques de código Markdown si la IA los incluye
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()
        
        start = text.find('{')
        end = text.rfind('}') + 1
        if start != -1 and end > start:
            try:
                result = json.loads(text[start:end])
                if "porcentaje" not in result:
                    result["porcentaje"] = "No determinado"
                return jsonify(result)
            except json.JSONDecodeError as je:
                print(f"[estimar_grasa] JSON inválido: {je} — texto: {text[:200]}")
                return jsonify({"porcentaje": "Desconocido", "explicacion": text})
        
        print(f"[estimar_grasa] Sin JSON en respuesta: {text[:200]}")
        return jsonify({"porcentaje": "Desconocido", "explicacion": text})

    except RuntimeError as e:
        error_msg = str(e)
        if 'IMAGE_BLOCKED' in error_msg:
            # Señal especial para que el frontend active el fallback por medidas
            print(f"[estimar_grasa] Imagen bloqueada — activando fallback.")
            return jsonify({"bloqueada": True}), 200
        
        if 'IMAGE_REJECTED' in error_msg:
            friendly = error_msg.split(": ", 1)[1] if ": " in error_msg else error_msg
            return jsonify({"error": friendly}), 400

        if 'API_KEY_INVALID' in error_msg:
            friendly = error_msg.split(": ", 1)[1] if ": " in error_msg else error_msg
            return jsonify({"error": friendly, "leaked": True}), 403

        return jsonify({"error": error_msg}), 429

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Error inesperado: {type(e).__name__}: {str(e)[:100]}"}), 500


@app.route('/api/nutricion/estimar-grasa-formula', methods=['POST'])
def estimar_grasa_formula():
    """Calcula el % de grasa corporal usando la fórmula de la Marina de EE.UU. (Navy Method)
    como alternativa cuando la foto es bloqueada por el filtro de seguridad de la IA.
    
    Body:  { sexo, cintura, cuello, cadera (mujeres), estatura }  — todos en cm
           { peso } — en kg (para el BMI como alternativa si faltan medidas)
    """
    data = request.json or {}
    sexo     = (data.get('sexo') or 'masculino').lower().strip()
    peso     = float(data.get('peso') or 0)
    estatura = float(data.get('estatura') or 0)
    cintura  = float(data.get('cintura') or 0)
    cuello   = float(data.get('cuello') or 0)
    cadera   = float(data.get('cadera') or 0)

    import math

    def navy_hombre(cintura_cm, cuello_cm, estatura_cm):
        """US Navy Method para hombres."""
        if estatura_cm <= 0 or cintura_cm <= cuello_cm:
            return None
        bf = 495 / (1.0324 - 0.19077 * math.log10(cintura_cm - cuello_cm) + 0.15456 * math.log10(estatura_cm)) - 450
        return round(max(1.0, min(bf, 50.0)), 1)

    def navy_mujer(cintura_cm, cuello_cm, cadera_cm, estatura_cm):
        """US Navy Method para mujeres."""
        if estatura_cm <= 0 or (cintura_cm + cadera_cm) <= cuello_cm:
            return None
        bf = 495 / (1.29579 - 0.35004 * math.log10(cintura_cm + cadera_cm - cuello_cm) + 0.22100 * math.log10(estatura_cm)) - 450
        return round(max(1.0, min(bf, 60.0)), 1)

    def bmi_formula(peso_kg, estatura_cm, sexo):
        """Estimación básica por BMI (Deurenberg) como último recurso."""
        if peso_kg <= 0 or estatura_cm <= 0:
            return None
        h = estatura_cm / 100.0
        bmi = peso_kg / (h * h)
        edad_default = 30
        sex_factor = 1 if sexo == 'masculino' else 0
        bf = (1.20 * bmi) + (0.23 * edad_default) - (10.8 * sex_factor) - 5.4
        return round(max(1.0, min(bf, 60.0)), 1)

    resultado = None
    metodo_usado = ''

    # 1. Intentar Navy Method (más preciso)
    if sexo in ('masculino', 'hombre', 'male', 'm'):
        if cintura > 0 and cuello > 0 and estatura > 0:
            resultado = navy_hombre(cintura, cuello, estatura)
            metodo_usado = 'Navy Method (Hombres)'
    else:
        if cintura > 0 and cuello > 0 and cadera > 0 and estatura > 0:
            resultado = navy_mujer(cintura, cuello, cadera, estatura)
            metodo_usado = 'Navy Method (Mujeres)'

    # 2. Fallback: BMI Formula
    if resultado is None:
        resultado = bmi_formula(peso, estatura, sexo)
        metodo_usado = 'Estimación por IMC (Deurenberg)'

    if resultado is None:
        return jsonify({"error": "Faltan datos para calcular. Ingresa estatura y peso mínimo."}), 400

    # Clasificación
    if sexo in ('masculino', 'hombre', 'male', 'm'):
        if resultado < 10:    clasificacion = 'Competición'
        elif resultado < 15:  clasificacion = 'Atlético'
        elif resultado < 20:  clasificacion = 'Fitness'
        elif resultado < 25:  clasificacion = 'Promedio'
        elif resultado < 30:  clasificacion = 'Por encima del promedio'
        else:                 clasificacion = 'Obesidad leve'
    else:
        if resultado < 16:    clasificacion = 'Competición'
        elif resultado < 21:  clasificacion = 'Atlético'
        elif resultado < 25:  clasificacion = 'Fitness'
        elif resultado < 31:  clasificacion = 'Promedio'
        elif resultado < 36:  clasificacion = 'Por encima del promedio'
        else:                 clasificacion = 'Obesidad leve'

    return jsonify({
        "porcentaje": f"{resultado}%",
        "clasificacion": clasificacion,
        "metodo": metodo_usado,
        "explicacion": (
            f"Estimación calculada con {metodo_usado}. "
            f"Clasificación: {clasificacion}. "
            "Para mayor precisión, realiza una medición DEXA o hidrostática."
        )
    })

@app.route('/api/nutricion/analizar-comida', methods=['POST'])
def analizar_comida_ia():
    if not client:
        return jsonify({"error": "Configuración de IA no disponible"}), 503
        
    if 'foto' not in request.files:
        return jsonify({"error": "No se subió ninguna imagen"}), 400
        
    file = request.files['foto']
    img = Image.open(file.stream)

    prompt = """
    Eres un nutricionista deportivo certificado con especializacion en analisis de alimentos.
    Analiza esta imagen de comida con precision profesional.

    PROCESO DE ANALISIS:
    1. Identifica TODOS los alimentos visibles en el plato
    2. Estima las porciones por volumen visual y tamano relativo
    3. Aplica la base de datos nutricional USDA/FoodData Central para los calculos
    4. Suma los macros de cada componente
    5. Ajusta por metodo de coccion visible (frito, hervido, al horno, etc.)

    CRITERIOS DE ESTIMACION:
    - Se conservador en las porciones cuando hay duda
    - Los platos tipicos caseros: 300-500 kcal
    - Platos de restaurante: pueden ser 600-1200 kcal
    - Identifica salsas, aceites y aderezos que elevan significativamente las calorias

    CALIDAD NUTRICIONAL:
    Evalua del 1-10 la calidad nutricional del plato (10 = muy saludable, balanceado)

    Responde UNICAMENTE en formato JSON:
    {
      "nombre": "Nombre descriptivo y apetitoso del plato identificado",
      "calorias": 0,
      "proteinas": 0,
      "carbohidratos": 0,
      "grasas": 0,
      "fibra": 0,
      "calidad": 7,
      "explicacion": "Lista de alimentos identificados con sus porciones estimadas y nota sobre la calidad nutricional"
    }
    """

    try:
        response = _gemini_generate([prompt, img])
        text = response.text
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "{" in text:
            text = text[text.find("{"):text.rfind("}")+1]
            
        result = json.loads(text)
        return jsonify(result)
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 429
    except Exception as e:
        return jsonify({"error": "Error inesperado al analizar la comida."}), 500

@app.route('/api/nutricion/chat', methods=['POST'])
def chat_nutricion():
    if not client:
        return jsonify({"error": "Configuración de IA no disponible"}), 503
    
    data = request.json
    user_id = data.get('user_id')
    mensaje_usuario = data.get('mensaje')
    plan_actual = data.get('plan_actual')
    
    # Obtener contexto del usuario
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute("SELECT peso, estatura, edad, grasa_corporal, objetivo, alergias, alimentos FROM clientes WHERE user_id=?", (user_id,))
    user_context = cursor.fetchone()
    conn.close()

    if not user_context:
        return jsonify({"error": "Usuario no encontrado"}), 404

    # Calcular IMC para dar contexto al agente
    try:
        imc = float(user_context[0]) / ((float(user_context[1]) / 100) ** 2)
        imc_str = f"{imc:.1f}"
    except Exception:
        imc_str = "no calculado"

    contexto_str = f"""
    == PERFIL COMPLETO DEL ATLETA ==
    - Peso actual: {user_context[0]} kg
    - Estatura: {user_context[1]} cm
    - Edad: {user_context[2]} anos
    - % Grasa corporal estimado: {user_context[3]}
    - IMC calculado: {imc_str}
    - Objetivo principal: {user_context[4]}
    - Alergias / intolerancias (NO incluir): {user_context[5] or 'Ninguna reportada'}
    - Alimentos preferidos / disponibles: {user_context[6] or 'Sin restriccion'}
    """

    prompt = f"""
    Eres NutriCoach Pro, agente de nutricion deportiva de alto rendimiento de StrengthOS.

    {contexto_str}

    == PLAN NUTRICIONAL ACTUAL ==
    {plan_actual}
    == FIN DEL PLAN ==

    == SOLICITUD DEL ENTRENADOR ==
    "{mensaje_usuario}"

    == TUS RESPONSABILIDADES ==
    1. ANALIZA la solicitud: cambio de alimento, ajuste de macros, pregunta nutricional o variedad.
    2. CAMBIO DE ALIMENTO: sustituye manteniendo macros equivalentes. Explica el equivalente nutricional.
    3. PREGUNTA NUTRICIONAL: responde con informacion cientifica concisa.
    4. AJUSTE DE OBJETIVO: recalcula TMB/TDEE y ajusta deficit/superavit.
    5. Mantén el equilibrio calorico a menos que se pida cambiarlo.
    6. NUNCA elimines comidas, solo modifica lo necesario.

    == FORMATO OBLIGATORIO DE RESPUESTA ==
    1. Bloque de explicacion breve (2-3 lineas en cursiva con *texto*).
    2. El PLAN COMPLETO ACTUALIZADO usando tablas Markdown:

    | Hora y Comida | Alimentos y Porciones (gramos) | Proteina | Carbos | Grasas | Kcal |
    |:-------------:|:-------------------------------|:--------:|:------:|:------:|:----:|
    | 7:00am - Desayuno | Alimento: Xg | Xg | Xg | Xg | X |
    | ... | ... | ... | ... | ... | ... |
    | **TOTALES** | | **Xg** | **Xg** | **Xg** | **X** |

    3. Al final: el bloque <json_meals> con TODAS las comidas actualizadas.

    Reglas de tabla:
    - Columnas numericas alineadas a la derecha ( ---: )
    - Columnas de texto alineadas a la izquierda ( :--- )
    - Columnas de cabecera centradas ( :---: )

    Responde en espanol. Tono: coach de alto rendimiento, directo y motivador.

    IMPORTANTE - bloque <json_meals>:
    <json_meals>
    [
      {{"nombre": "7:00am - Desayuno: ...", "calorias": 0, "proteinas": 0, "carbohidratos": 0, "grasas": 0}},
      ...
    ]
    </json_meals>
    """

    try:
        response = _gemini_generate(prompt)
        text_response = response.text
        
        plan = text_response
        meals_json_str = ""
        
        start_tag = "<json_meals>"
        end_tag = "</json_meals>"
        if start_tag in text_response and end_tag in text_response:
            plan = text_response.split(start_tag)[0].strip()
            meals_json_str = text_response.split(start_tag)[1].split(end_tag)[0].strip()

        # Actualizar el plan en la BD
        conn = sqlite3.connect(DB_NAME)
        cursor = conn.cursor()
        cursor.execute("UPDATE clientes SET plan_nutricional=? WHERE user_id=?", (plan, user_id))
        conn.commit()
        conn.close()

        return jsonify({"plan": plan, "meals_json": meals_json_str})
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 429
    except Exception as e:
        return jsonify({"error": "Error inesperado al modificar el plan."}), 500

@app.route('/api/nutricion/generar', methods=['POST'])
def generar_plan_nutricion():
    if not client:
        return jsonify({"error": "Configuración de IA no disponible (falta GEMINI_API_KEY)"}), 503
    
    data = request.json
    peso = data.get('peso')
    estatura = data.get('estatura')
    edad = data.get('edad')
    grasa = data.get('grasa_corporal')
    objetivo = data.get('objetivo')
    alergias = data.get('alergias', 'Ninguna')
    alimentos = data.get('alimentos', 'No especificado')
    user_id = data.get('user_id')

    prompt = f"""
    Eres NutriCoach Pro, el agente de inteligencia artificial de StrengthOS especializado en
    nutricion deportiva de alto rendimiento. Combinas el conocimiento de:
    - Dietista-Nutricionista Deportivo certificado (ISSN, NSCA)
    - Coach de composicion corporal
    - Fisiologo del ejercicio

    == DATOS DEL ATLETA ==
    - Peso: {peso} kg | Estatura: {estatura} cm | Edad: {edad} anos | % Grasa: {grasa}
    - Objetivo: {objetivo}
    - ALERGIAS (EXCLUIR ABSOLUTAMENTE): {alergias}
    - Alimentos preferidos / disponibles: {alimentos}

    == PASO 1: CALCULOS FISIOLOGICOS ==
    Calcula y muestra en una tabla Markdown:
    a) TMB (Mifflin-St Jeor)
    b) TDEE segun nivel de actividad moderado-alto
    c) Calorias objetivo ajustadas segun meta
    d) Distribucion de macros diarios (g y % del total)

    FORMATO OBLIGATORIO para los calculos (tabla Markdown):
    | Metrica | Valor |
    |:--------|------:|
    | TMB     | X kcal |
    | TDEE    | X kcal |
    | Objetivo calorico | X kcal |
    | Proteina objetivo | Xg (X%) |
    | Carbohidratos objetivo | Xg (X%) |
    | Grasas objetivo | Xg (X%) |

    == PASO 2: PLAN ALIMENTICIO DIARIO ==
    Crea el plan en una tabla Markdown con EXACTAMENTE estas columnas centradas:

    | Hora y Comida | Alimentos y Porciones (gramos) | Proteina | Carbos | Grasas | Kcal |
    |:-------------:|:-------------------------------|:--------:|:------:|:------:|:----:|

    REGLAS DEL PLAN:
    - 4 a 6 comidas con hora especifica (7:00am, 10:00am, etc.)
    - Nombre de cada alimento con su porcion en gramos
    - Valores de macros por fila en formato: 35g / 52g / 14g / 493
    - Distribuye proteina uniformemente (30-40g por comida)
    - Carbohidratos altos antes y despues del entrenamiento
    - Ultima comida: alta en proteina de digestion lenta
    - RESPETA ABSOLUTAMENTE las alergias
    - Fila final de TOTALES del dia

    == PASO 3: ESTRATEGIAS ==
    Presenta en subtablas separadas:

    ### Timing Nutricional
    | Momento | Que comer | Por que |
    |:-------:|:----------|:-------|

    ### Hidratacion y Suplementacion
    | Suplemento/Hidratacion | Dosis | Momento | Evidencia |
    |:----------------------:|:-----:|:-------:|:---------:|

    == PASO 4: INDICADORES DE PROGRESO ==
    Tabla con 3 metricas clave:
    | Metrica | Frecuencia | Como medirla |
    |:-------:|:----------:|:------------:|

    == REGLAS DE FORMATO ESTRICTAS ==
    - USA TABLAS MARKDOWN para TODA la informacion estructurada.
    - Alinea columnas numericas a la derecha ( ---: )
    - Alinea columnas de texto a la izquierda ( :--- )
    - Columnas de titulo/categoria al centro ( :---: )
    - Usa ## para titulos de seccion y ### para subsecciones.
    - Agrega emojis al inicio de cada ## titulo para identificar secciones.
    - Tono: Coach de alto rendimiento. Responde en ESPANOL.
    - NO uses listas de puntos para informacion que cabe en tabla.

    OBLIGATORIO AL FINAL: bloque <json_meals> con todas las comidas.
    Incluye un campo "ingredientes" con la lista EXACTA de alimentos y cantidades.
    <json_meals>
    [
      {{
        "nombre": "7:00am - Desayuno: Avena con huevos y platano",
        "calorias": 520, "proteinas": 35, "carbohidratos": 58, "grasas": 14,
        "ingredientes": ["80g avena en hojuelas", "4 huevos enteros", "2 claras de huevo", "1 platano mediano (100g)", "10ml aceite de oliva"]
      }},
      {{
        "nombre": "10:00am - Snack: Yogur con frutos secos",
        "calorias": 220, "proteinas": 18, "carbohidratos": 15, "grasas": 10,
        "ingredientes": ["200g yogur griego 0%", "30g nueces mixtas", "1 cucharada miel"]
      }}
    ]
    </json_meals>
    """

    try:
        response = _gemini_generate(prompt)
        text_response = response.text
        
        # Separar el plan (Markdown) del JSON
        plan = text_response
        meals_json_str = ""
        
        start_tag = "<json_meals>"
        end_tag = "</json_meals>"
        if start_tag in text_response and end_tag in text_response:
            plan = text_response.split(start_tag)[0].strip()
            meals_json_str = text_response.split(start_tag)[1].split(end_tag)[0].strip()

        # Guardar en la base de datos si se proporciona user_id
        if user_id:
            conn = sqlite3.connect(DB_NAME)
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE clientes SET peso=?, estatura=?, edad=?, grasa_corporal=?, objetivo=?, alergias=?, alimentos=?, plan_nutricional=?, json_meals_cache=? WHERE user_id=?",
                (peso, estatura, edad, grasa, objetivo, alergias, alimentos, plan, meals_json_str, user_id)
            )
            conn.commit()
            conn.close()

        return jsonify({"plan": plan, "meals_json": meals_json_str})
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 429
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Error al generar el plan: {type(e).__name__}: {str(e)}"}), 500

@app.route('/api/nutricion/<user_id>', methods=['GET'])
def obtener_nutricion(user_id):
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute("SELECT peso, estatura, edad, grasa_corporal, objetivo, alimentos, plan_nutricional, alergias FROM clientes WHERE user_id=?", (user_id,))
    row = cursor.fetchone()
    conn.close()
    
    if row:
        return jsonify({
            "peso": row[0],
            "estatura": row[1],
            "edad": row[2],
            "grasa_corporal": row[3],
            "objetivo": row[4],
            "alimentos": row[5],
            "plan_nutricional": row[6],
            "alergias": row[7] or ""
        })
    return jsonify({"error": "No encontrado"}), 404

@app.route('/api/nutricion/<user_id>/enviar-dia', methods=['POST'])
def enviar_plan_dia(user_id):
    """
    El admin llama a este endpoint para copiar las comidas del plan JSON guardado
    a la tabla de comidas de HOY para ese usuario (limpia primero las del día).
    """
    hoy = datetime.date.today().isoformat()

    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()

    # Obtener las comidas guardadas en JSON del plan (columna json_meals_cache)
    cursor.execute("SELECT json_meals_cache FROM clientes WHERE user_id=?", (user_id,))
    row = cursor.fetchone()

    if not row or not row[0]:
        conn.close()
        return jsonify({"error": "No hay comidas de plan guardadas. Genera el plan primero."}), 404

    try:
        meals = json.loads(row[0])
    except json.JSONDecodeError:
        conn.close()
        return jsonify({"error": "El plan guardado tiene formato incorrecto."}), 400

    # Borrar las comidas de HOY para este usuario (las del plan, no manuales)
    cursor.execute(
        "DELETE FROM comidas WHERE user_id=? AND dia=? AND fuente='plan'",
        (user_id, hoy)
    )

    # Insertar cada comida del plan como nueva entrada de hoy
    insertadas = 0
    for meal in meals:
        nombre        = meal.get('nombre', 'Comida')
        calorias      = int(meal.get('calorias', 0))
        proteinas     = int(meal.get('proteinas', 0))
        carbohidratos = int(meal.get('carbohidratos', 0))
        grasas        = int(meal.get('grasas', 0))
        ingredientes  = json.dumps(meal.get('ingredientes', []), ensure_ascii=False)
        cursor.execute(
            "INSERT INTO comidas (user_id, dia, nombre, calorias, proteinas, carbohidratos, grasas, completado, fuente, detalle) VALUES (?,?,?,?,?,?,?,0,'plan',?)",
            (user_id, hoy, nombre, calorias, proteinas, carbohidratos, grasas, ingredientes)
        )
        insertadas += 1

    conn.commit()
    conn.close()

    return jsonify({"mensaje": "Plan enviado correctamente", "comidas_enviadas": insertadas, "dia": hoy})


@app.route('/api/nutricion/<user_id>/enviar-rango', methods=['POST'])
def enviar_plan_rango(user_id):
    """
    Envía el plan guardado para los próximos N días.
    Body JSON: { "dias": 7 }
    """
    data = request.json or {}
    dias = max(1, min(int(data.get('dias', 7)), 30))  # entre 1 y 30

    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()

    # Obtener las comidas del plan guardado
    cursor.execute("SELECT json_meals_cache FROM clientes WHERE user_id=?", (user_id,))
    row = cursor.fetchone()

    if not row or not row[0]:
        conn.close()
        return jsonify({"error": "No hay comidas de plan guardadas. Genera el plan primero."}), 404

    try:
        meals = json.loads(row[0])
    except json.JSONDecodeError:
        conn.close()
        return jsonify({"error": "El plan guardado tiene formato incorrecto."}), 400

    hoy      = datetime.date.today()
    total    = 0
    enviados = 0

    for offset in range(dias):
        dia_str = (hoy + datetime.timedelta(days=offset)).isoformat()

        # Borrar comidas de tipo 'plan' de ese día
        cursor.execute(
            "DELETE FROM comidas WHERE user_id=? AND dia=? AND fuente='plan'",
            (user_id, dia_str)
        )

        # Insertar cada comida
        for meal in meals:
            nombre        = meal.get('nombre', 'Comida')
            calorias      = int(meal.get('calorias', 0))
            proteinas     = int(meal.get('proteinas', 0))
            carbohidratos = int(meal.get('carbohidratos', 0))
            grasas        = int(meal.get('grasas', 0))
            ingredientes  = json.dumps(meal.get('ingredientes', []), ensure_ascii=False)
            cursor.execute(
                "INSERT INTO comidas (user_id, dia, nombre, calorias, proteinas, carbohidratos, grasas, completado, fuente, detalle) VALUES (?,?,?,?,?,?,?,0,'plan',?)",
                (user_id, dia_str, nombre, calorias, proteinas, carbohidratos, grasas, ingredientes)
            )
            total += 1
        enviados += 1

    conn.commit()
    conn.close()

    return jsonify({
        "mensaje": f"Plan enviado para {enviados} días",
        "dias_enviados": enviados,
        "total_comidas": total,
        "desde": hoy.isoformat(),
        "hasta": (hoy + datetime.timedelta(days=dias - 1)).isoformat()
    })


if __name__ == '__main__':
    # Usar puerto de sistema (Fly.io/Render) o 5000 por defecto
    port = int(os.environ.get('PORT', 5000))
    print(f"Servidor iniciado en el puerto {port}")
    app.run(host='0.0.0.0', port=port, debug=True)


