const pool = require('./config/db');
const bcrypt = require('bcrypt');

async function seed() {
    try {
        const [users] = await pool.query('SELECT id FROM usuarios LIMIT 1');
        if (users.length > 0) {
            console.log('La base de datos ya contiene datos iniciales.');
            process.exit(0);
        }

        console.log('Sembrando datos iniciales...');
        const passAdmin = await bcrypt.hash('admin123', 10);
        const passUser = await bcrypt.hash('usuario123', 10);

        const [adminRes] = await pool.query(
            'INSERT INTO usuarios (nombre_completo, correo, telefono, contrasena, rol) VALUES (?, ?, ?, ?, ?)',
            ['Administrador del Sistema', 'admin@inmobiliaria.com', '+52 999 123 4567', passAdmin, 'administrador']
        );

        const [userRes] = await pool.query(
            'INSERT INTO usuarios (nombre_completo, correo, telefono, contrasena, rol) VALUES (?, ?, ?, ?, ?)',
            ['Carlos Mendoza', 'carlos@inmobiliaria.com', '+52 999 765 4321', passUser, 'usuario']
        );

        const props = [
            {
                titulo: 'Residencia Moderna con Alberca y Jardín Zen',
                descripcion: 'Espectacular residencia de diseño contemporáneo ubicada en zona residencial privada. Cuenta con acabados de lujo en mármol, cocina integral equipada con isla, alberca infinity climatizada, terraza techada y paneles solares instalados.',
                ubicacion: 'Fracc. Altabrisa, Mérida, Yucatán',
                precio: 4850000.00,
                superficie_terreno: 360.00,
                superficie_construccion: 290.00,
                habitaciones: 4,
                banos: 4,
                contacto_vendedor: 'Carlos Mendoza - Tel: 999 765 4321',
                fotos: [
                    'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80',
                    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80',
                    'https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&w=1200&q=80'
                ]
            },
            {
                titulo: 'Penthouse Exclusivo con Vista Panorámica',
                descripcion: 'Penthouse de doble altura con impresionantes vistas panorámicas de la ciudad. Equipado con domótica inteligente, elevador privado directo al departamento, balcón perimetral y amenidades tipo resort (gimnasio, coworking y roof garden).',
                ubicacion: 'Montebello Luxury Towers, Mérida, Yucatán',
                precio: 6200000.00,
                superficie_terreno: 210.00,
                superficie_construccion: 210.00,
                habitaciones: 3,
                banos: 3,
                contacto_vendedor: 'Carlos Mendoza - Tel: 999 765 4321',
                fotos: [
                    'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80',
                    'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80',
                    'https://images.unsplash.com/photo-1600566752355-35792bedcfea?auto=format&fit=crop&w=1200&q=80'
                ]
            },
            {
                titulo: 'Casa Campestre Sustentable en Privada Exclusiva',
                descripcion: 'Hermosa villa en entorno natural con amplias áreas verdes, árboles maduros, cochera techada para 3 autos, sistema de captación pluvial y carpintería de cedro macizo en toda la casa.',
                ubicacion: 'Cholul Norte, Mérida, Yucatán',
                precio: 3650000.00,
                superficie_terreno: 450.00,
                superficie_construccion: 220.00,
                habitaciones: 3,
                banos: 2,
                contacto_vendedor: 'Carlos Mendoza - Tel: 999 765 4321',
                fotos: [
                    'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=1200&q=80',
                    'https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=1200&q=80',
                    'https://images.unsplash.com/photo-1600573472591-ee6b68d14c68?auto=format&fit=crop&w=1200&q=80'
                ]
            }
        ];

        for (const p of props) {
            const [resProp] = await pool.query(
                'INSERT INTO propiedades (usuario_id, titulo, descripcion, ubicacion, precio, superficie_terreno, superficie_construccion, habitaciones, banos, contacto_vendedor) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [userRes.insertId, p.titulo, p.descripcion, p.ubicacion, p.precio, p.superficie_terreno, p.superficie_construccion, p.habitaciones, p.banos, p.contacto_vendedor]
            );
            const propId = resProp.insertId;

            for (const foto of p.fotos) {
                await pool.query('INSERT INTO fotografias (propiedad_id, url_imagen) VALUES (?, ?)', [propId, foto]);
            }

            await pool.query('INSERT INTO publicaciones (propiedad_id, estado, observaciones) VALUES (?, "aprobada", "Publicación aprobada por defecto")', [propId]);
        }

        console.log('✅ Base de datos sembrada con éxito.');
        process.exit(0);
    } catch (err) {
        console.error('Error al sembrar:', err);
        process.exit(1);
    }
}

seed();
