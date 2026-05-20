import psycopg2
import psycopg2.extras
import os


def get_db_connection():
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        conn = psycopg2.connect(database_url)
    else:
        conn = psycopg2.connect(
            host=os.getenv("PGHOST", "localhost"),
            port=int(os.getenv("PGPORT", "5432")),
            database=os.getenv("PGDATABASE", "pharmacy"),
            user=os.getenv("PGUSER", "postgres"),
            password=os.getenv("PGPASSWORD", "")
        )
    conn.autocommit = False
    return conn
