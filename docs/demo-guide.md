# 3 Dakikalık Demo Akışı

Bu senaryo canlı Hava Durumu PWA'sını veri kalitesi, gizlilik, çevrimdışı kullanım ve erişilebilirlikle birlikte gösterir.

## Hazırlık

- [Canlı demoyu](https://nurettin-erdogan.github.io/weather-app/) aç.
- Tarayıcı geliştirici araçlarında mobil görünümü ve çevrimdışı modu hazır tut.
- Arama örneği olarak `Karesi / Balıkesir` kullan.

## 0:00–0:30 — Problem

“Türkiye'de ilçe düzeyinde hava verisini hızlı sunarken yanlış koordinat, belirsiz ilçe adı, konum izni ve eski önbellek gibi ürün risklerini de yönetmek gerekiyor.”

## 0:30–1:15 — Arama ve veri kaynağı

1. `Karesi` ara ve doğru il/ilçe sonucunu seç.
2. Anlık hava, 24 saatlik grafik ve 7 günlük tahmini göster.
3. Veri bilgisi bölümündeki kaynak, alınma zamanı, tahmin zamanı ve koordinatı aç.
4. Aynı isimli ilçelerde il seçiminin zorunlu tutulduğunu anlat.

Vurgu: 973 ilçe koordinatı sınır, kümelenme ve iller arası yanlış ortak koordinat testlerinden geçer.

## 1:15–2:00 — Risk ve kişiselleştirme

1. Otomatik 24 saatlik risk özetini göster.
2. Bunun resmî meteorolojik uyarı olmadığını belirten açıklamayı işaret et.
3. Yağış, rüzgâr ve UV eşiklerini değiştir.
4. Dışarı planı, şemsiye ve hava kalitesi önerilerini göster.

## 2:00–2:35 — Gizlilik ve çevrimdışı kullanım

1. GPS'in yalnız butona basıldığında istendiğini anlat.
2. Konum reddedildiğinde IP servisinin otomatik çağrılmadığını göster.
3. Bir konumu kaydet, sonra tarayıcıyı çevrimdışı moda al.
4. Son güvenilir tahminin açık biçimde “kayıtlı veri” olarak açıldığını göster.

## 2:35–3:00 — Kapanış

“Bu projede dış API entegrasyonunun yanında 973 ilçelik veri doğrulama, izinli konum akışları, PWA yaşam döngüsü, erişilebilirlik ve 31 otomatik testi birlikte yönettim.”

## Görüşmede gelebilecek sorular

- Koordinat veri kalitesini nasıl doğruladın?
- Çevrimdışı verinin canlı veri gibi görünmesini nasıl engelledin?
- GPS ve yaklaşık IP konumunda gizliliği nasıl korudun?
- Service worker güncellemesini neden kullanıcı onayına bağladın?
