const router = require('express').Router();
const ctrl = require('../controllers/authController');
const { verificarToken } = require('../middlewares/authMiddleware');
const { uploadPerfil } = require('../middlewares/uploadMiddleware');

// Registro y Login
router.post('/registro', uploadPerfil.single('fotografia_perfil'), ctrl.registrar);
router.post('/login', ctrl.login);

// Perfil del Usuario
router.get('/perfil', verificarToken, ctrl.obtenerPerfil);
router.put('/perfil', verificarToken, uploadPerfil.single('fotografia_perfil'), ctrl.actualizarPerfil);

// 2FA Reconocimiento Facial (Webcam)
router.get('/facial/info-usuario/:identificador', ctrl.obtenerInfoFacialUsuario);
router.post('/facial/registrar-foto', ctrl.registrarFotoDescriptor);
router.post('/facial/registrar', verificarToken, ctrl.registrarFacial);
router.post('/facial/verificar', ctrl.verificarFacial);
router.delete('/facial/desactivar', verificarToken, ctrl.desactivarFacial);

// 2FA WebAuthn (Passkeys / Biometría del dispositivo)
router.get('/webauthn/register-options', verificarToken, ctrl.getWebauthnRegisterOptions);
router.post('/webauthn/register-verify', verificarToken, ctrl.verifyWebauthnRegister);

module.exports = router;
