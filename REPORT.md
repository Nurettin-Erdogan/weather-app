# Proje Taraması — Detaylı Rapor

## Özet
Bu rapor, yerel repo içinde yapılan tarama ve temizleme işlemlerini özetler; ayrıca bulunan riskleri, alınan aksiyonları ve sonraki adımları belirtir.

## Yapılan işlemler
- Depo tarandı; ana dosyalar, scriptler ve veri dosyaları incelendi.
- `data/geocode-cache.json` dosyası analiz edildi ve açıkça yanlış olan 3 önbellek girdisi temizlendi.
- Temizleme öncesi yedek oluşturuldu: `data/geocode-cache.json.bak.1777214541`
- `scripts/bulk_geocode.py` betiğine aday doğrulama (ülke ve koordinat kutusu) eklendi.
- Küçük bir dry-run ile betik çalıştırılarak sözdizimi testi yapıldı.
 - Eksik koordinatlar `scripts/merge_bunick.py` ile BuNick kaynağından dolduruldu; yedek oluşturuldu: data/il-ilce-with-loc.json.bak.1777217332

## Mevcut durum (son analiz)
- `data/geocode-cache.json` toplam anahtar: 173
- Önbellekte eksik koordinat sayısı: 30
- `data/il-ilce-with-loc.json` içindeki toplam ilçe kayıtları: 973
 - Bu dosyada koordinat eksikliği olan kayıtlar: 0 (BuNick dataset ile dolduruldu; yedek: data/il-ilce-with-loc.json.bak.1777217332)

## Temizlenen örnek girdiler (örnek)
- `Kastamonu|||KÜRE` — ülke: Japonya — lat=34.23222 lon=132.56657
- `Kayseri|||SARIZ` — ülke: İran — lat=30.99806 lon=55.995
- `Kocaeli|||DARICA` — ülke: Sırbistan — lat=43.98167 lon=21.70389

(Bu girdiler otomatik olarak önbellekten çıkarıldı; orijinal yedek bakınız.)

## Riskler ve öneriler (öncelikli)
- Önbellek içinde Türkiye dışı veya açıkça yanlış koordinatlar olabiliyor; `bulk_geocode.py` artık bu tür adayları reddediyor.
- `data/il-ilce-with-loc.json` içindeki 889 eksik koordinat için parça parça (batch) geocoding çalıştırılmalı ve sonuçlar manuel/otomatik doğrulama ile onaylanmalı.
- Toplu geocoding sırasında API limitlerine saygı gösterin: `--delay 1.0` veya daha uzun aralık kullanın ve küçük `--limit` değerleriyle ilerleyin.
- Commit işleminden önce sonuçları elle kontrol edin (ör. nüfus merkezi veya `_geocoded_name` alanıyla karşılaştırma).

## Yapılan kod değişiklikleri
- Güncelleme: [scripts/bulk_geocode.py](scripts/bulk_geocode.py)
  - Aday seçimi sonrası `country` alanı ve koordinatların Türkiye sınırları içinde olup olmadığı kontrol ediliyor.
  - Uygunsuz adaylar reddediliyor; böylece yanlış ülke eşleşmeleri önleniyor.

## Hızlı kullanım adımları
1. Ortam bağımlılıklarını yükleyin (opsiyonel):

```bash
python -m pip install -r scripts/requirements.txt
```

2. Betiği parça parça çalıştırma örneği (güvenli):

```bash
python scripts/bulk_geocode.py --start 0 --limit 50 --delay 1.0
```

3. Uygulamayı yerel tarayıcıda test etmek için:

```bash
python -m http.server 8000
# sonra tarayıcıda: http://localhost:8000
```

4. Şüpheli önbellek girdilerini listeleme (hızlı kontrol):

```bash
python - <<'PY'
import json
c=json.load(open('data/geocode-cache.json',encoding='utf-8'))
for k,v in c.items():
    lat=v.get('latitude'); lon=v.get('longitude')
    try:
        if lat is None or lon is None or not (35<=float(lat)<=43 and 25<=float(lon)<=45):
            print(k, lat, lon, v.get('country'))
    except Exception:
        print(k, lat, lon, v.get('country'))
PY
```

## Önerilen bir sonraki adım
- İsterseniz eksik (889) kaydı partiler halinde tamamlayıp sonuçları size raporlayayım. Önerilen batch boyutu: 50 ve `--delay 1.0`.
- Alternatif: Benim için bir PR oluşturup betik değişikliklerini commitlememi isterseniz, yapabilirim.

---
Rapor oluşturuldu ve `scripts/bulk_geocode.py` doğrulama filtresi eklendi. İstediğiniz sonraki adımı söyleyin: eksik kayıtları otomatik tamamlayayım mı, yoksa PR hazırlayayım mı?
