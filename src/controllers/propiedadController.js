const pool = require('../config/db');

// 1. Crear propiedad (Acepta archivos reales subidos por Multer y guarda en BD)
exports.crearPropiedad = async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const { titulo, descripcion, ubicacion, precio, superficie_terreno, superficie_construccion, habitaciones, banos, contacto_vendedor } = req.body;
        
        if (!titulo || !descripcion || !ubicacion || !precio || !contacto_vendedor) {
            await conn.rollback();
            return res.status(400).json({ error: 'Todos los campos obligatorios deben ser completados' });
        }

        // Obtener fotografías reales subidas
        let fotos = [];
        if (req.files && Array.isArray(req.files) && req.files.length > 0) {
            fotos = req.files.map(file => `/uploads/propiedades/${file.filename}`);
        } else if (req.body.fotografias) {
            fotos = Array.isArray(req.body.fotografias) ? req.body.fotografias : JSON.parse(req.body.fotografias || '[]');
        }

        if (fotos.length < 3) {
            await conn.rollback();
            return res.status(400).json({ error: 'El instrumento exige subir al menos 3 fotografías reales de la propiedad' });
        }

        const [resProp] = await conn.query(
            'INSERT INTO propiedades (usuario_id, titulo, descripcion, ubicacion, precio, superficie_terreno, superficie_construccion, habitaciones, banos, contacto_vendedor) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [req.usuario.id, titulo.trim(), descripcion.trim(), ubicacion.trim(), parseFloat(precio), superficie_terreno ? parseFloat(superficie_terreno) : null, superficie_construccion ? parseFloat(superficie_construccion) : null, parseInt(habitaciones) || 1, parseInt(banos) || 1, contacto_vendedor.trim()]
        );
        const propiedadId = resProp.insertId;

        for (let url of fotos) {
            if (url && url.trim()) {
                await conn.query('INSERT INTO fotografias (propiedad_id, url_imagen) VALUES (?, ?)', [propiedadId, url.trim()]);
            }
        }

        await conn.query('INSERT INTO publicaciones (propiedad_id, estado, observaciones) VALUES (?, "pendiente", "En espera de validación por administración")', [propiedadId]);
        await conn.commit();
        res.status(201).json({ mensaje: 'Propiedad con fotografías reales enviada a revisión exitosamente', propiedadId });
    } catch (e) {
        await conn.rollback();
        res.status(500).json({ error: e.message });
    } finally {
        conn.release();
    }
};

