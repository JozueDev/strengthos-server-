import sqlite3
import os

DB_NAME = 'database.db'
if not os.path.exists(DB_NAME):
    if os.path.exists('/var/lib/data/database.db'):
        DB_NAME = "/var/lib/data/database.db"
    elif os.path.exists('/data/database.db'):
        DB_NAME = "/data/database.db"

conn = sqlite3.connect(DB_NAME)
cursor = conn.cursor()

target_user = '0001'
print(f"Checking data for user {target_user}...")

cursor.execute("SELECT peso, estatura, edad, grasa_corporal, objetivo, alergias, alimentos FROM clientes WHERE user_id=?", (target_user,))
row = cursor.fetchone()
print(f"Data: {row}")

conn.close()
