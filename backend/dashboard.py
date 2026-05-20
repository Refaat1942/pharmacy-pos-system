from flask import Flask, render_template_string, request
import requests

app = Flask(__name__)

BACKEND_URL = "http://127.0.0.1:8000"

HTML = """
<!DOCTYPE html>
<html lang="ar">
<head>
    <meta charset="UTF-8">
    <title>Pharmacy Dashboard</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background: #f4f6f8;
            padding: 30px;
            direction: rtl;
        }
        .card {
            background: white;
            padding: 20px;
            margin-bottom: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            max-width: 500px;
        }
        h2 {
            margin-top: 0;
        }
        input, button {
            padding: 8px;
            margin: 5px 0;
            width: 100%;
            box-sizing: border-box;
        }
        button {
            background: #1976D2;
            color: white;
            border: none;
            cursor: pointer;
            border-radius: 4px;
        }
        button:hover {
            background: #125aa0;
        }
        table {
            border-collapse: collapse;
            width: 100%;
            background: white;
            border-radius: 8px;
            overflow: hidden;
        }
        th, td {
            padding: 10px;
            border: 1px solid #ddd;
            text-align: center;
        }
        th {
            background: #eeeeee;
        }
        .alert {
            background: #fff3cd;
            border: 1px solid #ffc107;
            padding: 15px;
            border-radius: 8px;
            max-width: 500px;
            margin-bottom: 20px;
        }
    </style>
</head>
<body>

<h1>📊 لوحة تحكم الصيدلية</h1>

{% if db_error %}
<div class="alert">
    ⚠️ تعذر الاتصال بقاعدة البيانات. يرجى التحقق من إعدادات SQL Server.
</div>
{% endif %}

<div class="card">
    <h2>مبيعات اليوم</h2>
    <p><strong>{{ today_sales }}</strong> جنيه</p>
</div>

<div class="card">
    <h2>مبيعات فترة</h2>
    <form method="get">
        <input type="date" name="from">
        <input type="date" name="to">
        <button type="submit">عرض</button>
    </form>
</div>

{% if days %}
<h2>نتيجة الفترة</h2>
<p>
    من {{ date_from }} إلى {{ date_to }} <br>
    إجمالي الفترة: <strong>{{ grand_total }}</strong> جنيه
</p>

<table>
    <tr>
        <th>التاريخ</th>
        <th>الإجمالي</th>
    </tr>
    {% for d in days %}
    <tr>
        <td>{{ d.date }}</td>
        <td>{{ d.total }}</td>
    </tr>
    {% endfor %}
</table>
{% endif %}

</body>
</html>
"""


@app.route("/", methods=["GET"])
def dashboard():
    today_sales = 0
    db_error = False
    days = []
    grand_total = 0
    date_from = ""
    date_to = ""

    try:
        today_resp = requests.get(f"{BACKEND_URL}/sales/today", timeout=5)
        today_sales = today_resp.json().get("total_sales", 0)
    except Exception:
        db_error = True

    if "from" in request.args and "to" in request.args:
        date_from = request.args.get("from")
        date_to = request.args.get("to")
        try:
            resp = requests.get(
                f"{BACKEND_URL}/sales/by-date",
                params={"date_from": date_from, "date_to": date_to},
                timeout=5
            )
            data = resp.json()
            days = data.get("days", [])
            grand_total = data.get("grand_total", 0)
        except Exception:
            db_error = True

    return render_template_string(
        HTML,
        today_sales=today_sales,
        days=days,
        grand_total=grand_total,
        date_from=date_from,
        date_to=date_to,
        db_error=db_error
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
