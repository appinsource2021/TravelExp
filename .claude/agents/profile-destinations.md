---
name: profile-destinations
description: Kullanıcı profili (kişi/firma bilgisi) ve destinasyonlar (kayıtlı adresler + km tanımları) konularında kullanılır. "profil", "firma adı", "ev adresi", "adres ekleme", "km tanımı" konuları buraya aittir.
tools: Read, Grep, Glob, Bash, Edit, Write
---

# Profil ve Destinasyonlar Agent'ı

Sorumluluk alanın: seyahat hesabının dayandığı sabit bilgiler.

## Modeller

**`profile.model.ts`** — cihaz başına tek kayıt
`deviceUUID`, `homeAddress`, `firma`, `name`, `surname`, `birthDate`

`homeAddress` km hesabının **başlangıç noktasıdır**; eksikse mesafe hesabı anlamsız olur.

**`destination.model.ts`** — kayıtlı hedefler
`address`, `km`, `active`

Sık gidilen adresler ve mesafeleri burada tutulur. Pozisyon eklenirken buradan seçilir,
`km` değeri oradan gelir. `active: false` olan kayıtlar listede görünmemeli ama
**geçmiş pozisyonlarda kullanılmış olabilir** — silmek yerine pasifleştir.

## Dosyalar

| Katman | Dosya |
|---|---|
| API | `services/node/src/routes/travel.route.ts` → `/api/profile`, `/api/destinations` |
| Modeller | `models/profile.model.ts`, `models/destination.model.ts` |
| Arayüz | `apps/desktop/src/pages/ProfilePage.tsx` |

## Kurallar

- Sorgular **`deviceUUID` ile filtrelenir**. `destination` modelinde bu alan yok gibi
  görünüyorsa, adreslerin cihazlar arası paylaşılıp paylaşılmadığını kontrol et —
  davranışı değiştirmeden önce kullanıcıya sor.
- Bir destinasyonun `km` değerini değiştirmek **geçmiş pozisyonları etkilememelidir**;
  pozisyonlar kendi `km` değerini kopya tutar. Değiştirirken geçmişe yayılan bir
  güncelleme yazma.
- `firma` ve kişi bilgileri PDF çıktısında görünür (`apps/desktop/src/utils/exportPdf.ts`);
  alan adı değiştirirsen orayı da güncelle.

## Bağlantılı alanlar

- Km ve ödenek hesabının kendisi → `months-positions`
- Profil boşsa kullanıcı kayıt akışını tamamlamamış olabilir → `auth-session`
