import pyodbc

DB_CONFIG = {
    "DRIVER": "{ODBC Driver 17 for SQL Server}",
    "SERVER": "DESKTOP-8PMOIFI",
    "DATABASE": "DrAhmedCRM",
    "Trusted_Connection": "yes",
}

def get_connection():
    return pyodbc.connect(
        ";".join(f"{k}={v}" for k, v in DB_CONFIG.items())
    )
