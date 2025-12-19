from flask import Flask, render_template_string, request
import requests

app = Flask(__name__)

BACKEND_URL = "http://127.0.0.1:8000"

# ==============================
#   HTML Template (Simple)
# ==============================
HTML = """
<!DOCTYPE html>
<html>
<head>
    <title>Pharmacy Dashboard</title>
    <style>
        body {
            font-family: Arial;
            background: #f4f6f8;
            padding: 30px;
        }
        .card {
            background: white;
            padding: 20px;
            margin-bottom: 20px;
            border-radius: 8px;
            width: 400px;
        }
        h2 {
            margin-top: 0;
        }
        input, button {
            padding: 8px;
            margin: 5px 0;
            width: 100%;
        }
        button {
            background: #1976D2;
            color: white;
            border: none;
            cursor: pointer;
        }
        button:hover {
            background: #125aa0;
        }
        table {
            border-collapse: collapse;
            width: 100%;
            background: white;
        }
        th, td {
            padding: 8px;
            border: 1px solid #ddd;
            text-align: center;
        }
        th {
            background: #eeeeee;
        }
    </style>
</head>
<body>

<h1>📊 Pharmacy Dashboard</h1>

<div class="card">
    <h2>مبيعات اليوم</h2>
    <p><strong>{{ today_sales }}</strong> جنيه</p>
</div>

<div class="card">
    <h2>مبيعات فترة</h2>
    <form method="get">
        <input type="date" name="from" required>
        <input type="date" name="to" required>
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

# ==============================
#   Dashboard Route
# ==============================
@app.route("/", methods=["GET"])
def dashboard():
    # ---- Sales Today ----
    today_resp = requests.get(f"{BACKEND_URL}/sales/today")
    today_sales = today_resp.json().get("total_sales", 0)

    days = []
    grand_total = 0
    date_from = ""
    date_to = ""

    # ---- Date Range ----
    if "from" in request.args and "to" in request.args:
        date_from = request.args.get("from")
        date_to = request.args.get("to")

        resp = requests.get(
            f"{BACKEND_URL}/sales/by-date",
            params={"date_from": date_from, "date_to": date_to}
        )

        data = resp.json()
        days = data.get("days", [])
        grand_total = data.get("grand_total", 0)

    return render_template_string(
        HTML,
        today_sales=today_sales,
        days=days,
        grand_total=grand_total,
        date_from=date_from,
        date_to=date_to
    )

# ==============================
#   Run Dashboard
# ==============================
if __name__ == "__main__":
    app.run(debug=True)
