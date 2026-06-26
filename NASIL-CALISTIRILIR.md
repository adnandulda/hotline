# 🎮 Bizim Discord — Nasıl Çalıştırılır?

Bu, **sıfırdan kendimiz kodladığımız** kendi sohbet uygulamamız. İçinde:

- 💬 Gerçek zamanlı yazışma + birden fazla kanal (genel, oyun, müzik, sohbet)
- 📎 Dosya ve resim gönderme
- 👥 Çevrimiçi kullanıcı listesi
- 🔊 Sesli konuşma, 📷 kamera, 🖥️ ekran paylaşımı
- 🧑‍🎨 **Profil düzenleme + profil fotoğrafı**
- ➕ **Arkadaş ekleme** (istek gönder / kabul et)
- 🔍 **Başkalarının profiline girme** (isme veya fotoğrafa tıkla)
- 📱 **Mobil uyumlu** (telefondan da kullanılır)

Hiçbir hazır kütüphane kullanmadık — sadece **Node.js**. Yani kod tertemiz ve tamamen bizim.

---

## 1) Node.js'i Kur (tek seferlik)

Bilgisayarına Node.js kurman lazım (uygulamayı çalıştıran motor):

1. Şu adrese gir: **https://nodejs.org**
2. **"LTS"** yazan büyük yeşil butona tıkla, indir.
3. İndirilen dosyayı çalıştır, hep "İleri / Next" diyerek kur.

---

## 2) Uygulamayı Başlat

### Windows (en kolay):
- Klasördeki **`BASLAT.bat`** dosyasına **çift tıkla.**
- Siyah bir pencere açılır ve "BIZIM DISCORD calisiyor!" yazar. Hazır!

### Mac / Linux:
- Klasörde bir terminal aç ve şunu yaz:
  ```
  node server.js
  ```

---

## 3) Tarayıcıdan Aç

Tarayıcını (Chrome öneririm) aç ve şunu yaz:

```
http://localhost:3000
```

Bir kullanıcı adı gir, "Gir" de — kendi Discord'undasın! 🎉

---

## 📱 Telefondan / Başka Cihazdan Bağlanma

Şu an uygulama **senin bilgisayarında** çalışıyor. Telefonun veya arkadaşların bağlanması için:

**Aynı ev/wifi'deyseniz (en kolay):**

1. Bilgisayarının yerel IP adresini öğren: Windows'ta `cmd` aç, **`ipconfig`** yaz, **"IPv4 Address"** satırına bak (örn. `192.168.1.20`).
2. Telefonun/arkadaşın **aynı wifi'ye bağlı olsun.**
3. Telefonun tarayıcısına şunu yaz: **`http://192.168.1.20:3000`** (kendi IP'ni yaz).
4. Açılmazsa **Windows Güvenlik Duvarı** engelliyordur: ilk çalıştırmada çıkan "izin ver" penceresinde **"Özel ağlar"** kutusunu işaretle ve izin ver. (Kaçırdıysan: Windows Defender Güvenlik Duvarı → "Bir uygulamaya izin ver" → Node.js'i bul ve özel ağlarda işaretle.)

> ⚠️ **ÖNEMLİ — kamera/mikrofon hakkında:** Telefondan `http://192.168...` ile girdiğinde **yazışma, dosya, profil, arkadaş** özelliklerinin hepsi çalışır. Ancak tarayıcılar güvenlik gereği, **kamera ve mikrofonu sadece `localhost`'ta veya `https://` (güvenli) adreste** açar. Yani sesli/görüntülü kısım, normal `http://IP` adresinde **telefonda çalışmaz.** Bu bir hata değil, tarayıcıların kuralı.
>
> **Çözüm:** Uygulamayı gerçek bir sunucuya taşıyıp **HTTPS** açtığımızda (alan adı + ücretsiz SSL ile, daha önce konuştuğumuz adım) kamera/mikrofon/ekran paylaşımı her cihazda sorunsuz çalışır. Yani sesli/görüntülünün tam sürümü, "internete açma" adımıyla birlikte gelir.

**İnternet üzerinden (farklı evlerden):**

- Bilgisayarın sürekli açık kalmalı + modeminde **port yönlendirme** (3000) gerekir, ya da uygulamayı bir **sunucuya** taşırız. Sunucuda HTTPS de otomatik gelir, böylece her şey (sesli/görüntülü dahil) çalışır.
- Hazır olunca söyle, bu adımı birlikte yaparız.

---

## ⚠️ Dürüst Notlar (önemli)

- **Sesli + kamera + ekran paylaşımı** burada tarayıcının kendi teknolojisiyle (WebRTC), **doğrudan kişiden kişiye** çalışır. Bu, **küçük gruplar için (yaklaşık 2-6 kişi)** çok iyidir. 10-20 kişinin **aynı anda kamera açması** için ileride bir "medya sunucusu" eklememiz gerekir — onu sonraki aşamada birlikte yaparız.
- İnternet üzerinden sesli/görüntülünün her ağda sorunsuz çalışması için bazen bir **TURN sunucusu** gerekir (bazı modemler doğrudan bağlantıyı engeller). Gerekirse onu da ekleriz.
- Sunucuyu kapatınca (pencereyi kapatınca) uygulama durur. Tekrar başlatmak için aynı adımlar.
- Mesaj geçmişi şimdilik bilgisayarın hafızasında tutuluyor (sunucu kapanınca silinir). İstersen kalıcı kaydı da ekleriz.

---

## 🚀 Bundan Sonra Ne Ekleyebiliriz?

- Kalıcı mesaj kaydı (sunucu kapansa da kaybolmasın)
- Şifreli giriş / hesap sistemi
- 10-20 kişilik aynı anda görüntülü için medya sunucusu
- Kendi logon, renklerin, kanal ekleme/silme
- İnternete açıp arkadaşları davet etme

Hangisini istersen söyle, sıradaki adımı birlikte kodlarız. 💪
