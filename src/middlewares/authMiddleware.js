const jwt = require('jsonwebtoken');

exports.verificarToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token no proporcionado' });

    try {
        req.usuario = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (error) {
        res.status(403).json({ error: 'Token inválido o expirado' });
    }
};

exports.esAdmin = (req, res, next) => {
    if (req.usuario && req.usuario.rol === 'administrador') {
        next();
    } else {
        res.status(403).json({ error: 'Se requieren permisos de Administrador' });
    }
};