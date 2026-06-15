# Hava Durumu

Türkiye il ve ilçeleri için anlık hava durumu, saatlik grafikler, 5 günlük tahmin ve hava kalitesi gösteren, kurulum gerektirmeyen bir Progressive Web App'tir.

Canlı sürüm: https://nurettin-erdogan.github.io/weather-app/

## Özellikler

- 973 ilçe için doğrulanmış yerel koordinat verisi
- Türkçe karakterleri destekleyen hızlı il/ilçe araması
- Anlık sıcaklık ve hissedilen sıcaklık
- Nem, yağış, bulutluluk, rüzgâr yönü ve rüzgâr hamlesi
- Avrupa Hava Kalitesi İndeksi, UV, gün doğumu ve gün batımı
- 24 saatlik sıcaklık/yağış grafiği ve saatlik kartlar
- 5 günlük tahmin
- Celsius/Fahrenheit seçimi
- Son aramalar ve kayıtlı favori şehirleri görüntüleme
- Açık/koyu tema ve Türkçe/İngilizce arayüz
- GPS konumu ve açık onaylı yaklaşık IP konumu
- PWA kurulumu ve çevrimdışı son tahmin desteği
- Mobil ve masaüstü erişilebilir arayüz

## Mahremiyet

- GPS konumu yalnızca kullanıcı butona bastığında tarayıcıdan istenir.
- Konum izni reddedildiğinde IP servisi otomatik çağrılmaz.
- Yaklaşık IP konumu için kullanıcıdan ayrıca açık onay alınır ve yalnızca `ipwho.is` kullanılır.
- Favoriler, tercihler, son aramalar ve son tahmin cihazdaki `localStorage` içinde tutulur.
- Projede API anahtarı veya kullanıcı hesabı yoktur.

## Yerel Çalıştırma

```bash
python -m http.server 8000 --bind 127.0.0.1
```

Ardından `http://127.0.0.1:8000` adresini açın. Windows'ta `launch-local.bat` dosyası sunucuyu ve tarayıcıyı otomatik açar.

`file://` üzerinden doğrudan açmayın; ES modülleri ve service worker için HTTP gerekir.

## Testler

```bash
python -m pip install playwright
python -m playwright install chromium
python -m unittest discover -s tests -p "test_*.py" -v
```

Test paketi şunları zorunlu kılar:

- 973 koordinatın Türkiye sınırları içinde olması
- İller arasında yanlış ortak koordinat bulunmaması
- Şüpheli ilçe/il küme sapmalarının bulunmaması
- Doğru Karesi koordinatının API'ye gönderilmesi
- Arama, birim, favori, dil, tema ve mobil görünüm
- API hata/yeniden deneme akışı
- IP servisine kullanıcı onayı olmadan istek gönderilmemesi

## Veri Bakımı

Koordinatları güvenilir tam eşleşmelerle denetlemek ve düzeltmek:

```bash
python scripts/repair_coordinates.py
python scripts/repair_coordinates.py --apply
```

Betik bulanık eşleşme kullanmaz. Dört dış kaynak istisnası kodda açıkça kayıtlıdır.

## Release Üretimi

```bash
python scripts/build_release.py
```

Çıktılar:

```text
dist/weather-app/
dist/weather-app-release.zip
```

Üretici betik eksik dosya, ilçe sayısı ve Türkiye koordinat sınırı kontrollerini paketlemeden önce çalıştırır.

## Proje Yapısı

```text
weather-app/
├── index.html
├── style.css
├── app.js
├── service-worker.js
├── manifest.webmanifest
├── js/
│   ├── api.js
│   ├── chart.js
│   ├── i18n.js
│   ├── search.js
│   ├── storage.js
│   ├── utils.js
│   └── weather-codes.js
├── data/il-ilce-with-loc.json
├── icons/
├── scripts/
└── tests/
```

## Veri Kaynakları

- Tahmin ve geocoding: Open-Meteo
- Hava kalitesi: Open-Meteo Air Quality API
- Harita: OpenStreetMap
- Radar bağlantısı: Windy
- Yerel koordinat temel kaynağı: BuNick Turkey Cities & Districts
