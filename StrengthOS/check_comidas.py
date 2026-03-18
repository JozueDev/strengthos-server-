import sqlite3
conn = sqlite3.connect('database.db')
c = conn.cursor()

# Ver columnas de la tabla comidas
c.execute("PRAGMA table_info(comidas)")
cols = c.fetchall()
print("Columnas:", [col[1] for col in cols])

# Ver todas las comidas de hoy
c.execute("SELECT * FROM comidas WHERE dia='2026-03-18'")
rows = c.fetchall()
print(f"\nComidas hoy ({len(rows)}):")
for r in rows:
    print(r)

# Ver el GET endpoint cómo filtra - buscar comidas del user 0001
c.execute("SELECT * FROM comidas WHERE user_id='0001' OR cliente_id IN (SELECT id FROM clientes WHERE user_id='0001')")
rows2 = c.fetchall()
print(f"\nComidas de 0001 ({len(rows2)}):")
for r in rows2:
    print(r)

conn.close()
