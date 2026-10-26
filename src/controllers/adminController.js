const pool = require('../config/db');

// 1. Listar publicaciones con filtro de estado
exports.listarPublicaciones = async (req, res) => {
    try {
        const { estado } = req.query;
        let sql = `
            SELECT p.*, pub.id AS publicacion_id, pub.estado, pub.observaciones, pub.actualizado_en,
                   u.nombre_completo AS propietario, u.correo AS propietario_correo, u.telefono AS propietario_telefono
            FROM propiedades p
            JOIN publicaciones pub ON p.id = pub.propiedad_id
            JOIN usuarios u ON p.usuario_id = u.id
        `;
        const params = [];
        if (estado) {
            sql += ' WHERE pub.estado = ?';
            params.push(estado);
        }
        sql += ' ORDER BY pub.id DESC';

        const [rows] = await pool.query(sql, params);
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// 2. Aprobar o rechazar publicación con observaciones
exports.cambiarEstadoPublicacion = async (req, res) => {
    try {
        const { id } = req.params;
        const { estado, observaciones } = req.body;

        if (!['pendiente', 'aprobada', 'rechazada'].includes(estado)) {
            return res.status(400).json({ error: 'Estado no válido. Debe ser pendiente, aprobada o rechazada.' });
        }

        await pool.query(
            'UPDATE publicaciones SET estado = ?, observaciones = ? WHERE id = ?',
            [estado, observaciones || null, id]
        );
        res.json({ mensaje: `Publicación actualizada a "${estado}" correctamente` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// 3. Eliminar publicación / propiedad que incumpla normas
exports.eliminarPublicacion = async (req, res) => {
    try {
        const { id } = req.params; // ID de publicación
        const [pub] = await pool.query('SELECT propiedad_id FROM publicaciones WHERE id = ?', [id]);
        if (pub.length === 0) return res.status(404).json({ error: 'Publicación no encontrada' });

        const propiedadId = pub[0].propiedad_id;
        await pool.query('DELETE FROM propiedades WHERE id = ?', [propiedadId]);
        res.json({ mensaje: 'Publicación y propiedad eliminadas del sistema' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// 4. Listar usuarios registrados
exports.listarUsuarios = async (req, res) => {
    try {
        const [usuarios] = await pool.query(`
            SELECT u.id, u.nombre_completo, u.correo, u.telefono, u.rol, u.creado_en,
                   COUNT(p.id) AS total_propiedades
            FROM usuarios u
            LEFT JOIN propiedades p ON u.id = p.usuario_id
            GROUP BY u.id
            ORDER BY u.id ASC
        `);
        res.json(usuarios);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// 5. Cambiar rol de usuario
exports.cambiarRolUsuario = async (req, res) => {
    try {
        const { id } = req.params;
        const { rol } = req.body;

        if (!['usuario', 'administrador'].includes(rol)) {
            return res.status(400).json({ error: 'Rol no válido' });
        }

        if (parseInt(id) === req.usuario.id) {
            return res.status(400).json({ error: 'No puedes cambiar tu propio rol' });
        }

        await pool.query('UPDATE usuarios SET rol = ? WHERE id = ?', [rol, id]);
        res.json({ mensaje: `Rol del usuario actualizado a ${rol}` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// 6. Eliminar cuenta de usuario
exports.eliminarUsuario = async (req, res) => {
    try {
        const { id } = req.params;
        if (parseInt(id) === req.usuario.id) {
            return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta de administrador' });
        }

        await pool.query('DELETE FROM usuarios WHERE id = ?', [id]);
        res.json({ mensaje: 'Usuario eliminado exitosamente' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// 7. Estadísticas generales
exports.obtenerEstadisticas = async (req, res) => {
    try {
        const [[usuariosRow]] = await pool.query('SELECT COUNT(*) AS total_usuarios FROM usuarios');
        const [[propiedadesRow]] = await pool.query('SELECT COUNT(*) AS total_propiedades, COALESCE(AVG(precio), 0) AS precio_promedio FROM propiedades');
        const [estadosRows] = await pool.query('SELECT estado, COUNT(*) AS cantidad FROM publicaciones GROUP BY estado');

        const pendientes = estadosRows.find(r => r.estado === 'pendiente')?.cantidad || 0;
        const aprobadas = estadosRows.find(r => r.estado === 'aprobada')?.cantidad || 0;
        const rechazadas = estadosRows.find(r => r.estado === 'rechazada')?.cantidad || 0;

        res.json({
            total_usuarios: usuariosRow.total_usuarios,
            total_propiedades: propiedadesRow.total_propiedades,
            precio_promedio: Math.round(propiedadesRow.precio_promedio),
            pendientes,
            aprobadas,
            rechazadas
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};
