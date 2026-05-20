# invoice_table_cleaner.py

def clean_value(v):
    """
    ينضف أي قيمة راجعة من SQL بحيث تختفي الأقواس والفواصل.
    """
    if v is None:
        return ""

    if isinstance(v, (int, float)):
        return v

    s = str(v)

    # شيل الأقواس والفواصل من tuples 
    s = s.replace("(", "").replace(")", "").replace("'", "")
    s = s.replace(",", "").strip()

    return s


def clean_row(row):
    """
    ينضف صف كامل قبل عرضه في Treeview.
    """
    return [clean_value(v) for v in row]


def insert_clean(tree, row):
    """
    دالة جاهزة لإضافة صف نظيف للـ Treeview بدون رموز غريبة.
    """
    tree.insert("", "end", values=clean_row(row))
