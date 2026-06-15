# Hızlı Başlangıç

## Windows

Proje klasöründe `launch-local.bat` dosyasına çift tıklayın.

Alternatif:

```cmd
run-local.bat
```

## macOS / Linux

```bash
chmod +x run-local.sh
./run-local.sh
```

Tarayıcı adresi: http://127.0.0.1:8000

## Test

```bash
python -m pip install playwright
python -m playwright install chromium
python -m unittest discover -s tests -p "test_*.py" -v
```

## Release

```bash
python scripts/build_release.py
```

ZIP dosyası `dist/weather-app-release.zip` altında oluşur.

## Notlar

- Python 3 gerekir.
- PWA ve ES modülleri nedeniyle uygulamayı `file://` ile açmayın.
- Konum izni reddedilirse IP konumu yalnızca ek onayınızdan sonra kullanılır.
- Offline kullanım için uygulamayı bir kez çevrimiçiyken açın.
