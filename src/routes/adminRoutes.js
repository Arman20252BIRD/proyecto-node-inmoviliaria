const router = require('express').Router();
const ctrl = require('../controllers/adminController');
const { verificarToken, esAdmin } = require('../middlewares/authMiddleware');

// Todas las rutas de administración requieren token válido y rol 'administrador'
router.use(verificarToken, esAdmin);

// Publicaciones
router.get('/publicaciones', ctrl.listarPublicaciones);
router.put('/publicaciones/:id/estado', ctrl.cambiarEstadoPublicacion);
router.delete('/publicaciones/:id', ctrl.eliminarPublicacion);

// Usuarios
router.get('/usuarios', ctrl.listarUsuarios);
router.put('/usuarios/:id/rol', ctrl.cambiarRolUsuario);
router.delete('/usuarios/:id', ctrl.eliminarUsuario);

// Estadísticas
router.get('/estadisticas', ctrl.obtenerEstadisticas);

module.exports = router;