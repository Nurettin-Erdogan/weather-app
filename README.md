# Hava Durumu Uygulaması

Basit, istemci tarafı hava durumu uygulaması — Open-Meteo API kullanır.

## Özellikler
- Şehir arama ile anlık hava durumu
- Nem, rüzgar, açıklama gösterimi
- İkon ve arka plan hava durumuna göre değişir
- 5 günlük tahmin ve sonraki 24 saatlik saatlik tahmin
- Konuma göre otomatik hava durumu (tarayıcı konum izni ile)
- Son aramalar localStorage'ta saklanır
- Saatler yerel, okunabilir formata çevrildi
- Yükleme esnasında spinner ve butonları devre dışı bırakma

## Nasıl çalıştırılır
1. Depoyu yerel olarak açın veya `index.html` dosyasını tarayıcıda açın.
2. Konum izni verirseniz, varsayılan olarak bulunduğunuz konumun hava durumu yüklenir.
3. Arama kutusuna şehir adı yazıp `Ara` butonuna basın veya Enter tuşuna basın.

## Konum İzinleri

- Uygulamada sağ üstteki "Konumumu Kullan" butonuna basarak tarayıcınızdan konum izni istenebilir. Eğer izin verirseniz, bulunduğunuz konuma göre hava durumu otomatik yüklenir.
- Eğer konum isteği görünmüyor veya daha önce engellediyseniz, tarayıcıda site izinlerinden `localhost` için Konum (Location) iznini açmanız gerekir. Örnek adımlar:
	- Chrome / Edge: adres çubuğundaki kilit simgesine tıklayın → Site ayarları → Konum → `Allow` (İzin ver).
	- Firefox: adres çubuğundaki kilit → Permissions → Location → `Allow` veya Options → Privacy & Security → Permissions → Location → Settings… üzerinden `localhost` girdisini düzenleyin.
	- Safari (macOS): Safari → Settings for This Website → Location → `Allow` veya Sistem Tercihleri → Güvenlik & Gizlilik → Konum Servisleri.
- `file://` ile açılan sayfalarda tarayıcılar genellikle `fetch` ve geolocation erişimini kısıtlayabilir; bu yüzden yerel sunucu kullanmanız önerilir (bkz. "Tek komutla").

## IP tabanlı fallback

Eğer kullanıcı tarayıcı konum iznini reddederse uygulama otomatik olarak IP tabanlı yaklaşık bir konum deneyecektir (ör. ipapi). Bu, kesin koordinat vermez fakat bulunduğunuz şehre yakın tahmini bir konum sağlar ve hava verilerini getirmeye yarar. Eğer IP tabanlı konum da alınamazsa, manuel arama yapmanız gerekecektir.

### Tek komutla (lokal sunucu)
Konsolda proje klasöründe aşağıdaki komutlardan birini çalıştırın, sonra tarayıcıda `http://localhost:8000` açın:

Windows (CMD / PowerShell):
```
run-local.bat
``` 

macOS / Linux:
```
./run-local.sh
```

Alternatif olarak doğrudan:
```
python -m http.server 8000
# veya
python3 -m http.server 8000
```

## API
Bu proje `https://open-meteo.com` üzerinden ücretsiz API uç noktalarını kullanır (geocoding ve forecast).

## Geliştirme önerileri
- İkonları emoji yerine SVG'lerle değiştir (daha tutarlı görsel).
- Birim dönüşümleri (°C / °F) ekle.
- Tema (dark/light) geçişi ekle.
- Basit testler ve CI entegrasyonu ekle.
 
## Yapılan küçük erişilebilirlik düzeltmeleri (hızlı)
- `result` konteynerine `aria-live="polite"` ve `aria-atomic="true"` eklendi: ekran okuyucular için anlık içerik güncellemeleri bildirilecek.
- Arama önerileri için klavye navigasyonu zaten destekleniyor; sonraki adım `role="combobox"` ve uygun `aria-controls`/`aria-expanded` eklemek olabilir.

## Yeni eklenen küçük özellikler
- Sayfaya `°C / °F` birim geçişi eklendi: sağ üstteki butonlarla birim değiştirilebilir, tercih `localStorage`'a kaydedilir.
- Sıcaklık gösterimleri birim değişimine göre yeniden render edilir (fetch tekrarına gerek yok).

## Lisans
Kişisel kullanım ve eğitim amaçlı.

## Offline İlçe Verisi (data/il-ilce.json)

Bu proje artık Türkiye'nin il/ilçe listesini içeren bir JSON dosyası içerir: `data/il-ilce.json`.
Dosya kaynağı (orijinal ham liste): https://github.com/snrylmz/il-ilce-json

Nasıl kullanılır
- `app.js` önce yerel `./data/il-ilce.json` dosyasını yüklemeye çalışır; dosya yoksa uzak raw URL'e geri döner.
- Tarayıcıda `index.html`'i doğrudan `file://` ile açmak yerine basit bir yerel sunucu kullanın (aksi halde `fetch` yerel dosyaya erişemeyebilir):

```bash
python -m http.server 8000
# sonra tarayıcıda: http://localhost:8000
```

Güncelleme ve koordinat ekleme
- Eğer ilçe verisini güncellemek isterseniz, ham JSON'u yeniden indirip `data/il-ilce.json` üzerine yazabilirsiniz:

