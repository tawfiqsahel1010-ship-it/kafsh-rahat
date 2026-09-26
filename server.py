import os
import json
import sqlite3
from flask import Flask, request, jsonify, send_from_directory

app = Flask(__name__, static_folder=".", static_url_path="")

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
LOCAL_DB = "accounting_server.db"

def pg():
    if not DATABASE_URL:
        return None
    import psycopg2
    return psycopg2.connect(DATABASE_URL)

def init_db():
    if DATABASE_URL:
        conn = pg()
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS days (
                date TEXT PRIMARY KEY,
                data TEXT NOT NULL
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS transactions (
                id SERIAL PRIMARY KEY,
                date TEXT NOT NULL,
                data TEXT NOT NULL
            )
        """)
        conn.commit()
        cur.close()
        conn.close()
    else:
        conn = sqlite3.connect(LOCAL_DB)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS days (
                date TEXT PRIMARY KEY,
                data TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                data TEXT NOT NULL
            )
        """)
        conn.commit()
        conn.close()

@app.route("/")
def index():
    return send_from_directory(".", "index.html")

@app.route("/<path:path>")
def static_files(path):
    return send_from_directory(".", path)

@app.get("/api/days")
def get_days():
    if DATABASE_URL:
        conn = pg()
        cur = conn.cursor()
        cur.execute("SELECT date, data FROM days ORDER BY date")
        rows = cur.fetchall()
        cur.close()
        conn.close()
    else:
        conn = sqlite3.connect(LOCAL_DB)
        rows = conn.execute("SELECT date, data FROM days ORDER BY date").fetchall()
        conn.close()

    return jsonify([json.loads(row[1]) for row in rows])

@app.get("/api/days/<date>")
def get_day(date):
    if DATABASE_URL:
        conn = pg()
        cur = conn.cursor()
        cur.execute("SELECT data FROM days WHERE date=%s", (date,))
        row = cur.fetchone()
        cur.close()
        conn.close()
    else:
        conn = sqlite3.connect(LOCAL_DB)
        row = conn.execute("SELECT data FROM days WHERE date=?", (date,)).fetchone()
        conn.close()

    return jsonify(json.loads(row[0]) if row else None)

@app.put("/api/days/<date>")
def save_day(date):
    data = request.get_json(force=True)
    data["date"] = date
    payload = json.dumps(data, ensure_ascii=False)

    if DATABASE_URL:
        conn = pg()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO days(date,data)
            VALUES(%s,%s)
            ON CONFLICT(date)
            DO UPDATE SET data=EXCLUDED.data
        """, (date, payload))
        conn.commit()
        cur.close()
        conn.close()
    else:
        conn = sqlite3.connect(LOCAL_DB)
        conn.execute("""
            INSERT INTO days(date,data)
            VALUES(?,?)
            ON CONFLICT(date)
            DO UPDATE SET data=excluded.data
        """, (date, payload))
        conn.commit()
        conn.close()

    return jsonify({"ok": True})

@app.get("/api/transactions")
def get_transactions():
    date = request.args.get("date")

    if DATABASE_URL:
        conn = pg()
        cur = conn.cursor()
        if date:
            cur.execute(
                "SELECT id,data FROM transactions WHERE date=%s ORDER BY id",
                (date,)
            )
        else:
            cur.execute("SELECT id,data FROM transactions ORDER BY id")
        rows = cur.fetchall()
        cur.close()
        conn.close()
    else:
        conn = sqlite3.connect(LOCAL_DB)
        if date:
            rows = conn.execute(
                "SELECT id,data FROM transactions WHERE date=? ORDER BY id",
                (date,)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT id,data FROM transactions ORDER BY id"
            ).fetchall()
        conn.close()

    result = []
    for row in rows:
        item = json.loads(row[1])
        item["id"] = row[0]
        result.append(item)

    return jsonify(result)

@app.post("/api/transactions")
def save_transaction():
    data = request.get_json(force=True)
    date = data.get("date")

    if DATABASE_URL:
        conn = pg()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO transactions(date,data) VALUES(%s,%s) RETURNING id",
            (date, json.dumps(data, ensure_ascii=False))
        )
        new_id = cur.fetchone()[0]
        conn.commit()
        cur.close()
        conn.close()
    else:
        conn = sqlite3.connect(LOCAL_DB)
        cur = conn.execute(
            "INSERT INTO transactions(date,data) VALUES(?,?)",
            (date, json.dumps(data, ensure_ascii=False))
        )
        new_id = cur.lastrowid
        conn.commit()
        conn.close()

    return jsonify({"id": new_id})

@app.delete("/api/transactions/<int:item_id>")
def delete_transaction(item_id):
    if DATABASE_URL:
        conn = pg()
        cur = conn.cursor()
        cur.execute("DELETE FROM transactions WHERE id=%s", (item_id,))
        conn.commit()
        cur.close()
        conn.close()
    else:
        conn = sqlite3.connect(LOCAL_DB)
        conn.execute("DELETE FROM transactions WHERE id=?", (item_id,))
        conn.commit()
        conn.close()

    return jsonify({"ok": True})

@app.delete("/api/data")
def clear_data():
    if DATABASE_URL:
        conn = pg()
        cur = conn.cursor()
        cur.execute("DELETE FROM transactions")
        cur.execute("DELETE FROM days")
        conn.commit()
        cur.close()
        conn.close()
    else:
        conn = sqlite3.connect(LOCAL_DB)
        conn.execute("DELETE FROM transactions")
        conn.execute("DELETE FROM days")
        conn.commit()
        conn.close()

    return jsonify({"ok": True})

@app.post("/api/import")
def import_data():
    backup = request.get_json(force=True)

    for day in backup.get("days", []):
        save_day_internal(day)

    for item in backup.get("transactions", []):
        item = dict(item)
        item.pop("id", None)
        save_transaction_internal(item)

    return jsonify({"ok": True})

def save_day_internal(data):
    date = data["date"]
    payload = json.dumps(data, ensure_ascii=False)

    if DATABASE_URL:
        conn = pg()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO days(date,data)
            VALUES(%s,%s)
            ON CONFLICT(date)
            DO UPDATE SET data=EXCLUDED.data
        """, (date, payload))
        conn.commit()
        cur.close()
        conn.close()
    else:
        conn = sqlite3.connect(LOCAL_DB)
        conn.execute("""
            INSERT INTO days(date,data)
            VALUES(?,?)
            ON CONFLICT(date)
            DO UPDATE SET data=excluded.data
        """, (date, payload))
        conn.commit()
        conn.close()

def save_transaction_internal(data):
    date = data.get("date")

    if DATABASE_URL:
        conn = pg()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO transactions(date,data) VALUES(%s,%s)",
            (date, json.dumps(data, ensure_ascii=False))
        )
        conn.commit()
        cur.close()
        conn.close()
    else:
        conn = sqlite3.connect(LOCAL_DB)
        conn.execute(
            "INSERT INTO transactions(date,data) VALUES(?,?)",
            (date, json.dumps(data, ensure_ascii=False))
        )
        conn.commit()
        conn.close()

init_db()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