// 2. Obtener catálogo público de propiedades (Solo aprobadas por administración)
exports.obtenerPublicas = async (req, res) => {
    try {
        const { ubicacion, precioMax, habitaciones } = req.query;
        let sql = `
            SELECT p.*, GROUP_CONCAT(f.url_imagen) AS fotografias, u.nombre_completo AS propietario_nombre
            FROM propiedades p
            JOIN publicaciones pub ON p.id = pub.propiedad_id
            LEFT JOIN fotografias f ON p.id = f.propiedad_id
            JOIN usuarios u ON p.usuario_id = u.id
            WHERE pub.estado = 'aprobada'
        `;
        const params = [];

        if (ubicacion) {
            sql += ' AND (p.ubicacion LIKE ? OR p.titulo LIKE ?)';
            params.push(`%${ubicacion}%`, `%${ubicacion}%`);
        }
        if (precioMax) {
            sql += ' AND p.precio <= ?';
            params.push(parseFloat(precioMax));
        }
        if (habitaciones) {
            sql += ' AND p.habitaciones >= ?';
            params.push(parseInt(habitaciones));
        }

        sql += ' GROUP BY p.id ORDER BY p.id DESC';

        const [props] = await pool.query(sql, params);
        const resultado = props.map(p => ({
            ...p,
            fotografias: p.fotografias ? p.fotografias.split(',') : []
        }));
        res.json(resultado);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// 3. Obtener detalle de una propiedad
exports.obtenerPorId = async (req, res) => {
    try {
        const { id } = req.params;
        const [props] = await pool.query(`
            SELECT p.*, pub.estado AS publicacion_estado, pub.observaciones, GROUP_CONCAT(f.url_imagen) AS fotografias, u.nombre_completo AS propietario_nombre, u.correo AS propietario_correo
            FROM propiedades p
            JOIN publicaciones pub ON p.id = pub.propiedad_id
            LEFT JOIN fotografias f ON p.id = f.propiedad_id
            JOIN usuarios u ON p.usuario_id = u.id
            WHERE p.id = ?
            GROUP BY p.id
        `, [id]);

        if (props.length === 0) return res.status(404).json({ error: 'Propiedad no encontrada' });
        const p = props[0];
        p.fotografias = p.fotografias ? p.fotografias.split(',') : [];
        res.json(p);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// 4. Mis Propiedades (Propiedades del usuario autenticado)
exports.obtenerMisPropiedades = async (req, res) => {
    try {
        const [props] = await pool.query(`
            SELECT p.*, pub.id AS publicacion_id, pub.estado AS publicacion_estado, pub.observaciones, GROUP_CONCAT(f.url_imagen) AS fotografias
            FROM propiedades p
            JOIN publicaciones pub ON p.id = pub.propiedad_id
            LEFT JOIN fotografias f ON p.id = f.propiedad_id
            WHERE p.usuario_id = ?
            GROUP BY p.id
            ORDER BY p.id DESC
        `, [req.usuario.id]);

        const resultado = props.map(p => ({
            ...p,
            fotografias: p.fotografias ? p.fotografias.split(',') : []
        }));
        res.json(resultado);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// 5. Editar y actualizar propia propiedad
exports.actualizarPropiedad = async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const { id } = req.params;
        const { titulo, descripcion, ubicacion, precio, superficie_terreno, superficie_construccion, habitaciones, banos, contacto_vendedor } = req.body;

        const [check] = await conn.query('SELECT * FROM propiedades WHERE id = ?', [id]);
        if (check.length === 0) {
            await conn.rollback();
            return res.status(404).json({ error: 'Propiedad no encontrada' });
        }
        if (check[0].usuario_id !== req.usuario.id && req.usuario.rol !== 'administrador') {
            await conn.rollback();
            return res.status(403).json({ error: 'No tienes autorización para editar esta propiedad' });
        }

        await conn.query(`
            UPDATE propiedades SET
                titulo = ?, descripcion = ?, ubicacion = ?, precio = ?,
                superficie_terreno = ?, superficie_construccion = ?,
                habitaciones = ?, banos = ?, contacto_vendedor = ?
            WHERE id = ?
        `, [titulo, descripcion, ubicacion, precio, superficie_terreno, superficie_construccion, habitaciones, banos, contacto_vendedor, id]);

        // Si se subieron nuevas fotografías reales
        let nuevasFotos = [];
        if (req.files && Array.isArray(req.files) && req.files.length > 0) {
            nuevasFotos = req.files.map(f => `/uploads/propiedades/${f.filename}`);
        } else if (req.body.fotografias) {
            nuevasFotos = Array.isArray(req.body.fotografias) ? req.body.fotografias : JSON.parse(req.body.fotografias || '[]');
        }

        if (nuevasFotos.length >= 3) {
            await conn.query('DELETE FROM fotografias WHERE propiedad_id = ?', [id]);
            for (let url of nuevasFotos) {
                if (url && url.trim()) {
                    await conn.query('INSERT INTO fotografias (propiedad_id, url_imagen) VALUES (?, ?)', [id, url.trim()]);
                }
            }
        }

        if (req.usuario.rol !== 'administrador') {
            await conn.query('UPDATE publicaciones SET estado = "pendiente", observaciones = "Actualizada por el usuario, pendiente de re-evaluación" WHERE propiedad_id = ?', [id]);
        }

        await conn.commit();
        res.json({ mensaje: 'Propiedad actualizada exitosamente' });
    } catch (e) {
        await conn.rollback();
        res.status(500).json({ error: e.message });
    } finally {
        conn.release();
    }
};

// 6. Eliminar propia propiedad
exports.eliminarPropiedad = async (req, res) => {
    try {
        const { id } = req.params;
        const [check] = await pool.query('SELECT * FROM propiedades WHERE id = ?', [id]);
        if (check.length === 0) return res.status(404).json({ error: 'Propiedad no encontrada' });

        if (check[0].usuario_id !== req.usuario.id && req.usuario.rol !== 'administrador') {
            return res.status(403).json({ error: 'No tienes autorización para eliminar esta propiedad' });
        }

        await pool.query('DELETE FROM propiedades WHERE id = ?', [id]);
        res.json({ mensaje: 'Propiedad eliminada con éxito' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};
