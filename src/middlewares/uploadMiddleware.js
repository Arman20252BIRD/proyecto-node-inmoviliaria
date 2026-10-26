const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Asegurar existencia de directorios
const dirPropiedades = path.join(__dirname, '../../public/uploads/propiedades');
const dirPerfiles = path.join(__dirname, '../../public/uploads/perfiles');

if (!fs.existsSync(dirPropiedades)) fs.mkdirSync(dirPropiedades, { recursive: true });
if (!fs.existsSync(dirPerfiles)) fs.mkdirSync(dirPerfiles, { recursive: true });

// Filtro de tipos de imagen
const fileFilter = (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/i;
    const extname = allowed.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowed.test(file.mimetype);

    if (extname && mimetype) {
        cb(null, true);
    } else {
        cb(new Error('Solo se permiten archivos de imagen válidos (JPG, JPEG, PNG, WEBP)'));
    }
};

// Storage para propiedades
const storagePropiedades = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, dirPropiedades);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `propiedad-${uniqueSuffix}${ext}`);
    }
});

// Storage para perfiles de usuario
const storagePerfiles = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, dirPerfiles);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `perfil-${uniqueSuffix}${ext}`);
    }
});

exports.uploadPropiedades = multer({
    storage: storagePropiedades,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB por foto
    fileFilter
});

exports.uploadPerfil = multer({
    storage: storagePerfiles,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter
});
