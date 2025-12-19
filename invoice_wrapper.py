# invoice_wrapper.py

def clean_invoice_id(raw_id):
    """
    يحول القيم اللي شكلها ('1,') أو ('5',) إلى رقم صحيح 1 أو 5.
    """
    # لو بالفعل رقم صحيح
    if isinstance(raw_id, int):
        return raw_id

    # نحولها نص ونشيل الأقواس والفواصل
    s = str(raw_id).replace("(", "").replace(")", "").replace(",", "").strip()

    try:
        return int(s)
    except:
        raise ValueError(f"Invalid invoice ID format: {raw_id}")


def print_pdf_safe(app, raw_id):
    """
    يستدعي generate_pdf بعد تنظيف ID.
    """
    inv_id = clean_invoice_id(raw_id)
    app.generate_pdf(inv_id)
    return inv_id
