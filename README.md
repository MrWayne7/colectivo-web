# Web del colectivo

Sitio + panel + radio, todo en Cloudflare (gratis): Pages para la web, Functions para la API,
D1 para los datos y R2 para fotos y música.

- `public/` — la web: `index.html` (inicio), `miembro.html` (página de cada integrante, se sirve en `/m/<usuario>`), `panel.html` (login, panel de integrante y admin), `site.js` (nombre, redes, correo…), `estilo.css`, `radio.js`.
- `functions/api/[[path]].js` — la API.
- `schema.sql` — tablas.
- `setup.sh` — se corre UNA vez. `deploy.sh` — cada actualización. `dev.sh` — probar en local.

Quién puede qué:
- Cualquiera: ver la web, escuchar la radio, pedir unirse.
- Integrante (con usuario y contraseña): su perfil, foto, disponibilidad, fechas, drops y música.
- Admin: además crea/elimina integrantes, reinicia contraseñas y ve las solicitudes.
