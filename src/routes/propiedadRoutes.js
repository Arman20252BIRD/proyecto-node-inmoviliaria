const router = require('express').Router();
const ctrl = require('../controllers/propiedadController');
const { verificarToken } = require('../middlewares/authMiddleware');
const { uploadPropiedades } = require('../middlewares/uploadMiddleware');

router.get('/publicas', ctrl.obtenerPublicas);
router.get('/mis-propiedades', verificarToken, ctrl.obtenerMisPropiedades);
router.get('/:id', ctrl.obtenerPorId);

// Subida de imágenes reales de propiedades (hasta 10 fotos)
router.post('/', verificarToken, uploadPropiedades.array('fotografias', 10), ctrl.crearPropiedad);
router.put('/:id', verificarToken, uploadPropiedades.array('fotografias', 10), ctrl.actualizarPropiedad);

router.delete('/:id', verificarToken, ctrl.eliminarPropiedad);

module.exports = router;