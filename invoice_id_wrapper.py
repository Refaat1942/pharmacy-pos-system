# invoice_id_wrapper.py

def clean_invoice_id(raw_id):
    """
    تحويل قيم مثل ('9,') أو ('12',) أو '(7,' إلى رقم صحيح.
    """
    if isinstance(raw_id, int):
        return raw_id

    # نحول كل حاجة لنص وننضفها
    s = str(raw_id)
    s = s.replace("(", "").replace(")", "").replace(",", "").replace("'", "").strip()

    try:
        return int(s)
    except:
        raise ValueError(f"Invoice ID format not valid: {raw_id}")


def safe_open_details(app, raw_id):
    """
    تنظيف الـ ID ثم استدعاء show_invoice_details بأمان.
    """
    inv_id = clean_invoice_id(raw_id)
    app.show_invoice_details(inv_id)
    return inv_id
