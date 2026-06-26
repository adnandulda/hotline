# 🚀 Railway ile Canlıya Alma (kalıcı + 7/24 açık)

Bu rehber uygulamayı internette herkesin erişebileceği, **hesapların kalıcı olduğu**
ve **sürekli açık** kalan bir adrese taşır. Tahmini maliyet: ayda ~1-3 dolar
(Railway başlangıçta küçük bir ücretsiz kredi verir).

> Not: Gmail bilgilerini ve şifreni Railway'in **Variables** ekranına gireceğiz,
> koda yazmıyoruz. Yani GitHub'a sızmaz.

---

## 1. Railway hesabı aç
1. https://railway.app adresine git.
2. **Login** → **Login with GitHub** ile gir (GitHub hesabınla).

## 2. Projeyi GitHub'dan deploy et
1. **New Project** → **Deploy from GitHub repo**.
2. İlk seferde Railway'e GitHub erişimi ver, sonra listeden **adnandulda/hotline** seç.
3. Railway otomatik olarak Node.js uygulaması olduğunu anlar ve `npm start` ile başlatır.
   İlk deploy birkaç dakika sürer.

## 3. Kalıcı disk (Volume) ekle — EN ÖNEMLİ ADIM
Bu olmadan her güncellemede hesaplar silinir.
1. Servise tıkla → üstten **Settings** (veya servise sağ tık) → **Volumes** → **Add Volume**.
2. **Mount path** olarak şunu yaz:  `/data`
3. Kaydet.

## 4. Ortam değişkenlerini (Variables) gir
Servis → **Variables** sekmesi → her biri için **New Variable**:

| Değişken | Değer |
|---|---|
| `DATA_DIR` | `/data` |
| `UPLOAD_DIR` | `/data/uploads` |
| `GMAIL_USER` | kendi Gmail adresin |
| `GMAIL_PASS` | Gmail **uygulama şifren** (16 hane) — buraya gir, koda/derfte yazma |
| `GMAIL_FROM_NAME` | `Bizim Discord` |

> ⚠️ Gmail şifreni bu dosyaya veya koda **yazma**. Sadece Railway'in Variables
> ekranına gir. (Senin uygulama şifren bende var, ama herkese açık repoda durmaması
> için buraya yazmadım.)

> `PORT` değişkenini **EKLEME** — onu Railway otomatik veriyor.

## 5. Herkese açık adres oluştur
1. Servis → **Settings** → **Networking** → **Generate Domain**.
2. Sana `xxxx.up.railway.app` gibi bir adres verir. Bağlantı bu.
3. Değişiklikten sonra **Redeploy** de (sağ üstteki menüden) ki yeni ayarlar uygulansın.

## 6. Test et
- Adresi aç → kayıt ol → kod **mailine** gelmeli → doğrula → giriş.
- Sayfa HTTPS olduğu için sesli oda (mikrofon/kamera) da çalışır.
- Bir güncelleme yapıp yeniden deploy et; **hesaplar silinmemeli** (volume sayesinde).

---

## Güncelleme nasıl yapılır?
Bilgisayarında kodu değiştirip GitHub'a `git push` yapınca Railway **otomatik**
yeniden deploy eder. Ekstra bir şey yapman gerekmez.

## Sık sorunlar
- **Mail gitmiyor:** `GMAIL_USER` / `GMAIL_PASS` doğru mu kontrol et. Şifre, normal
  Gmail şifren değil, **uygulama şifresi** olmalı (16 hane).
- **Hesaplar siliniyor:** Volume `/data` yoluna bağlı mı ve `DATA_DIR=/data`,
  `UPLOAD_DIR=/data/uploads` girili mi diye bak.
- **Ücret:** Kullanım kredisi biterse Railway uyarır; küçük bir kart ekleyip
  Hobby plana geçince aylık birkaç dolarla devam eder.
