import customtkinter as ctk
import tkinter as tk
from tkinter import ttk, messagebox
import pyodbc
import pandas as pd
import ui_base


def get_connection():
    return pyodbc.connect(
        r'DRIVER={ODBC Driver 17 for SQL Server};'
        r'SERVER=DESKTOP-8PMOIFI;'
        r'DATABASE=DrAhmedCRM;'
        r'Trusted_Connection=yes;'
    )


def open_knowledge_window():
    # ===============================
    # Main Window
    # ===============================
    win = ctk.CTkToplevel()
    win.title("قاعدة المعرفة الدوائية")
    win.geometry("1200x700")
    win.configure(fg_color=ui_base.BG_MAIN)

    # ===============================
    # Header
    # ===============================
    header = ctk.CTkFrame(
        win,
        fg_color=ui_base.PRIMARY,
        corner_radius=0,
        height=60
    )
    header.pack(fill="x")

    ctk.CTkLabel(
        header,
        text="💊 قاعدة المعرفة الدوائية",
        font=ui_base.TITLE_FONT,
        text_color="white"
    ).pack(pady=15)

    # ===============================
    # Tabs
    # ===============================
    tabs = ctk.CTkTabview(win)
    tabs.pack(fill="both", expand=True, padx=20, pady=20)

    tab_search = tabs.add("🔍 بحث عام")
    tab_alt = tabs.add("💊 البدايل")
    tab_use = tabs.add("📚 حسب الاستخدام")

    # ==================================================
    # Tab 1 – Search
    # ==================================================
    search_card = ctk.CTkFrame(tab_search, fg_color=ui_base.CARD_BG, corner_radius=16)
    search_card.pack(fill="both", expand=True, padx=20, pady=20)

    search_entry = ctk.CTkEntry(
        search_card,
        placeholder_text="ابحث بالاسم أو الكود",
        font=ui_base.FONT,
        width=400
    )
    search_entry.pack(pady=15)

    columns = ("ItemCode", "ItemName", "ActiveIngredient", "MedicalUse")
    tree = ttk.Treeview(search_card, columns=columns, show="headings")
    tree.pack(fill="both", expand=True, padx=15, pady=10)

    for col in columns:
        tree.heading(col, text=col)
        tree.column(col, anchor="center", width=250)

    def fetch_data(keyword):
        try:
            db = get_connection()
            cur = db.cursor()
            cur.execute("""
                SELECT 
                    CAST(ItemCode AS VARCHAR(50)),
                    LTRIM(RTRIM(ItemName)),
                    LTRIM(RTRIM(ActiveIngredient)),
                    LTRIM(RTRIM(MedicalUse))
                FROM ProductKnowledge
                WHERE ItemCode LIKE ? OR ItemName LIKE ?
            """, f"%{keyword}%", f"%{keyword}%")

            rows = cur.fetchall()
            tree.delete(*tree.get_children())
            for r in rows:
                tree.insert("", "end", values=r)
            db.close()
        except Exception as e:
            messagebox.showerror("خطأ", str(e))

    search_entry.bind("<Return>", lambda e: fetch_data(search_entry.get()))

    ctk.CTkButton(
        search_card,
        text="بحث",
        fg_color=ui_base.PRIMARY,
        font=ui_base.FONT,
        command=lambda: fetch_data(search_entry.get())
    ).pack(pady=10)

    # ==================================================
    # Tab 2 – Alternatives
    # ==================================================
    alt_card = ctk.CTkFrame(tab_alt, fg_color=ui_base.CARD_BG, corner_radius=16)
    alt_card.pack(fill="both", expand=True, padx=20, pady=20)

    alt_entry = ctk.CTkEntry(
        alt_card,
        placeholder_text="اسم الدواء أو المادة الفعالة",
        font=ui_base.FONT,
        width=400
    )
    alt_entry.pack(pady=15)

    search_mode = tk.StringVar(value="name")

    radio_frame = ctk.CTkFrame(alt_card, fg_color="transparent")
    radio_frame.pack()

    ctk.CTkRadioButton(radio_frame, text="بحث بالاسم", variable=search_mode, value="name").pack(side="right", padx=10)
    ctk.CTkRadioButton(radio_frame, text="بحث بالمادة الفعالة", variable=search_mode, value="active").pack(side="right", padx=10)

    alt_tree = ttk.Treeview(alt_card, columns=columns, show="headings")
    alt_tree.pack(fill="both", expand=True, padx=15, pady=10)

    for col in columns:
        alt_tree.heading(col, text=col)
        alt_tree.column(col, anchor="center", width=250)

    def fetch_alternatives():
        try:
            db = get_connection()
            cur = db.cursor()

            if search_mode.get() == "name":
                cur.execute(
                    "SELECT ActiveIngredient FROM ProductKnowledge WHERE ItemName LIKE ?",
                    f"%{alt_entry.get()}%"
                )
                r = cur.fetchone()
                if not r:
                    return
                active = r[0]

                cur.execute("""
                    SELECT CAST(ItemCode AS VARCHAR(50)), ItemName, ActiveIngredient, MedicalUse
                    FROM ProductKnowledge WHERE ActiveIngredient = ?
                """, active)

            else:
                cur.execute("""
                    SELECT CAST(ItemCode AS VARCHAR(50)), ItemName, ActiveIngredient, MedicalUse
                    FROM ProductKnowledge WHERE ActiveIngredient LIKE ?
                """, f"%{alt_entry.get()}%")

            rows = cur.fetchall()
            alt_tree.delete(*alt_tree.get_children())
            for r in rows:
                alt_tree.insert("", "end", values=r)
            db.close()
        except Exception as e:
            messagebox.showerror("خطأ", str(e))

    ctk.CTkButton(
        alt_card,
        text="إظهار البدايل",
        fg_color=ui_base.PRIMARY,
        font=ui_base.FONT,
        command=fetch_alternatives
    ).pack(pady=10)

    # ==================================================
    # Tab 3 – By Use (Buttons)
    # ==================================================
    use_card = ctk.CTkScrollableFrame(tab_use, fg_color=ui_base.CARD_BG, corner_radius=16)
    use_card.pack(fill="both", expand=True, padx=20, pady=20)

    try:
        df = pd.read_excel("Product Knowledge.xlsx")
        uses = sorted(set(df["MedicalUse"].dropna().str.strip()))

        for use in uses:
            ctk.CTkButton(
                use_card,
                text=use,
                fg_color="#e5e7eb",
                text_color=ui_base.TEXT,
                hover_color="#dbeafe",
                font=ui_base.FONT,
                command=lambda u=use: show_products_by_use(df, u)
            ).pack(fill="x", pady=4)

    except Exception as e:
        messagebox.showerror("خطأ", str(e))


def show_products_by_use(df, use):
    win = ctk.CTkToplevel()
    win.title(f"المنتجات – {use}")
    win.geometry("900x600")
    win.configure(fg_color=ui_base.BG_MAIN)

    card = ctk.CTkFrame(win, fg_color=ui_base.CARD_BG, corner_radius=16)
    card.pack(fill="both", expand=True, padx=20, pady=20)

    tree = ttk.Treeview(card, columns=("ItemCode", "ItemName", "ActiveIngredient"), show="headings")
    tree.pack(fill="both", expand=True, padx=10, pady=10)

    for col in ("ItemCode", "ItemName", "ActiveIngredient"):
        tree.heading(col, text=col)
        tree.column(col, anchor="center", width=250)

    products = df[df["MedicalUse"].str.strip() == use]
    for _, r in products.iterrows():
        tree.insert("", "end", values=(r["ItemCode"], r["ItemName"], r["ActiveIngredient"]))
