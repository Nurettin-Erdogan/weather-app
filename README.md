# Hava Durumu

Türkiye il ve ilçeleri için anlık hava durumu, saatlik grafikler, 5 günlük tahmin ve hava kalitesi gösteren, kurulum gerektirmeyen bir Progressive Web App'tir.

Canlı sürüm: https://nurettin-erdogan.github.io/weather-app/

## Özellikler

- 973 ilçe için doğrulanmış yerel koordinat verisi
- Türkçe karakterleri destekleyen hızlı il/ilçe araması
- Anlık sıcaklık ve hissedilen sıcaklık
- Nem, yağış, bulutluluk, rüzgâr yönü ve rüzgâr hamlesi
- Avrupa Hava Kalitesi İndeksi, anlık UV, günlük maksimum UV, gün doğumu ve gün batımı
- 24 saatlik sıcaklık/yağış grafiği ve saatlik kartlar
- Gün seçimiyle birlikte güncellenen saatlik grafik ve kartlar
- 5 günlük tahmin
- Celsius/Fahrenheit seçimi
- Klavye ok tuşlarıyla kullanılabilen erişilebilir sıcaklık birimi seçimi
- Son aramaları cihazda saklama ve hızlı yeniden açma
- Açık/koyu tema ve Türkçe/İngilizce arayüz
- GPS konumu ve açık onaylı yaklaşık IP konumu
- GPS konumunu idari ilçe adına eşleyen OpenStreetMap ters konum çözümleme
- Ters konum çevrimdışıyken yaklaşık ilçe rozeti ve şehir seviyesinde dürüst IP konumu
- PWA kurulumu ve çevrimdışı son tahmin desteği
- Açık sekmede, bağlantı geri geldiğinde ve uygulamaya dönüldüğünde sessiz otomatik yenileme
- Mobil ve masaüstü erişilebilir arayüz

## Mahremiyet

- GPS konumu yalnızca kullanıcı butona bastığında tarayıcıdan istenir; koordinat hava verisi için Open-Meteo'ya, ilçe adını belirlemek için OpenStreetMap tabanlı Photon'a gönderilir.
- Yerel listede bulunamayan arama metni eşleştirme için Open-Meteo geocoding servisine gönderilir.
- Konum izni reddedildiğinde IP servisi otomatik çağrılmaz.
- Yaklaşık IP konumu için kullanıcıdan ayrıca açık onay alınır ve yalnızca `ipwho.is` kullanılır.
- Tercihler, son aramalar ve son tahmin cihazdaki `localStorage` içinde tutulur.
- Projede API anahtarı veya kullanıcı hesabı yoktur.
- Uygulama üçüncü taraf isteklere sayfa adresini referrer olarak göndermez.

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
- Arama, birim, dil, tema, erişilebilir günlük seçim ve mobil görünüm
- API hata/yeniden deneme akışı
- IP servisine kullanıcı onayı olmadan istek gönderilmemesi
- Türkiye dışındaki GPS konumlarının reddedilmesi
- Aynı isimli ilçelerde il seçimi zorunluluğu
- Bozuk yerel depolama verisinde güvenli varsayılanlara dönülmesi
- Bozuk veya Türkiye dışı çevrimdışı hava önbelleğinin reddedilmesi
- PWA önbellek sürümü ile HTML varlık sürümlerinin eşleşmesi

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
- GPS ters konum çözümleme: OpenStreetMap tabanlı Photon
- Yerel koordinat temel kaynağı: BuNick Turkey Cities & Districts
