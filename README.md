# Web del colectivo

Sitio + panel + radio, todo en Cloudflare (gratis): Pages para la web, Functions para la API,
D1 para los datos y R2 para fotos, música y video.

## Archivos
- `public/` — la web
  - `index.html` inicio (hero, consola con cables de colaboración, radio, servicios, drops, fechas, bitácora, galería, únete, booking)
  - `miembro.html` página de cada integrante, se sirve en `/m/<usuario>`
  - `panel.html` login, panel de integrante y admin (`/panel`)
  - `kit.html` press kit imprimible: `/kit` (colectivo) y `/kit/<usuario>`
  - `vivo.html` modo escenario a pantalla completa (`/vivo`)
  - `qr.html` generador de QR para stickers y flyers (`/qr`)
  - `site.js` nombre, tagline, redes, correo, WhatsApp, playlist, tema, URL pública
  - `estilo.css`, `radio.js`, `tema.js`, `qrcode.js`, `manifest.json`, `og.png`, íconos
- `functions/api/[[path]].js` — la API
- `schema.sql` — tablas para una instalación nueva · `migracion.sql` — actualización de una base existente (una sola vez)
- `setup.sh` (una vez) · `deploy.sh` (cada actualización) · `dev.sh` (probar en local) · `respaldo.sh` (copia de la base de datos)

## Quién puede qué
- Cualquiera: ver la web, escuchar la radio, pedir unirse, descargar press kits y agregar fechas a su calendario.
- Integrante: su perfil, foto, WhatsApp, tienda, disponibilidad, fechas, drops, música, servicios, bitácora, galería,
  encender "EN SESIÓN" y elegir el track de la semana.
- Admin: además crea/elimina integrantes, reinicia contraseñas, sube fotos a cualquiera, pone el video del inicio,
  administra la galería del colectivo, borra notas y ve las solicitudes.