```bash
curl -sSfL 'https://raw.githubusercontent.com/snrylmz/il-ilce-json/master/js/il-ilce.json' -o data/il-ilce.json
```

- İlçe bazlı koordinat (latitude/longitude) bilgisi orijinal dosyada yoktur; seçim anında tekil geocoding yapılmaktadır. Toplu olarak koordinat eklemek isterseniz, repo'ya eklediğim `scripts/bulk_geocode.py` betiğini kullanabilirsiniz. Örnek:

```bash
python -m pip install -r scripts/requirements.txt
python scripts/bulk_geocode.py --data data/il-ilce.json --out data/il-ilce-with-loc.json --delay 1.0
```

Notlar ve uyarılar
- Bulk geocoding işlemi Open‑Meteo geocoding API'sine çok sayıda istek gönderebilir; lütfen varsayılan gecikme (`--delay`) değerini 1s veya daha yüksek tutun ve sonuçları manuel doğrulayın.
- Betik bir önbellek (`data/geocode-cache.json`) kullanır; yeniden çalıştırdığınızda önceden çözümlenmiş koordinatlar tekrar kullanılacaktır.
- Toplu geocoding sonuçlarını commit etmeden önce doğrulamanız önerilir — bazı ilçeler için eşleştirme yanlış olabilir.

İleri adımlar
- İsterseniz toplu geocoding'i parça parça çalıştırıp (`--start`/`--limit`) çıktıların doğrulanması ve sonra `data/il-ilce-with-loc.json` dosyasının repo'ya eklenmesi iyi olur.

### Hızlı smoke-test kontrol listesi (geliştirici)

1. Proje klasöründe terminal açın ve lokal sunucuyu başlatın:

```bash
python -m http.server 8000
```

2. Tarayıcıda `http://localhost:8000` adresini açın.

3. Adım adım test akışı:
	- `Konumumu Kullan` butonuna tıklayın → tarayıcı izin penceresinden `Allow` seçin. Sayfa `Konum: <Şehir>` mesajı gösterecek ve hava verileri yüklenecektir.
	- Tekrar `Konumumu Kullan` tıklayın → bu sefer `Block` seçin (izin reddi). Uygulama IP‑tabanlı yaklaşık konum denemeli ve `Yaklaşık konum: <Şehir>` mesajını göstermelidir.
	- Arama kutusuna örnek şehir/ilçe yazın; öneriler (autocomplete) ve seçimin doğru çalıştığını kontrol edin.
	- 5 günlük tahmin kartlarından birine tıklayın → saatlik detay panelinin açıldığını doğrulayın.

4. DevTools → `Console` ve `Network` sekmelerini kontrol edin. Open‑Meteo (forecast/geocoding) ve IP‑servisleri isteklerini kontrol edin; tarayıcıdan yapılan testler genellikle sunucu ortamından yapılan isteklerden daha güvenilirdir.

5. Not: Bazı durumlarda Open‑Meteo veya Nominatim uç noktalarına yapılan doğrudan sunucu istekleri 404/403 dönebilir. Bu nedenle testleri tarayıcıda manuel olarak yapmanız önerilir.

### Otomatik smoke-test (Playwright)

Projede basit bir Playwright tabanlı smoke-test eklendi: `tests/smoke_playwright.py`.
Bu test, arama akışını, günlük kartından saatlik panel açılmasını ve konum izni reddi durumunu otomatik olarak kontrol eder.

Çalıştırma (tercihen proje kökünde bir virtualenv kullanın):

Windows (PowerShell):
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install playwright
python -m playwright install chromium
python tests/smoke_playwright.py
```

macOS / Linux:
```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install playwright
python -m playwright install chromium
python tests/smoke_playwright.py
```

Notlar:
- Sunucunun (`python -m http.server 8000`) çalışıyor olması gerekir.
- İlk defa çalıştırırken `playwright install chromium` Chromium indirir; internet bağlantısı gerektirir.
- CI entegrasyonu isterseniz bu adımları bir GitHub Actions workflow'una ekleyebilirim.

### Commit & Push — kısa özet

```bash
git add -A
git commit -m "kısa: açıklayıcı mesaj"
git push origin HEAD
```

### VS Code — hızlı GUI adımları

- `Source Control` (Ctrl+Shift+G) → değişiklikleri inceleyin → dosya üzerindeki `+` ile stage edin veya `Stage All` kullanın.
- Üstteki mesaj kutusuna kısa açıklayıcı commit mesajı yazın → ✔ ile commit edin.
- Sol alt veya üç nokta menüsünden `Push` seçin; ilk push'ta GitHub kimlik doğrulaması penceresini takip edin.

### Dikkat edilmesi gerekenler

- `data/` içindeki büyük JSON dosyalarını, `reports/` klasörünü ve `*.bak` dosyalarını repoya commit etmeyin. Bu repo `.gitignore` ile bu dosyaları hariç tutacak şekilde ayarlandı.
- Toplu geocoding sonuçlarını paylaşıma almadan önce manuel doğrulama yapın — otomatik eşleştirmeler hatalı olabilir.

---
Bu bölümü istediğiniz gibi kısaltayım veya daha fazla teknik detay ekleyeyim; nasıl görmek istersiniz?
