# Hızlı Başlangıç — Quick Start

## Windows — En Kolay Yol 🚀

Proje klasöründe **`launch-local.bat`** dosyasını çift tıkla.

O kadar. Sunucu otomatik başlayacak ve tarayıcı açılacak.

Sunucuyu kapatmak: Konsolda `Ctrl+C` tuşuna bas.

---

## Windows — Elle Adımlar

1. Komut istemini (Command Prompt) aç ve proje klasörüne git:
   ```cmd
   cd C:\Users\YourUsername\path\to\weather-app
   ```

2. Sunucuyu başlat:
   ```cmd
   python -m http.server 8000
   ```

3. Tarayıcıda aç:
   ```
   http://localhost:8000
   ```

---

## macOS / Linux

Proje klasöründe terminali aç:

```bash
./run-local.sh
# veya
python -m http.server 8000
```

Tarayıcıda: `http://localhost:8000`

---

## Testler Çalıştırmak

Python virtualenv'i aktive et (ilk defa):

```bash
# Windows PowerShell
.\.venv\Scripts\Activate.ps1

# macOS / Linux
source .venv/bin/activate
```

Playwright testi:

```bash
python tests/smoke_playwright.py
```

(Ön koşul: sunucu çalışıyor olmalı)

---

## Konum İzni

Tarayıcıda konum iznini yönetmek istersen:
1. Adres çubuğundaki kilit simgesine tıkla
2. Site ayarları → Konum → İzin ver / Reddet

---

## İletişim / Hata

README.md dosyasına bak veya [yardım](README.md) sayfasına göz at.

Eğitim ve kişisel kullanım amaçlıdır.
