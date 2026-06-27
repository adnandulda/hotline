# 🖥️ Bizim Discord — Masaüstü Uygulaması (Electron)

Web uygulamasını bir masaüstü penceresinde açar ve şunları ekler:
- **Sistem tepsisi** — pencereyi kapatınca tepsiye iner, arka planda çalışmaya devam eder.
- **Native bildirimler** — DM / @bahsetme bildirimleri Windows bildirimi olarak gelir.
- **Otomatik oyun algılama** — açık olan oyunu bulup durumunu **"🎮 Oynuyor X"** yapar; oyunu kapatınca otomatik kalkar. (Discord'un yaptığı gibi.)

## Kurulum (geliştirme / çalıştırma)
```bash
cd desktop
npm install        # Electron'u indirir (birkaç yüz MB, bir kerelik)
npm start
```

> Açılmadan önce **sunucu adresini** ayarla: `main.js` içindeki
> `const APP_URL = ...` satırını kendi Railway adresinle değiştir
> (örn. `https://xxxx.up.railway.app`).
> Yerelde denemek için önce ana klasörde `node server.js` çalıştır,
> `APP_URL` `http://localhost:3000` kalsın.

## Windows için .exe kurulum dosyası üretme
```bash
cd desktop
npm run dist       # dist/ klasöründe kurulum .exe oluşur
```
İstersen klasöre **icon.png** (256×256 önerilir) koyarsan uygulama ve
tepsi ikonu o olur; koymazsan varsayılan kullanılır.

## Notlar
- Oyun listesi `main.js` içindeki `GAMES` tablosunda — istediğin oyunu
  `'oyun.exe':'Görünecek Ad'` şeklinde ekleyebilirsin.
- Otomatik algılama her 20 saniyede bir çalışır.
- Spotify "şu an dinliyor" entegrasyonu ileride eklenebilir (Spotify
  Web API ile hesabı bağlayarak).
