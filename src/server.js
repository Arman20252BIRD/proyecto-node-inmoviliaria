const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const passport = require('passport');
const FacebookStrategy = require('passport-facebook').Strategy;
const jwt = require('jsonwebtoken');
const pool = require('./config/db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// Configuración de Sesión para Passport OAuth
app.use(session({
    secret: process.env.SESSION_SECRET || 'un_secreto_super_seguro',
    resave: false,
    saveUninitialized: false
}));

// Serialización de usuarios para Passport
passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((user, done) => {
    done(null, user);
});

// Configuración Oficial de Facebook OAuth
const fbClientId = process.env.FACEBOOK_APP_ID || process.env.FACEBOOK_CLIENT_ID;
const fbClientSecret = process.env.FACEBOOK_APP_SECRET || process.env.FACEBOOK_SECRET_KEY;
const fbCallbackUrl = process.env.FACEBOOK_CALLBACK_URL || `http://localhost:${PORT}/auth/facebook/callback`;

passport.use(new FacebookStrategy({
    clientID: fbClientId,
    clientSecret: fbClientSecret,
    callbackURL: fbCallbackUrl,
    profileFields: ['id', 'displayName', 'emails', 'photos']
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const correo = profile.emails && profile.emails.length > 0 ? profile.emails[0].value : `${profile.id}@facebook.com`;
        let [users] = await pool.query('SELECT * FROM usuarios WHERE correo = ?', [correo]);
        let user = users[0];
        const rawPhoto = profile.photos && profile.photos.length > 0 ? profile.photos[0].value : null;
        const fotoPerfil = rawPhoto ? rawPhoto.substring(0, 255) : null;
        const nombreCompleto = profile.displayName || `Usuario Facebook ${profile.id}`;

        if (!user) {
            // Verificar si el usuario ya existe registrado por ID externo de Facebook
            const [authRows] = await pool.query('SELECT usuario_id FROM autenticacion WHERE metodo = "facebook" AND identificador_externo = ?', [profile.id]);
            if (authRows.length > 0) {
                const [existingUsers] = await pool.query('SELECT * FROM usuarios WHERE id = ?', [authRows[0].usuario_id]);
                if (existingUsers.length > 0) {
                    user = existingUsers[0];
                }
            }
        }

        if (!user) {
            const [res] = await pool.query(
                'INSERT INTO usuarios (nombre_completo, correo, contrasena, fotografia_perfil, rol) VALUES (?, ?, "", ?, "usuario")',
                [nombreCompleto, correo, fotoPerfil]
            );
            user = { id: res.insertId, nombre_completo: nombreCompleto, correo, fotografia_perfil: fotoPerfil, rol: 'usuario' };

            await pool.query(
                'INSERT INTO autenticacion (usuario_id, metodo, identificador_externo) VALUES (?, "facebook", ?)',
                [user.id, profile.id]
            );
        } else {
            // Asegurar que exista el registro en la tabla de autenticación
            const [authCheck] = await pool.query('SELECT * FROM autenticacion WHERE usuario_id = ? AND metodo = "facebook"', [user.id]);
            if (authCheck.length === 0) {
                await pool.query(
                    'INSERT INTO autenticacion (usuario_id, metodo, identificador_externo) VALUES (?, "facebook", ?)',
                    [user.id, profile.id]
                );
            }
        }
        return done(null, user);
    } catch (err) {
        console.error('Error en estrategia Facebook:', err);
        return done(err, null);
    }
}));

app.use(passport.initialize());
app.use(passport.session());

// Rutas de API
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/propiedades', require('./routes/propiedadRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));

// Facebook OAuth: Endpoint de inicio (soporta tanto /auth/facebook como /api/auth/facebook)
app.get(['/auth/facebook', '/api/auth/facebook'], passport.authenticate('facebook', { scope: ['email'] }));

// Facebook OAuth: Endpoint de Callback (soporta tanto /auth/facebook/callback como /api/auth/facebook/callback)
const facebookCallbackHandler = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res.redirect('/?error=' + encodeURIComponent('No se pudo autenticar con Facebook'));
        }

        const [auths] = await pool.query('SELECT metodo FROM autenticacion WHERE usuario_id = ?', [user.id]);
        const facialAuth = auths.find(a => a.metodo === 'reconocimiento_facial');

        if (facialAuth) {
            return res.redirect(`/?requiere2FA=true&metodo=facial&usuarioId=${user.id}`);
        }

        const token = jwt.sign({ id: user.id, rol: user.rol }, process.env.JWT_SECRET, { expiresIn: '8h' });
        const userPayload = encodeURIComponent(JSON.stringify({
            id: user.id,
            nombre: user.nombre_completo,
            correo: user.correo,
            rol: user.rol
        }));
        res.redirect(`/?fb_token=${token}&fb_user=${userPayload}`);
    } catch (e) {
        console.error('Error en callback de Facebook:', e);
        res.redirect(`/?error=${encodeURIComponent(e.message)}`);
    }
};

app.get(
    ['/auth/facebook/callback', '/api/auth/facebook/callback'],
    passport.authenticate('facebook', { failureRedirect: '/?error=fb_failed' }),
    facebookCallbackHandler
);

app.listen(PORT, () => console.log(`Servidor Inmobiliaria corriendo en http://localhost:${PORT}`));