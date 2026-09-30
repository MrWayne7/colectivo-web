-- Perfil de BASHI (la primera cuenta de administrador). Ajusta lo que quieras antes de correrlo.
UPDATE members SET
  role = 'Director, editor y fotógrafo',
  specialty = 'Videos musicales, comerciales, reels y foto',
  city = 'Bogotá',
  bio = 'Dirige, edita y fotografía. Trabaja entre Colombia, Santo Domingo y Estados Unidos con artistas y marcas.',
  tags = '["Dirección","Edición","Foto","Ableton Live"]'
WHERE id = (SELECT MIN(id) FROM members WHERE is_admin = 1);
