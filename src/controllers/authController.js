const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { generateRegistrationOptions, verifyRegistrationResponse } = require('@simplewebauthn/server');

// Helper: Calcular similitud coseno entre dos vectores numéricos
function calcularSimilitudCoseno(vecA, vecB) {
    if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length !== vecB.length || vecA.length === 0) {
        return 0;
    }
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Helper: Calcular distancia euclidiana (usada por face-api.js)
function calcularDistanciaEuclidiana(vecA, vecB) {
    if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length !== vecB.length || vecA.length === 0) {
        return 1.0;
    }
    let sum = 0;
    for (let i = 0; i < vecA.length; i++) {
        const diff = vecA[i] - vecB[i];
        sum += diff * diff;
    }
    return Math.sqrt(sum);
}

// 1. Registro de usuario con formulario completo, hash seguro y extracción facial
exports.registrar = async (req, res) => {
    try {
        const { nombre_completo, username, correo, email, telefono, contrasena, confirm_contrasena, fotografia_perfil, rol, descriptor } = req.body;
        
        const nombreFinal = (nombre_completo || username || '').trim();
        const correoFinal = (correo || email || '').trim().toLowerCase();

        if (!nombreFinal || !correoFinal || !contrasena) {
            return res.status(400).json({ error: 'Nombre completo / usuario, correo y contraseña son obligatorios' });
        }

        if (confirm_contrasena && contrasena !== confirm_contrasena) {
            return res.status(400).json({ error: 'Las contraseñas ingresadas no coinciden' });
        }

        if (contrasena.length < 8) {
            return res.status(400).json({ error: 'La contraseña debe contener al menos 8 caracteres para garantizar su seguridad' });
        }

        const [existe] = await pool.query('SELECT id FROM usuarios WHERE correo = ?', [correoFinal]);
        if (existe.length > 0) {
            return res.status(400).json({ error: 'Este correo electrónico ya se encuentra registrado' });
        }

        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(contrasena, salt);
        const rolAsignado = (rol === 'administrador') ? 'administrador' : 'usuario';
        const fotoFinal = req.file ? `/uploads/perfiles/${req.file.filename}` : (fotografia_perfil ? fotografia_perfil.trim() : null);

        const [result] = await pool.query(
            'INSERT INTO usuarios (nombre_completo, correo, telefono, contrasena, fotografia_perfil, rol) VALUES (?, ?, ?, ?, ?, ?)',
            [nombreFinal, correoFinal, telefono ? telefono.trim() : null, hash, fotoFinal, rolAsignado]
        );

        const nuevoUsuarioId = result.insertId;

        // Si se envió el descriptor facial extraído de la fotografía seleccionada, guardarlo en autenticación
        let tieneFacialRegistrado = false;
        if (descriptor) {
            try {
                const vectorDesc = Array.isArray(descriptor) ? descriptor : JSON.parse(descriptor);
                if (Array.isArray(vectorDesc) && vectorDesc.length > 0) {
                    const descStr = JSON.stringify(vectorDesc);
                    const hashSeguro = crypto.createHash('sha256').update(descStr).digest('hex');
                    await pool.query(
                        'INSERT INTO autenticacion (usuario_id, metodo, identificador_externo, datos_secretos) VALUES (?, "reconocimiento_facial", ?, ?)',
                        [nuevoUsuarioId, hashSeguro, descStr]
                    );
                    tieneFacialRegistrado = true;
                }
            } catch (err) {
                console.error('Error al guardar descriptor facial inicial:', err);
            }
        }

        const token = jwt.sign({ id: nuevoUsuarioId, rol: rolAsignado }, process.env.JWT_SECRET, { expiresIn: '8h' });

        res.status(201).json({
            mensaje: tieneFacialRegistrado 
                ? 'Cuenta creada con éxito y reconocimiento facial 2FA activado automáticamente.'
                : 'Cuenta creada con éxito. Procede a registrar tu rostro para activar el segundo factor (2FA).',
            usuarioId: nuevoUsuarioId,
            tieneFacial: tieneFacialRegistrado,
            token,
            usuario: {
                id: nuevoUsuarioId,
                nombre: nombreFinal,
                correo: correoFinal,
                telefono: telefono || null,
                fotografia_perfil: fotoFinal,
                rol: rolAsignado
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// 2. Inicio de sesión real con verificación de 2FA
exports.login = async (req, res) => {
    try {
        const { correo, username, usuario, contrasena } = req.body;
        const loginId = (correo || username || usuario || '').trim();

        if (!loginId || !contrasena) {
            return res.status(400).json({ error: 'Ingresa correo/usuario y contraseña' });
        }

        const [users] = await pool.query(
            'SELECT * FROM usuarios WHERE correo = ? OR nombre_completo = ?', 
            [loginId.toLowerCase(), loginId]
        );

        if (users.length === 0) {
            return res.status(401).json({ error: 'Credenciales inválidas. Verifica tu correo y contraseña.' });
        }
        
        const user = users[0];
        const valid = await bcrypt.compare(contrasena, user.contrasena);
        if (!valid) {
            return res.status(401).json({ error: 'Credenciales inválidas. Verifica tu correo y contraseña.' });
        }

        // Consultar métodos de 2FA configurados en la base de datos
        const [auths] = await pool.query('SELECT * FROM autenticacion WHERE usuario_id = ?', [user.id]);
        const facialAuth = auths.find(a => a.metodo === 'reconocimiento_facial');
        const webauthnAuth = auths.find(a => a.metodo === 'webauthn');

        // Si tiene biometría facial registrada O fotografía de perfil subida en el registro, activar OBLIGATORIAMENTE el 2FA Facial
        if (facialAuth || user.fotografia_perfil) {
            let desc = null;
            if (facialAuth && facialAuth.datos_secretos) {
                try { desc = JSON.parse(facialAuth.datos_secretos); } catch(err) {}
            }

            return res.json({
                requiere2FA: true,
                metodo2FA: 'reconocimiento_facial',
                usuarioId: user.id,
                nombre: user.nombre_completo,
                foto: user.fotografia_perfil,
                descriptor: desc,
                mensaje: 'Identidad protegida: coloca tu rostro frente a la cámara web para verificar tu acceso (2FA).'
            });
        }

        if (webauthnAuth) {
            return res.json({
                requiere2FA: true,
                metodo2FA: 'webauthn',
                usuarioId: user.id,
                mensaje: 'Se requiere verificación biométrica WebAuthn.'
            });
        }

        // Si aún no tiene 2FA configurado, otorgar acceso e indicar que puede activarlo
        const token = jwt.sign({ id: user.id, rol: user.rol }, process.env.JWT_SECRET, { expiresIn: '8h' });
        res.json({
            requiere2FA: false,
            token,
            usuario: {
                id: user.id,
                nombre: user.nombre_completo,
                correo: user.correo,
                telefono: user.telefono,
                fotografia_perfil: user.fotografia_perfil,
                rol: user.rol
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// Obtener info facial del usuario para sincronizar cámara web por username
exports.obtenerInfoFacialUsuario = async (req, res) => {
    try {
        const { identificador } = req.params;
        if (!identificador) return res.status(400).json({ error: 'Identificador requerido' });

        const [users] = await pool.query(
            'SELECT id, nombre_completo, correo, fotografia_perfil, rol FROM usuarios WHERE correo = ? OR nombre_completo = ?',
            [identificador.toLowerCase().trim(), identificador.trim()]
        );
        if (users.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

        const user = users[0];
        const [auths] = await pool.query(
            'SELECT metodo, datos_secretos FROM autenticacion WHERE usuario_id = ? AND metodo = "reconocimiento_facial"',
            [user.id]
        );

        let desc = null;
        if (auths.length > 0 && auths[0].datos_secretos) {
            try { desc = JSON.parse(auths[0].datos_secretos); } catch (e) {}
        }

        res.json({
            usuarioId: user.id,
            nombre: user.nombre_completo,
            correo: user.correo,
            foto: user.fotografia_perfil,
            tieneDescriptor: !!desc,
            descriptor: desc
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// Guardar descriptor extraído de la foto de perfil en el cliente
exports.registrarFotoDescriptor = async (req, res) => {
    try {
        const { usuarioId, descriptor } = req.body;
        if (!usuarioId || !descriptor) return res.status(400).json({ error: 'Datos incompletos' });
        const vectorDesc = Array.isArray(descriptor) ? descriptor : JSON.parse(descriptor);
        const descStr = JSON.stringify(vectorDesc);
        const hashSeguro = crypto.createHash('sha256').update(descStr).digest('hex');

        await pool.query('DELETE FROM autenticacion WHERE usuario_id = ? AND metodo = "reconocimiento_facial"', [usuarioId]);
        await pool.query(
            'INSERT INTO autenticacion (usuario_id, metodo, identificador_externo, datos_secretos) VALUES (?, "reconocimiento_facial", ?, ?)',
            [usuarioId, hashSeguro, descStr]
        );
        res.json({ exito: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// 3. REGISTRO FACIAL BIOMÉTRICO (WEBCAM O DESCRIPTOR)
exports.registrarFacial = async (req, res) => {
    try {
        const { descriptor } = req.body;
        const vectorDesc = Array.isArray(descriptor) ? descriptor : (descriptor ? JSON.parse(descriptor) : null);

        if (!vectorDesc || !Array.isArray(vectorDesc) || vectorDesc.length === 0) {
            return res.status(400).json({ error: 'Descriptor biométrico no válido o no detectado' });
        }

        const userId = req.usuario.id;
        const descriptorStr = JSON.stringify(vectorDesc);
        const hashSeguro = crypto.createHash('sha256').update(descriptorStr).digest('hex');

        // Eliminar registro anterior si existía para renovar la biometría
        await pool.query('DELETE FROM autenticacion WHERE usuario_id = ? AND metodo = "reconocimiento_facial"', [userId]);

        // Almacenar descriptor normalizado y su hash criptográfico
        await pool.query(
            'INSERT INTO autenticacion (usuario_id, metodo, identificador_externo, datos_secretos) VALUES (?, "reconocimiento_facial", ?, ?)',
            [userId, hashSeguro, descriptorStr]
        );

        res.json({
            exito: true,
            mensaje: 'Reconocimiento facial activado con éxito. Ahora tu cuenta está protegida con 2FA biométrico.'
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// 4. VERIFICACIÓN FACIAL EN LOGIN (WEBCAM 2FA)
exports.verificarFacial = async (req, res) => {
    try {
        const { usuarioId, descriptor } = req.body;
        const vectorDesc = Array.isArray(descriptor) ? descriptor : (descriptor ? JSON.parse(descriptor) : null);

        if (!usuarioId || !vectorDesc || !Array.isArray(vectorDesc)) {
            return res.status(400).json({ error: 'Datos biométricos incompletos' });
        }

        const [users] = await pool.query('SELECT * FROM usuarios WHERE id = ?', [usuarioId]);
        if (users.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
        const user = users[0];

        const [auths] = await pool.query('SELECT * FROM autenticacion WHERE usuario_id = ? AND metodo = "reconocimiento_facial"', [usuarioId]);
        if (auths.length === 0) {
            return res.status(400).json({ error: 'Esta cuenta no tiene configurado reconocimiento facial' });
        }

        const authRecord = auths[0];
        let vectorGuardado;
        try {
            vectorGuardado = JSON.parse(authRecord.datos_secretos);
        } catch (err) {
            return res.status(500).json({ error: 'Error al procesar biometría almacenada' });
        }

        const distancia = calcularDistanciaEuclidiana(vectorDesc, vectorGuardado);
        const similitud = calcularSimilitudCoseno(vectorDesc, vectorGuardado);
        
        // Criterio de validación biométrica: Distancia Euclidiana <= 0.65 o Similitud Coseno >= 0.70
        const UMBRAL_DISTANCIA = 0.65;
        const UMBRAL_SIMILITUD = 0.70;
        const coincide = (distancia <= UMBRAL_DISTANCIA) || (similitud >= UMBRAL_SIMILITUD);

        if (coincide) {
            const token = jwt.sign({ id: user.id, rol: user.rol }, process.env.JWT_SECRET, { expiresIn: '8h' });
            return res.json({
                verificado: true,
                distancia: parseFloat(distancia.toFixed(2)),
                similitud: Math.round(similitud * 100),
                token,
                usuario: {
                    id: user.id,
                    nombre: user.nombre_completo,
                    correo: user.correo,
                    telefono: user.telefono,
                    fotografia_perfil: user.fotografia_perfil,
                    rol: user.rol
                }
            });
        } else {
            return res.status(401).json({
                verificado: false,
                distancia: parseFloat(distancia.toFixed(2)),
                similitud: Math.round(similitud * 100),
                error: `Verificación facial fallida: rostro no coincide (distancia: ${distancia.toFixed(2)}, coincidencia: ${Math.round(similitud * 100)}%). Asegúrate de mirar de frente a la cámara con buena iluminación.`
            });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// 5. Perfil del Usuario
exports.obtenerPerfil = async (req, res) => {
    try {
        const [users] = await pool.query('SELECT id, nombre_completo, correo, telefono, fotografia_perfil, rol, creado_en FROM usuarios WHERE id = ?', [req.usuario.id]);
        if (users.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
        
        const [auths] = await pool.query('SELECT metodo FROM autenticacion WHERE usuario_id = ?', [req.usuario.id]);
        const tieneFacial = auths.some(a => a.metodo === 'reconocimiento_facial');
        const tieneWebAuthn = auths.some(a => a.metodo === 'webauthn');

        res.json({
            ...users[0],
            tiene2FA: tieneFacial || tieneWebAuthn,
            tieneFacial,
            tieneWebAuthn
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// 6. Actualizar información personal
exports.actualizarPerfil = async (req, res) => {
    try {
        const { nombre_completo, telefono, contrasena_actual, nueva_contrasena } = req.body;
        const [users] = await pool.query('SELECT * FROM usuarios WHERE id = ?', [req.usuario.id]);
        if (users.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
        const user = users[0];

        const fotoFinal = req.file ? `/uploads/perfiles/${req.file.filename}` : (req.body.fotografia_perfil || user.fotografia_perfil);

        let sql = 'UPDATE usuarios SET nombre_completo = ?, telefono = ?, fotografia_perfil = ?';
        const params = [nombre_completo || user.nombre_completo, telefono || user.telefono, fotoFinal];

        if (nueva_contrasena) {
            if (nueva_contrasena.length < 8) {
                return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
            }
            if (!contrasena_actual) {
                return res.status(400).json({ error: 'Debes proporcionar tu contraseña actual para cambiarla' });
            }
            const match = await bcrypt.compare(contrasena_actual, user.contrasena);
            if (!match) {
                return res.status(400).json({ error: 'La contraseña actual no es correcta' });
            }
            const salt = await bcrypt.genSalt(10);
            const nuevoHash = await bcrypt.hash(nueva_contrasena, salt);
            sql += ', contrasena = ?';
            params.push(nuevoHash);
        }

        sql += ' WHERE id = ?';
        params.push(user.id);

        await pool.query(sql, params);
        res.json({ mensaje: 'Información actualizada con éxito' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// 7. Desactivar 2FA Facial
exports.desactivarFacial = async (req, res) => {
    try {
        await pool.query('DELETE FROM autenticacion WHERE usuario_id = ? AND metodo = "reconocimiento_facial"', [req.usuario.id]);
        res.json({ mensaje: 'Segundo factor facial desactivado' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// 8. Opciones WebAuthn FIDO2
exports.getWebauthnRegisterOptions = async (req, res) => {
    try {
        const [users] = await pool.query('SELECT * FROM usuarios WHERE id = ?', [req.usuario.id]);
        if (users.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
        const user = users[0];
        const options = await generateRegistrationOptions({
            rpName: 'Inmobiliaria UTM',
            rpID: process.env.RP_ID || 'localhost',
            userID: String(user.id),
            userName: user.correo,
            userDisplayName: user.nombre_completo,
            authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'preferred' }
        });
        req.app.locals[`challenge_${user.id}`] = options.challenge;
        res.json(options);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// 9. Verificar WebAuthn FIDO2
exports.verifyWebauthnRegister = async (req, res) => {
    try {
        const userId = req.usuario.id;
        const verification = await verifyRegistrationResponse({
            response: req.body,
            expectedChallenge: req.app.locals[`challenge_${userId}`],
            expectedOrigin: process.env.ORIGIN || 'http://localhost:3000',
            expectedRPID: process.env.RP_ID || 'localhost'
        });
        if (verification.verified && verification.registrationInfo) {
            const { credentialID, credentialPublicKey } = verification.registrationInfo;
            await pool.query(
                'INSERT INTO autenticacion (usuario_id, metodo, identificador_externo, datos_secretos) VALUES (?, "webauthn", ?, ?)',
                [userId, Buffer.from(credentialID).toString('base64'), Buffer.from(credentialPublicKey).toString('base64')]
            );
            return res.json({ verificado: true, mensaje: 'Biometría WebAuthn registrada con éxito' });
        }
        res.status(400).json({ error: 'Fallo al verificar biometría' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};