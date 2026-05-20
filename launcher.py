import customtkinter as ctk
import subprocess
import sys
import os

# -------------------------
# إعدادات الواجهة
# -------------------------
ctk.set_appearance_mode("light")   # light / dark
ctk.set_default_color_theme("blue")

APP_TITLE = "POS Launcher"
POS_FILE = "pos_app.py"   # اسم ملف الـ POS الأصلي

# -------------------------
# التطبيق الرئيسي
# -------------------------
class LauncherApp(ctk.CTk):

    def __init__(self):
        super().__init__()

        self.title(APP_TITLE)
        self.geometry("500x350")
        self.resizable(False, False)

        # ---------- Header ----------
        ctk.CTkLabel(
            self,
            text="نظام نقطة البيع",
            font=("Cairo", 28, "bold")
        ).pack(pady=30)

        # ---------- Buttons ----------
        ctk.CTkButton(
            self,
            text="🟢 فتح نقطة البيع",
            width=260,
            height=55,
            font=("Cairo", 18, "bold"),
            command=self.open_pos
        ).pack(pady=15)

        ctk.CTkButton(
            self,
            text="❌ خروج",
            width=260,
            height=45,
            font=("Cairo", 16),
            fg_color="#b71c1c",
            hover_color="#7f0000",
            command=self.destroy
        ).pack(pady=10)

        # ---------- Footer ----------
        ctk.CTkLabel(
            self,
            text="Dr. Ahmed Refaat • POS System",
            font=("Cairo", 12)
        ).pack(side="bottom", pady=15)

    # -------------------------
    # فتح برنامج POS
    # -------------------------
    def open_pos(self):
        try:
            python = sys.executable
            pos_path = os.path.join(os.getcwd(), POS_FILE)

            subprocess.Popen([python, pos_path], shell=True)
            self.destroy()

        except Exception as e:
            ctk.CTkMessagebox(
                title="خطأ",
                message=f"تعذّر تشغيل نقطة البيع:\n{e}"
            )


# -------------------------
# تشغيل البرنامج
# -------------------------
if __name__ == "__main__":
    app = LauncherApp()
    app.mainloop()
