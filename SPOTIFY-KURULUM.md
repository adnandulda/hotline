# 🎧 Spotify "Şu an çalıyor" — Kurulum

Albüm kapağı + şarkı/sanatçı + ilerleme çubuğu + tıklayınca Spotify'da açma,
Spotify Web API ile çalışır. Bir kerelik kurulum gerekir:

## 1. Spotify uygulaması oluştur
1. https://developer.spotify.com/dashboard → giriş yap → **Create app**.
2. İsim/açıklama yaz (ne olursa).
3. **Redirect URIs** kısmına ŞUNLARI ekle (tam olarak, sonundaki `/` dahil):
   - `https://hotline-production-03ae.up.railway.app/`
   - `http://localhost:3000/`   (yerel test için)
4. "Which API/SDKs" → **Web API** seç. Kaydet.
5. Uygulamanın **Client ID**'sini kopyala (Settings'te görünür). *Secret gerekmez.*

## 2. Client ID'yi koda yaz
`public/index.html` içinde şu satırı bul ve Client ID'yi yapıştır:
```js
const SPOTIFY_CLIENT_ID = '';   // <<< buraya
```
Sonra GitHub'a push et (Railway otomatik güncellenir).

## 3. Kullan
Uygulamada sol alttaki **avatarına tıkla → "🎧 Spotify bağla"** → Spotify'da izin ver.
Artık Spotify'da şarkı çalarken profilinde/üye listesinde otomatik görünür.

## ⚠️ Önemli: Geliştirme modu sınırı
Yeni Spotify uygulamaları "Development Mode"dadır ve **yalnızca senin dashboard'da
elle eklediğin Spotify hesapları** bağlanabilir (en fazla 25 kişi).
- Dashboard → uygulaman → **User Management** → arkadaşlarının Spotify e-postalarını ekle.
- Daha fazlası için Spotify'dan "quota extension" talep edebilirsin.

Bağlamayan biri için sorun olmaz — sadece o kişide Spotify durumu görünmez.
