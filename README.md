# Voxelia

Sandbox voxel yang berjalan di peramban. Satu berkas HTML, **nol aset eksternal** —
setiap tekstur, model, dan bunyi dibangkitkan oleh kode saat halaman dimuat.

**Main:** <https://voxelia.skolain.id>

Butuh WebGL2. Tidak ada backend, tidak ada build step yang wajib, tidak ada
gambar atau berkas audio satu pun di repo ini.

## Isi

- Terrain prosedural tak terbatas dengan 12 bioma, gua, bijih berlapis kedalaman,
  danau, pantai, dan pegunungan bersalju
- 35 jenis blok — gali dan taruh, dengan riwayat suntingan tersimpan di peramban
- Siklus siang–malam penuh: matahari, bulan, bintang, senja, dan awan kotak
- 6 penjelajah 3D yang bisa dipilih dan diputar di menu, tampak di sudut pandang orang ketiga
- Air transparan berombak, tanaman yang bergoyang, blok bercahaya, lampu kepala
- Kontrol papan ketik, mouse, dan sentuh

## Jalankan lokal

```bash
git clone https://github.com/rochmanramadhani/voxelia.git
cd voxelia
python3 -m http.server 8788
# buka http://localhost:8788
```

`index.html` hasil build ikut di-commit, jadi bisa juga langsung dibuka tanpa
menjalankan apa pun. Kalau menyunting `src/`, bangun ulang dengan `./build.sh`.

## Catatan teknis

Empat hal yang menurut saya paling layak dibaca dari kode ini.

### Tekstur pakai array layer, bukan atlas

Atlas tekstur klasik punya masalah kronis: begitu mipmap dibangkitkan, texel
antar-tile saling bocor, dan blok yang jauh berubah jadi bubur warna. Voxelia
memakai `DataArrayTexture` WebGL2 — 41 tekstur 16×16, satu layer masing-masing.
Tiap layer punya rantai mipmap sendiri, jadi tidak ada tetangga untuk dibocori.
Hasilnya tetap tajam sampai batas pandang tanpa perlu padding atau inset UV.

Lihat [`src/js/20-textures.js`](src/js/20-textures.js).

### 10 byte per vertex

Posisi disimpan `Uint16` dengan skala 1/8 (6 byte), sisanya satu atribut
`Uint8×4` yang memuat ambient occlusion, cahaya langit, indeks layer tekstur,
dan bit-bit penanda — arah sisi, sudut UV, dan bendera goyang. Sepuluh byte per
vertex, tanpa atribut `position`, `normal`, atau `uv` bawaan sama sekali;
normal dan UV direkonstruksi di shader dari indeks sisi. Bounding sphere diisi
manual karena geometrinya tidak punya atribut yang bisa dihitung Three.js.

Lihat [`src/js/40-mesher.js`](src/js/40-mesher.js).

### Cahaya langit yang tidak berjahit antar chunk

Perambatan cahaya voxel biasanya pakai BFS. Masalahnya, BFS per-chunk hanya
melihat tetangga sejauh padding-nya, jadi dua chunk bersebelahan bisa
menyimpulkan nilai berbeda untuk blok yang sama — muncul jahitan yang kelihatan
jelas di dalam gua.

Di sini cahaya langit adalah **fungsi murni dari tinggi kolom**: `1 -
(puncak - y) × 0.11`, dijepit di bawah. Karena tidak bergantung pada urutan
atau batas chunk, dua chunk mustahil tidak sepakat. Konsekuensinya ruangan
tertutup jadi gelap total dan butuh Lampu Batu — itu justru yang diinginkan.
Blok tembus pandang seperti daun dilewati saat menghitung puncak kolom, jadi
lantai hutan tetap terang.

### Dua bug yang menarik

**Kamera terguling.** Orientasi disusun `rotateY(yaw)` lalu `rotateX(pitch)`,
kemudian `rotation.z` ditimpa untuk efek goyang langkah. Euler bawaan Three.js
berurutan XYZ, sedangkan orientasi FPS itu YXZ — komponen `z` yang benar bukan
nol. Pada yaw 1,0 rad dan pitch 0,5 rad nilainya −0,64 rad; ditimpa dengan
−0,02. Akibatnya kamera terguling dengan sudut yang berubah tiap kali pemain
menoleh, dan bermain sepuluh detik saja sudah bikin pusing. Perbaikannya satu
baris: `camera.rotation.order = 'YXZ'`.

**Pemuatan menggantung di tab latar belakang.** Rutinitas pemuatan menyerahkan
kendali antar-langkah dengan `await requestAnimationFrame`. Peramban
menghentikan rAF di tab yang tidak terlihat, jadi membuka Voxelia di tab
belakang membuatnya berhenti selamanya di langkah pertama tanpa satu pun galat
di konsol. Sekarang ada fallback `setTimeout` 60 ms.

## Struktur

```
src/head.html      antarmuka: DOM + CSS
src/js/00-util     PRNG ber-seed, Perlin noise, helper
src/js/10-blocks   registri 35 blok dan 41 layer tekstur
src/js/20-textures generator tekstur prosedural -> DataArrayTexture
src/js/30-world    chunk, generator terrain, bioma, pohon, suntingan
src/js/40-mesher   face culling, ambient occlusion, pengemasan vertex
src/js/50-materials shader terrain, cairan, langit, awan
src/js/55-models   model karakter, geometri item, pemanggangan ikon
src/js/60-chunks   pemuatan chunk beranggaran waktu
src/js/65-player   tabrakan AABB, fisika, raycast voxel DDA
src/js/70-ui       menu, pengaturan, hotbar, inventaris
src/js/80-audio    efek suara sintetis (WebAudio, tanpa berkas)
src/js/90-main     perakitan, siklus siang-malam, gelung utama
build.sh           menggabungkan semuanya jadi index.html
```

Satu-satunya dependensi runtime adalah Three.js r160 dari cdnjs, ditambah dua
keluarga huruf dari Google Fonts.

## Lisensi

[MIT](LICENSE).

## Catatan pembuatan

Ditulis dalam satu sesi bersama Claude Opus 5 di Claude Code, dari satu
permintaan: "buatkan website 3D, bebas, mungkin seperti Minecraft".

Bagian yang menurut saya patut dicatat bukan bahwa kodenya ditulis model,
melainkan bahwa dua bug di atas ketahuan lewat **verifikasi terukur**, bukan
lewat melihat tangkapan layar. Kemiringan kamera diuji dengan memeriksa
komponen Y dari vektor kanan kamera pada lima kombinasi yaw/pitch — nilainya
harus tepat nol — dan arah kamera dibandingkan dengan arah raycast supaya
crosshair benar-benar menunjuk blok yang tergali. Bug tab latar belakang
justru muncul sendiri saat pane peramban kebetulan tersembunyi selama
pengujian.
