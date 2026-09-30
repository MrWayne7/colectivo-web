-- Perfil de BASHI (la primera cuenta de administrador). Se puede correr varias veces.
UPDATE members SET
  role = 'Beatmaker e ingeniero de grabación vocal',
  specialty = 'Producción de beats, grabación y edición de voces. También dirección, edición de video y fotografía',
  city = 'Bogotá',
  bio = 'Produce beats y graba voces: sesiones de tracking vocal, edición, afinación y comping listos para mezcla. Del mismo estudio salen los videos y las fotos del colectivo.',
  tags = '["Beatmaking","Grabación vocal","Edición de voces","Ableton Live","Video","Foto"]'
WHERE id = (SELECT MIN(id) FROM members WHERE is_admin = 1);

-- Servicios de arranque (sin precio; se completan desde el panel, pestaña Servicios)
INSERT INTO services (member_id, name, price, note)
SELECT m.id, 'Beat exclusivo', '', 'Licencia exclusiva con stems'
FROM (SELECT MIN(id) AS id FROM members WHERE is_admin = 1) m
WHERE NOT EXISTS (SELECT 1 FROM services s WHERE s.member_id = m.id AND s.name = 'Beat exclusivo');

INSERT INTO services (member_id, name, price, note)
SELECT m.id, 'Grabación de voces', '', 'Sesión en estudio con edición, afinación y comping'
FROM (SELECT MIN(id) AS id FROM members WHERE is_admin = 1) m
WHERE NOT EXISTS (SELECT 1 FROM services s WHERE s.member_id = m.id AND s.name = 'Grabación de voces');

INSERT INTO services (member_id, name, price, note)
SELECT m.id, 'Video musical', '', 'Dirección, rodaje y edición'
FROM (SELECT MIN(id) AS id FROM members WHERE is_admin = 1) m
WHERE NOT EXISTS (SELECT 1 FROM services s WHERE s.member_id = m.id AND s.name = 'Video musical');
