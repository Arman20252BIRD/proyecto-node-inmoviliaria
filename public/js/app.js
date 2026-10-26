// ==========================================================================
// Inmobiliaria UTM - Frontend Core Application Logic
// ==========================================================================

const AppState = {
    token: localStorage.getItem('inmo_token') || null,
    usuario: JSON.parse(localStorage.getItem('inmo_usuario') || 'null'),
    propiedadesPublicas: [],
    misPropiedades: [],
    adminPublicaciones: [],
    adminUsuarios: [],
    filtroEstadoAdmin: '',
    streamWebcamActivo: null,
    usuarioIdPendiente2FA: null
};

// Inicialización de la aplicación
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    procesarParametrosURL();
    actualizarInterfazUsuario();
    cargarCatalogoPublico();
    configurarEventosNavegacion();
    configurarFormularios();
});

// ==================== TOAST NOTIFICATIONS ====================
function notificar(mensaje, tipo = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    
    let iconName = 'info';
    if (tipo === 'success') iconName = 'check-circle';
    if (tipo === 'error') iconName = 'alert-triangle';

    toast.innerHTML = `<i data-lucide="${iconName}"></i><span>${mensaje}</span>`;
    container.appendChild(toast);
    lucide.createIcons();

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.25s ease';
        setTimeout(() => toast.remove(), 250);
    }, 4500);
}

// ==================== NAVEGACIÓN ENTRE VISTAS ====================
function configurarEventosNavegacion() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            navegarA(targetId);
        });
    });

    // Sub-pestañas Admin
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const tabId = btn.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
        });
    });

    // Filtros de estado de publicaciones en Admin
    document.querySelectorAll('.filter-pills-bar .pill-btn').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('.filter-pills-bar .pill-btn').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            AppState.filtroEstadoAdmin = pill.getAttribute('data-estado');
            cargarPublicacionesAdmin();
        });
    });

    // Búsqueda en catálogo
    document.getElementById('btn-ejecutar-busqueda').addEventListener('click', aplicarFiltrosCatalogo);
}

function navegarA(viewId) {
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

    const targetSec = document.getElementById(viewId);
    if (targetSec) targetSec.classList.add('active');

    const activeNavBtn = document.querySelector(`.nav-btn[data-target="${viewId}"]`);
    if (activeNavBtn) activeNavBtn.classList.add('active');

    if (viewId === 'view-catalogo') cargarCatalogoPublico();
    if (viewId === 'view-mis-propiedades') cargarMisPropiedades();
    if (viewId === 'view-admin') {
        cargarEstadisticasAdmin();
        cargarPublicacionesAdmin();
        cargarUsuariosAdmin();
    }
}

// ==================== ESTADO DEL USUARIO Y SESIÓN ====================
function actualizarInterfazUsuario() {
    const userActions = document.getElementById('header-user-actions');
    const tabMisProps = document.getElementById('tab-nav-mis-props');
    const tabAdmin = document.getElementById('tab-nav-admin');
    const alertPublicar = document.getElementById('publicar-login-alert');

    if (AppState.token && AppState.usuario) {
        alertPublicar.classList.add('hidden');
        tabMisProps.classList.remove('hidden');

        const esAdmin = AppState.usuario.rol === 'administrador';
        if (esAdmin) {
            tabAdmin.classList.remove('hidden');
            cargarConteoPendientesAdmin();
        } else {
            tabAdmin.classList.add('hidden');
        }

        const fotoAvatar = AppState.usuario.fotografia_perfil || AppState.usuario.foto || `https://ui-avatars.com/api/?name=${encodeURIComponent(AppState.usuario.nombre || 'U')}&background=0F172A&color=fff&size=150`;

        userActions.innerHTML = `
            <div class="user-profile-menu">
                <img src="${fotoAvatar}" class="user-avatar-small" alt="Avatar">
                <div style="line-height:1.2;">
                    <div class="user-name-small">${AppState.usuario.nombre}</div>
                    <div class="user-role-small">${AppState.usuario.rol}</div>
                </div>
                <button class="btn btn-outline btn-sm" onclick="abrirModalPerfil()" title="Mi Perfil">
                    <i data-lucide="settings"></i>
                </button>
                <button class="btn btn-outline btn-sm" onclick="cerrarSesion()" title="Cerrar Sesión">
                    <i data-lucide="log-out"></i>
                </button>
            </div>
        `;
    } else {
        tabMisProps.classList.add('hidden');
        tabAdmin.classList.add('hidden');
        alertPublicar.classList.remove('hidden');

        userActions.innerHTML = `
            <button class="btn btn-primary" onclick="abrirModal('modal-auth')">
                <i data-lucide="user"></i> Iniciar Sesión
            </button>
        `;
    }
    lucide.createIcons();
}

function procesarParametrosURL() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('fb_token') && params.get('fb_user')) {
        const token = params.get('fb_token');
        const user = JSON.parse(decodeURIComponent(params.get('fb_user')));
        guardarSesion(token, user);
        notificar(`¡Bienvenido vía Facebook, ${user.nombre}!`, 'success');
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (params.get('requiere2FA') === 'true') {
        const userId = params.get('usuarioId');
        AppState.usuarioIdPendiente2FA = userId;
        abrirModalFacialVerificacion();
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (params.get('error')) {
        const errorMsg = params.get('error') === 'fb_failed' 
            ? 'Error o cancelación al iniciar sesión con Facebook' 
            : decodeURIComponent(params.get('error'));
        notificar(errorMsg, 'error');
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

function guardarSesion(token, usuario) {
    AppState.token = token;
    AppState.usuario = usuario;
    localStorage.setItem('inmo_token', token);
    localStorage.setItem('inmo_usuario', JSON.stringify(usuario));
    actualizarInterfazUsuario();
}

function cerrarSesion() {
    AppState.token = null;
    AppState.usuario = null;
    localStorage.removeItem('inmo_token');
    localStorage.removeItem('inmo_usuario');
    actualizarInterfazUsuario();
    navegarA('view-catalogo');
    notificar('Has cerrado sesión correctamente', 'info');
}

// ==================== CATÁLOGO PÚBLICO ====================
async function cargarCatalogoPublico() {
    const grid = document.getElementById('grid-propiedades');
    grid.innerHTML = `
        <div class="state-box">
            <div class="spinner"></div>
            <p>Cargando propiedades disponibles...</p>
        </div>
    `;

    try {
        const res = await fetch('/api/propiedades/publicas');
        if (!res.ok) throw new Error('Error al conectar con la base de datos');
        const data = await res.json();
        AppState.propiedadesPublicas = data;
        renderizarCatalogo(data);
    } catch (e) {
        grid.innerHTML = `
            <div class="state-box">
                <p>No se pudo cargar el catálogo: ${e.message}</p>
                <button class="btn btn-outline btn-sm" style="margin-top:1rem;" onclick="cargarCatalogoPublico()">Reintentar</button>
            </div>
        `;
    }
}

function renderizarCatalogo(lista) {
    const grid = document.getElementById('grid-propiedades');
    const counterText = document.getElementById('results-count-text');

    if (counterText) {
        counterText.innerText = `${lista.length} propiedad${lista.length === 1 ? '' : 'es'} en venta`;
    }

    if (!lista || lista.length === 0) {
        grid.innerHTML = `
            <div class="state-box">
                <p>No se encontraron casas aprobadas con los filtros seleccionados.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = lista.map(p => {
        const fotoPrincipal = p.fotografias && p.fotografias.length > 0
            ? p.fotografias[0]
            : 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80';
        const numFotos = p.fotografias ? p.fotografias.length : 0;
        const precio = Number(p.precio).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

        return `
            <article class="prop-card" id="card-prop-${p.id}">
                <div class="prop-card-media">
                    <img src="${fotoPrincipal}" alt="${p.titulo}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80'">
                    <span class="prop-card-price">${precio}</span>
                    <span class="prop-card-photos-badge"><i data-lucide="camera"></i> ${numFotos}</span>
                </div>
                <div class="prop-card-body">
                    <div class="prop-card-location">
                        <i data-lucide="map-pin" style="width:13px; height:13px;"></i>
                        <span>${p.ubicacion}</span>
                    </div>
                    <h3 class="prop-card-title">${p.titulo}</h3>

                    <div class="prop-card-specs">
                        <span class="spec-item"><i data-lucide="bed" style="width:15px;"></i> ${p.habitaciones || '-'} Habs</span>
                        <span class="spec-item"><i data-lucide="bath" style="width:15px;"></i> ${p.banos || '-'} Baños</span>
                        <span class="spec-item"><i data-lucide="maximize-2" style="width:15px;"></i> ${p.superficie_construccion || '-'} m²</span>
                    </div>

                    <div class="prop-card-footer">
                        <button class="btn btn-outline btn-sm" onclick="verDetallePropiedadModal(${p.id})">
                            Ver Detalles
                        </button>
                        <a href="https://wa.me/?text=Hola,%20solicito%20informes%20de%20la%20propiedad:%20${encodeURIComponent(p.titulo)}" target="_blank" class="btn btn-primary btn-sm">
                            <i data-lucide="phone"></i> Contactar
                        </a>
                    </div>
                </div>
            </article>
        `;
    }).join('');

    lucide.createIcons();
}

function aplicarFiltrosCatalogo() {
    const ubicacion = document.getElementById('filtro-ubicacion').value.toLowerCase().trim();
    const precioMax = document.getElementById('filtro-precio').value;
    const habsMin = document.getElementById('filtro-habitaciones').value;

    const filtradas = AppState.propiedadesPublicas.filter(p => {
        let ok = true;
        if (ubicacion && !p.ubicacion.toLowerCase().includes(ubicacion) && !p.titulo.toLowerCase().includes(ubicacion)) {
            ok = false;
        }
        if (precioMax && Number(p.precio) > Number(precioMax)) {
            ok = false;
        }
        if (habsMin && Number(p.habitaciones) < Number(habsMin)) {
            ok = false;
        }
        return ok;
    });

    renderizarCatalogo(filtradas);
}

// Modal Detalle de Propiedad
function verDetallePropiedadModal(id) {
    const p = AppState.propiedadesPublicas.find(item => item.id === id);
    if (!p) return;

    const body = document.getElementById('detalle-propiedad-body');
    const fotos = p.fotografias || [];
    const fotoPrincipal = fotos[0] || 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80';
    const precio = Number(p.precio).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

    body.innerHTML = `
        <img id="detalle-main-img" src="${fotoPrincipal}" class="prop-detail-hero-img" alt="${p.titulo}">
        
        <div class="prop-detail-thumbs">
            ${fotos.map((f, i) => `
                <img src="${f}" class="prop-detail-thumb ${i === 0 ? 'active' : ''}" onclick="seleccionarFotoModal('${f}', this)" alt="Foto ${i+1}">
            `).join('')}
        </div>

        <div class="prop-detail-price">${precio}</div>
        <h2 style="font-size:1.4rem; font-weight:700; margin-bottom:0.35rem;">${p.titulo}</h2>
        <div style="font-size:0.875rem; color:var(--text-muted); margin-bottom:1.25rem;">
            <i data-lucide="map-pin" style="width:14px; height:14px; vertical-align:middle;"></i> ${p.ubicacion}
        </div>

        <div class="prop-card-specs" style="padding:0.75rem 0; margin-bottom:1.25rem; font-size:0.9rem;">
            <span class="spec-item"><i data-lucide="bed"></i> <strong>${p.habitaciones}</strong> Habitaciones</span>
            <span class="spec-item"><i data-lucide="bath"></i> <strong>${p.banos}</strong> Baños</span>
            <span class="spec-item"><i data-lucide="square"></i> <strong>${p.superficie_terreno}</strong> m² Terreno</span>
            <span class="spec-item"><i data-lucide="maximize-2"></i> <strong>${p.superficie_construccion}</strong> m² Construcción</span>
        </div>

        <h4 style="font-size:1rem; margin-bottom:0.4rem;">Descripción del Inmueble</h4>
        <p style="color:var(--text-secondary); line-height:1.6; margin-bottom:1.5rem;">${p.descripcion}</p>

        <div class="contact-seller-card">
            <div>
                <span style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">Datos de Contacto del Vendedor</span>
                <p style="font-size:1rem; font-weight:600; color:var(--text-primary); margin-top:0.2rem;">${p.contacto_vendedor}</p>
            </div>
            <a href="tel:${p.contacto_vendedor.replace(/[^0-9]/g, '')}" class="btn btn-primary">
                <i data-lucide="phone"></i> Llamar al Vendedor
            </a>
        </div>
    `;

    abrirModal('modal-detalle-propiedad');
    lucide.createIcons();
}

function seleccionarFotoModal(url, el) {
    document.getElementById('detalle-main-img').src = url;
    document.querySelectorAll('.prop-detail-thumb').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
}

// ==================== PUBLICAR PROPIEDAD CON IMÁGENES REALES ====================
function configurarFormularios() {
    const inputFotos = document.getElementById('pub-fotos-archivos');
    const previewContainer = document.getElementById('preview-archivos-fotos');
    const contadorBadge = document.getElementById('contador-fotos-seleccionadas');

    // Previsualización en vivo de archivos reales de imagen
    if (inputFotos) {
        inputFotos.addEventListener('change', () => {
            const files = Array.from(inputFotos.files);
            previewContainer.innerHTML = '';

            if (files.length === 0) {
                previewContainer.classList.add('hidden');
                contadorBadge.className = 'badge-status badge-pendiente';
                contadorBadge.innerText = '0 fotos seleccionadas';
                return;
            }

            previewContainer.classList.remove('hidden');
            files.forEach((file, index) => {
                const objectUrl = URL.createObjectURL(file);
                const thumb = document.createElement('div');
                thumb.className = 'preview-foto-thumb';
                thumb.innerHTML = `
                    <img src="${objectUrl}" alt="Foto ${index + 1}">
                    <span class="preview-foto-tag">Foto ${index + 1}</span>
                `;
                previewContainer.appendChild(thumb);
            });

            if (files.length < 3) {
                contadorBadge.className = 'badge-status badge-rechazada';
                contadorBadge.innerText = `${files.length} / 3 fotos (Faltan ${3 - files.length})`;
            } else {
                contadorBadge.className = 'badge-status badge-aprobada';
                contadorBadge.innerText = `✓ ${files.length} fotos reales seleccionadas`;
            }
        });
    }

    // Envío del formulario de publicación con imágenes reales (FormData)
    document.getElementById('form-publicar-propiedad').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!AppState.token) {
            notificar('Debes iniciar sesión para publicar una casa', 'error');
            abrirModal('modal-auth');
            return;
        }

        const files = inputFotos ? inputFotos.files : [];
        if (!files || files.length < 3) {
            notificar('Debes seleccionar al menos 3 archivos de imágenes reales de la propiedad', 'error');
            return;
        }

        const formData = new FormData();
        formData.append('titulo', document.getElementById('pub-titulo').value.trim());
        formData.append('ubicacion', document.getElementById('pub-ubicacion').value.trim());
        formData.append('precio', document.getElementById('pub-precio').value);
        formData.append('contacto_vendedor', document.getElementById('pub-contacto').value.trim());
        formData.append('superficie_terreno', document.getElementById('pub-terreno').value);
        formData.append('superficie_construccion', document.getElementById('pub-construccion').value);
        formData.append('habitaciones', document.getElementById('pub-habs').value);
        formData.append('banos', document.getElementById('pub-banos').value);
        formData.append('descripcion', document.getElementById('pub-descripcion').value.trim());

        // Adjuntar archivos de imagen reales
        for (let i = 0; i < files.length; i++) {
            formData.append('fotografias', files[i]);
        }

        const btn = document.getElementById('btn-submit-publicacion');
        btn.disabled = true;
        btn.innerText = 'Subiendo imágenes y guardando en base de datos...';

        try {
            const res = await fetch('/api/propiedades', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${AppState.token}`
                    // Nota: No poner 'Content-Type' para que el navegador genere el multipart boundary
                },
                body: formData
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al guardar publicación');

            notificar('¡Propiedad e imágenes reales guardadas con éxito! Pasa a revisión administrativa.', 'success');
            document.getElementById('form-publicar-propiedad').reset();
            if (previewContainer) {
                previewContainer.innerHTML = '';
                previewContainer.classList.add('hidden');
            }
            if (contadorBadge) {
                contadorBadge.className = 'badge-status badge-pendiente';
                contadorBadge.innerText = '0 fotos seleccionadas';
            }
            navegarA('view-mis-propiedades');
        } catch (err) {
            notificar(err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="send"></i> Guardar y Enviar para Autorización';
            lucide.createIcons();
        }
    });

    // Login Form Real
    // ==================== REGISTRO: ANÁLISIS DE FOTO EN TIEMPO REAL ====================
    const inputFotoRegistro = document.getElementById('reg-foto-archivo');
    const previewBoxRegistro = document.getElementById('reg-foto-preview-box');
    const previewImgRegistro = document.getElementById('reg-foto-preview-img');
    const badgeFotoStatus = document.getElementById('reg-foto-status-badge');
    const descFotoStatus = document.getElementById('reg-foto-status-desc');

    if (inputFotoRegistro) {
        inputFotoRegistro.addEventListener('change', async () => {
            const file = inputFotoRegistro.files ? inputFotoRegistro.files[0] : null;
            if (!file) {
                if (previewBoxRegistro) previewBoxRegistro.classList.add('hidden');
                AppState.descriptorFotoRegistro = null;
                return;
            }

            const objectUrl = URL.createObjectURL(file);
            previewImgRegistro.src = objectUrl;
            previewBoxRegistro.classList.remove('hidden');
            badgeFotoStatus.className = 'badge-status badge-pendiente';
            badgeFotoStatus.innerText = 'Analizando rostro con IA...';
            descFotoStatus.innerText = 'Cargando redes neuronales para extraer biometría...';

            try {
                await asegurarModelosFaciales();
                // Esperar a que la imagen cargue
                await new Promise((resolve) => {
                    if (previewImgRegistro.complete) resolve();
                    else previewImgRegistro.onload = () => resolve();
                });

                const detection = await faceapi.detectSingleFace(
                    previewImgRegistro,
                    new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 })
                ).withFaceLandmarks().withFaceDescriptor();

                if (detection) {
                    AppState.descriptorFotoRegistro = Array.from(detection.descriptor);
                    badgeFotoStatus.className = 'badge-status badge-aprobada';
                    badgeFotoStatus.innerText = '✓ Rostro detectado (Listo para 2FA)';
                    descFotoStatus.innerText = `Biometría extraída: vector de ${detection.descriptor.length} dimensiones listo para proteger tu cuenta.`;
                } else {
                    AppState.descriptorFotoRegistro = null;
                    badgeFotoStatus.className = 'badge-status badge-rechazada';
                    badgeFotoStatus.innerText = '⚠️ No se detectó un rostro claro';
                    descFotoStatus.innerText = 'Asegúrate de que la foto muestre tu rostro de frente y bien iluminado.';
                }
            } catch (err) {
                console.error('Error al analizar foto:', err);
                badgeFotoStatus.className = 'badge-status badge-pendiente';
                badgeFotoStatus.innerText = 'Foto seleccionada';
                descFotoStatus.innerText = 'Se procesará en la cámara web tras el registro.';
            }
        });
    }

    // Sincronizar biometría del usuario cuando escribe su usuario en Login
    const inputLoginCorreo = document.getElementById('login-correo');
    if (inputLoginCorreo) {
        inputLoginCorreo.addEventListener('blur', () => {
            const val = inputLoginCorreo.value.trim();
            if (val) sincronizarUsuarioLogin(val);
        });
        inputLoginCorreo.addEventListener('change', () => {
            const val = inputLoginCorreo.value.trim();
            if (val) sincronizarUsuarioLogin(val);
        });
    }

    // Login Form Real
    document.getElementById('form-login').addEventListener('submit', async (e) => {
        e.preventDefault();
        const correo = document.getElementById('login-correo').value.trim();
        const contrasena = document.getElementById('login-pass').value;
        ejecutarInicioSesion(correo, contrasena);
    });

    // Botón "Activate Camera" en la sección Facial Recognition de Login (Capturas 2 y 3)
    const btnActivateCameraLogin = document.getElementById('btn-activate-camera-login');
    if (btnActivateCameraLogin) {
        btnActivateCameraLogin.addEventListener('click', async () => {
            const loginUser = document.getElementById('login-correo').value.trim();
            if (loginUser && !AppState.descriptorPendiente2FA) {
                await sincronizarUsuarioLogin(loginUser);
            }
            activarCamaraReconocimientoLogin();
        });
    }

    // Registro Form Real (Add User - Captura 1)
    document.getElementById('form-registro').addEventListener('submit', async (e) => {
        e.preventDefault();
        const contrasena = document.getElementById('reg-pass').value;
        const confirmPass = document.getElementById('reg-confirm-pass').value;
        const nombreVal = document.getElementById('reg-nombre').value.trim();
        const correoVal = document.getElementById('reg-correo').value.trim();

        if (contrasena !== confirmPass) {
            notificar('Las contraseñas no coinciden. Por favor verifícalas.', 'error');
            return;
        }

        if (contrasena.length < 8) {
            notificar('La contraseña debe tener al menos 8 caracteres para ser segura', 'error');
            return;
        }

        const fileInput = document.getElementById('reg-foto-archivo');
        if (!fileInput || !fileInput.files || !fileInput.files[0]) {
            notificar('Debes subir una fotografía de tu rostro para activar el reconocimiento facial 2FA.', 'error');
            return;
        }

        const btn = document.getElementById('btn-submit-registro');
        btn.disabled = true;
        btn.innerText = 'Analizando rostro en la fotografía...';

        try {
            await asegurarModelosFaciales();

            // Si aún no se extrajo el descriptor de la foto, extraerlo de inmediato
            if (!AppState.descriptorFotoRegistro) {
                const previewImg = document.getElementById('reg-foto-preview-img');
                if (previewImg && previewImg.src) {
                    const detection = await faceapi.detectSingleFace(
                        previewImg,
                        new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.35 })
                    ).withFaceLandmarks().withFaceDescriptor();

                    if (detection) {
                        AppState.descriptorFotoRegistro = Array.from(detection.descriptor);
                    }
                }
            }

            if (!AppState.descriptorFotoRegistro) {
                throw new Error('No se detectó un rostro claro en la fotografía seleccionada. Por favor sube una foto de frente con buena iluminación.');
            }

            const formData = new FormData();
            formData.append('nombre_completo', nombreVal);
            formData.append('correo', correoVal);
            formData.append('telefono', document.getElementById('reg-telefono').value.trim());
            formData.append('contrasena', contrasena);
            formData.append('confirm_contrasena', confirmPass);
            formData.append('rol', document.getElementById('reg-rol').value);
            formData.append('fotografia_perfil', fileInput.files[0]);
            formData.append('descriptor', JSON.stringify(AppState.descriptorFotoRegistro));

            btn.innerText = 'Guardando usuario y biometría en el sistema...';

            const res = await fetch('/api/auth/registro', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Fallo al registrar usuario');

            // Limpiar formulario de registro
            document.getElementById('form-registro').reset();
            if (previewBoxRegistro) previewBoxRegistro.classList.add('hidden');
            AppState.descriptorFotoRegistro = null;

            // Cambiar automáticamente a la pestaña de LOGIN
            cambiarAuthPestana('login');
            document.getElementById('login-correo').value = nombreVal || correoVal;
            document.getElementById('login-pass').value = '';
            document.getElementById('login-pass').focus();

            // Pre-cargar el descriptor del nuevo usuario para el login facial
            sincronizarUsuarioLogin(nombreVal || correoVal);

            notificar(`¡Usuario ${data.usuario.nombre} registrado con éxito! Tu rostro ha sido procesado. Ingresa tu contraseña y verifica tu rostro ante la cámara para acceder.`, 'success');
        } catch (err) {
            notificar(err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="user-plus"></i> Add User';
            lucide.createIcons();
        }
    });

    // Formulario de edición de propiedad
    document.getElementById('form-editar-propiedad').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-id').value;
        const formData = new FormData();

        formData.append('titulo', document.getElementById('edit-titulo').value.trim());
        formData.append('ubicacion', document.getElementById('edit-ubicacion').value.trim());
        formData.append('precio', document.getElementById('edit-precio').value);
        formData.append('contacto_vendedor', document.getElementById('edit-contacto').value.trim());
        formData.append('habitaciones', document.getElementById('edit-habs').value);
        formData.append('banos', document.getElementById('edit-banos').value);
        formData.append('superficie_terreno', document.getElementById('edit-terreno').value);
        formData.append('superficie_construccion', document.getElementById('edit-construccion').value);
        formData.append('descripcion', document.getElementById('edit-descripcion').value.trim());

        const editFilesInput = document.getElementById('edit-fotos-archivos');
        if (editFilesInput && editFilesInput.files && editFilesInput.files.length > 0) {
            if (editFilesInput.files.length < 3) {
                notificar('Si reemplazas las fotografías, debes subir al menos 3 imágenes reales', 'error');
                return;
            }
            for (let i = 0; i < editFilesInput.files.length; i++) {
                formData.append('fotografias', editFilesInput.files[i]);
            }
        }

        try {
            const res = await fetch(`/api/propiedades/${id}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${AppState.token}`
                },
                body: formData
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al actualizar');

            notificar('Propiedad actualizada con éxito en la base de datos', 'success');
            cerrarModal('modal-editar-propiedad');
            cargarMisPropiedades();
        } catch (err) {
            notificar(err.message, 'error');
        }
    });

    // Formulario de actualizar información personal del usuario
    document.getElementById('form-actualizar-perfil').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btn-guardar-perfil');
        btn.disabled = true;
        btn.innerText = 'Guardando cambios...';

        const payload = {
            nombre_completo: document.getElementById('perfil-nombre').value.trim(),
            telefono: document.getElementById('perfil-telefono').value.trim()
        };

        const passActual = document.getElementById('perfil-pass-actual').value;
        const passNueva = document.getElementById('perfil-pass-nueva').value;
        if (passNueva) {
            payload.nueva_contrasena = passNueva;
            payload.contrasena_actual = passActual;
        }

        try {
            const res = await fetch('/api/auth/perfil', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${AppState.token}`
                },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al actualizar perfil');

            AppState.usuario.nombre = payload.nombre_completo;
            AppState.usuario.telefono = payload.telefono;
            localStorage.setItem('inmo_usuario', JSON.stringify(AppState.usuario));
            actualizarInterfazUsuario();

            notificar('Información de perfil actualizada con éxito', 'success');
            cerrarModal('modal-perfil');
        } catch (err) {
            notificar(err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="save"></i> Guardar Cambios';
            lucide.createIcons();
        }
    });

    // Botones de Webcam Reconocimiento Facial en Modales Dedicados
    document.getElementById('btn-capturar-registrar-rostro').addEventListener('click', capturarYRegistrarRostro);
    document.getElementById('btn-escanear-verificar-rostro').addEventListener('click', escanearYVerificarRostro);
}

// Abrir y poblar el modal de perfil de usuario con la fotografía oficial del registro
async function abrirModalPerfil() {
    const userLocal = AppState.usuario || {};
    const nombre = userLocal.nombre || userLocal.nombre_completo || 'Usuario';
    const correo = userLocal.correo || '';
    const foto = userLocal.fotografia_perfil || userLocal.foto || '';

    // Rellenar de inmediato con los datos del usuario en sesión
    const elNombre = document.getElementById('perfil-nombre');
    if (elNombre) elNombre.value = nombre;
    const elCorreo = document.getElementById('perfil-correo');
    if (elCorreo) elCorreo.value = correo;
    const elTel = document.getElementById('perfil-telefono');
    if (elTel) elTel.value = userLocal.telefono || '';

    const elHeroNombre = document.getElementById('perfil-hero-nombre');
    if (elHeroNombre) elHeroNombre.innerText = nombre;

    const heroRol = document.getElementById('perfil-hero-rol');
    if (heroRol) {
        heroRol.innerText = (userLocal.rol === 'administrador') ? 'ADMINISTRADOR' : 'USUARIO VENDEDOR';
        heroRol.className = (userLocal.rol === 'administrador') ? 'badge-role admin' : 'badge-role';
    }

    const heroCorreo = document.getElementById('perfil-hero-correo');
    if (heroCorreo) {
        heroCorreo.innerHTML = `<i data-lucide="mail"></i> ${correo}`;
    }

    // Fotografía oficial tomada en el registro
    const avatarImg = document.getElementById('perfil-avatar-preview');
    if (avatarImg) {
        if (foto) {
            avatarImg.src = foto;
        } else {
            avatarImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(nombre)}&background=0F172A&color=fff&size=150`;
        }
    }

    // Estado del 2FA (Sin botón de re-escanear)
    const banner2FA = document.getElementById('perfil-2fa-status-card');
    const title2FA = document.getElementById('perfil-2fa-title');
    const desc2FA = document.getElementById('perfil-2fa-desc');
    const action2FA = document.getElementById('perfil-2fa-action');

    if (banner2FA && title2FA && desc2FA && action2FA) {
        banner2FA.className = 'profile-2fa-banner active';
        title2FA.innerText = 'Reconocimiento Facial (2FA)';
        desc2FA.innerText = 'Tu rostro está vinculado con éxito para inicio de sesión seguro.';
        action2FA.innerHTML = `<span class="badge-status badge-aprobada" style="display:inline-flex; align-items:center; gap:0.35rem; font-size:0.8rem; padding:0.4rem 0.75rem;"><i data-lucide="check-circle-2" style="width:14px; height:14px;"></i> 2FA Activo</span>`;
    }

    abrirModal('modal-perfil');
    if (window.lucide) lucide.createIcons();

    // Sincronizar con la base de datos
    if (AppState.token) {
        try {
            const res = await fetch('/api/auth/perfil', {
                headers: { 'Authorization': `Bearer ${AppState.token}` }
            });
            if (res.ok) {
                const user = await res.json();
                if (elNombre) elNombre.value = user.nombre_completo || nombre;
                if (elCorreo) elCorreo.value = user.correo || correo;
                if (elTel) elTel.value = user.telefono || '';
                if (elHeroNombre) elHeroNombre.innerText = user.nombre_completo || nombre;
                if (heroCorreo) heroCorreo.innerHTML = `<i data-lucide="mail"></i> ${user.correo}`;
                if (user.fotografia_perfil) {
                    if (avatarImg) avatarImg.src = user.fotografia_perfil;
                    if (AppState.usuario) {
                        AppState.usuario.fotografia_perfil = user.fotografia_perfil;
                        AppState.usuario.nombre = user.nombre_completo;
                        AppState.usuario.telefono = user.telefono;
                        localStorage.setItem('inmo_usuario', JSON.stringify(AppState.usuario));
                    }
                }
                if (window.lucide) lucide.createIcons();
            }
        } catch (e) {
            console.error('Error al sincronizar perfil:', e);
        }
    }
}

// ==================== SINCRONIZACIÓN BIOMÉTRICA DE USUARIO ====================
async function sincronizarUsuarioLogin(identificador) {
    if (!identificador) return null;
    try {
        const res = await fetch(`/api/auth/facial/info-usuario/${encodeURIComponent(identificador.trim())}`);
        if (!res.ok) return null;
        const info = await res.json();
        
        AppState.usuarioIdPendiente2FA = info.usuarioId;
        AppState.nombrePendiente2FA = info.nombre;
        AppState.fotoPendiente2FA = info.foto;

        if (info.tieneDescriptor && info.descriptor) {
            AppState.descriptorPendiente2FA = info.descriptor;
            console.log(`✓ Descriptor biométrico cargado para ${info.nombre}`);
        } else if (info.foto) {
            await asegurarDescriptorDeFoto(info.foto, info.usuarioId);
        }
        return info;
    } catch (e) {
        console.error('Error al sincronizar biometría del usuario:', e);
        return null;
    }
}

// Extraer el descriptor de la fotografía de perfil si aún no estaba cacheado en la DB
async function asegurarDescriptorDeFoto(fotoUrl, usuarioId) {
    if (AppState.descriptorPendiente2FA && AppState.descriptorPendiente2FA.length > 0) {
        return AppState.descriptorPendiente2FA;
    }
    if (!fotoUrl) return null;

    try {
        await asegurarModelosFaciales();
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = fotoUrl;

        await new Promise((resolve, reject) => {
            if (img.complete) return resolve();
            img.onload = resolve;
            img.onerror = reject;
        });

        const detection = await faceapi.detectSingleFace(
            img,
            new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.35 })
        ).withFaceLandmarks().withFaceDescriptor();

        if (detection) {
            AppState.descriptorPendiente2FA = Array.from(detection.descriptor);
            console.log('✓ Descriptor extraído exitosamente de la fotografía de perfil del usuario.');

            if (usuarioId) {
                fetch('/api/auth/facial/registrar-foto', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ usuarioId, descriptor: AppState.descriptorPendiente2FA })
                }).catch(err => console.error('Error al guardar descriptor en BD:', err));
            }
            return AppState.descriptorPendiente2FA;
        }
    } catch (e) {
        console.error('No se pudo extraer descriptor de la foto de perfil:', e);
    }
    return null;
}

// ==================== INICIO DE SESIÓN CON MANEJO DE 2FA ====================
async function ejecutarInicioSesion(correo, contrasena) {
    const btn = document.getElementById('btn-submit-login');
    btn.disabled = true;
    btn.innerText = 'Verificando contraseña...';

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ correo, contrasena })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Credenciales inválidas');

        // ¿Requiere Segundo Factor Facial (2FA)?
        if (data.requiere2FA) {
            AppState.usuarioIdPendiente2FA = data.usuarioId;
            AppState.nombrePendiente2FA = data.nombre;
            AppState.descriptorPendiente2FA = (typeof data.descriptor === 'string') ? JSON.parse(data.descriptor) : data.descriptor;
            AppState.fotoPendiente2FA = data.foto;
            AppState.loginPasswordVerificada = true;

            if (data.metodo2FA === 'reconocimiento_facial') {
                notificar(`✓ Contraseña correcta. Ahora mira de frente a la cámara para validar tu rostro con tu foto de registro.`, 'info');
                
                // Si no viene el descriptor directo, extraerlo de la fotografía subida
                if (!AppState.descriptorPendiente2FA && data.foto) {
                    await asegurarDescriptorDeFoto(data.foto, data.usuarioId);
                }

                // Activar la cámara en vivo dentro del propio formulario de login
                await activarCamaraReconocimientoLogin();
            } else if (data.metodo2FA === 'webauthn') {
                notificar('Segundo factor requerido: Verificación WebAuthn', 'info');
            }
            return;
        }

        guardarSesion(data.token, data.usuario);
        cerrarModal('modal-auth');
        notificar(`¡Datos verificados! Bienvenido de nuevo, ${data.usuario.nombre} (${data.usuario.rol}).`, 'success');
    } catch (err) {
        notificar(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="log-in"></i> Login';
        lucide.createIcons();
    }
}

// ==================== FACE-API.JS: IA DE RECONOCIMIENTO Y LANDMARKS ====================
let faceModelsLoaded = false;
let trackingLoopId = null;

async function asegurarModelosFaciales() {
    if (faceModelsLoaded) return true;
    const MODEL_URL = '/models';
    try {
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        faceModelsLoaded = true;
        console.log('✅ Modelos neuronales de Face-API cargados correctamente.');
        return true;
    } catch (err) {
        console.error('Error al cargar modelos de Face-API:', err);
        return false;
    }
}

// Encender la webcam del usuario asegurando que el video transmita fotogramas válidos
async function iniciarWebcam(videoElement) {
    try {
        detenerWebcam();
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: 'user'
            },
            audio: false
        });
        AppState.streamWebcamActivo = stream;
        videoElement.srcObject = stream;

        // Esperar a que el video reciba el stream y tenga dimensiones reales
        await new Promise((resolve) => {
            if (videoElement.readyState >= 2 && videoElement.videoWidth > 0) {
                return resolve();
            }
            videoElement.onloadeddata = () => resolve();
            setTimeout(resolve, 600);
        });

        await videoElement.play();
    } catch (err) {
        throw new Error('No se pudo acceder a la cámara web. Por favor otorga permisos en tu navegador.');
    }
}

// Detener la webcam y cancelar bucles de detección
function detenerWebcam() {
    if (trackingLoopId) {
        cancelAnimationFrame(trackingLoopId);
        clearInterval(trackingLoopId);
        trackingLoopId = null;
    }
    if (AppState.streamWebcamActivo) {
        AppState.streamWebcamActivo.getTracks().forEach(track => track.stop());
        AppState.streamWebcamActivo = null;
    }
}

// ==================== CÁMARA FACIAL EN FORMULARIO DE LOGIN (Capturas 2 y 3) ====================
async function activarCamaraReconocimientoLogin() {
    const container = document.getElementById('login-camera-container');
    const video = document.getElementById('login-facial-video');
    const canvas = document.getElementById('login-facial-canvas');
    const statusText = document.getElementById('login-facial-status-text');
    const btnActivate = document.getElementById('btn-activate-camera-login');

    container.classList.remove('hidden');
    btnActivate.disabled = true;
    btnActivate.innerHTML = '<i data-lucide="loader"></i> Iniciando Reconocimiento Facial...';
    lucide.createIcons();

    try {
        statusText.innerText = 'Cargando modelos de redes neuronales (Landmarks 68 & ResNet)...';
        await asegurarModelosFaciales();

        // Si tenemos foto registrada pero no descriptor, extraerlo antes de abrir video
        if (!AppState.descriptorPendiente2FA && AppState.fotoPendiente2FA) {
            statusText.innerText = 'Analizando biometría de tu fotografía registrada...';
            await asegurarDescriptorDeFoto(AppState.fotoPendiente2FA, AppState.usuarioIdPendiente2FA);
        }

        statusText.innerText = 'Conectando cámara web en vivo...';
        await iniciarWebcam(video);

        statusText.innerText = 'Coloca tu rostro frente a la cámara. Detección en curso...';
        btnActivate.innerHTML = '<i data-lucide="check"></i> Cámara Activa';
        lucide.createIcons();

        // Bucle de detección de rostro y landmarks en tiempo real (Captura 3)
        iniciarBucleDeteccionLandmarks(video, canvas, statusText);
    } catch (err) {
        statusText.innerText = 'Error: ' + err.message;
        btnActivate.disabled = false;
        btnActivate.innerHTML = '<i data-lucide="camera"></i> Activate Camera';
        lucide.createIcons();
    }
}

// Helper para calcular similitud coseno en el cliente
function calcularSimilitudCosenoClient(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) return 0;
    let dot = 0, nA = 0, nB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dot += vecA[i] * vecB[i];
        nA += vecA[i] * vecA[i];
        nB += vecB[i] * vecB[i];
    }
    if (nA === 0 || nB === 0) return 0;
    return dot / (Math.sqrt(nA) * Math.sqrt(nB));
}

// Bucle en tiempo real que dibuja los Landmarks faciales y valida al instante con la foto de registro
function iniciarBucleDeteccionLandmarks(video, canvas, statusText) {
    if (trackingLoopId) {
        cancelAnimationFrame(trackingLoopId);
        clearInterval(trackingLoopId);
        trackingLoopId = null;
    }

    function sincronizarDimensiones() {
        const w = video.videoWidth || video.clientWidth || 440;
        const h = video.videoHeight || video.clientHeight || 330;
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
            faceapi.matchDimensions(canvas, { width: w, height: h });
        }
        return { width: w, height: h };
    }

    let verificadoExitoso = false;
    let isProcessing = false;

    // Detector configurado con 224px y score 0.2 para detección inmediata y sensible
    const detectorOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.2 });

    async function tick() {
        if (verificadoExitoso || !AppState.streamWebcamActivo) return;

        if (!isProcessing) {
            isProcessing = true;
            try {
                const displaySize = sincronizarDimensiones();

                const detection = await faceapi.detectSingleFace(video, detectorOptions)
                    .withFaceLandmarks()
                    .withFaceDescriptor();

                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                if (!detection) {
                    statusText.innerText = 'Buscando rostro en el encuadre... Mira de frente a la cámara';
                } else {
                    const resizedDetections = faceapi.resizeResults(detection, displaySize);
                    const box = resizedDetections.detection.box;

                    let distancia = 0.62;
                    let similitud = 0.50;
                    let esUsuario = false;
                    let nombreEtiqueta = 'unknown';

                    if (AppState.descriptorPendiente2FA && AppState.descriptorPendiente2FA.length > 0) {
                        distancia = faceapi.euclideanDistance(detection.descriptor, AppState.descriptorPendiente2FA);
                        similitud = calcularSimilitudCosenoClient(detection.descriptor, AppState.descriptorPendiente2FA);

                        // Coincidencia con fotografía de registro: Distancia <= 0.65 o Similitud >= 0.70
                        if (distancia <= 0.65 || similitud >= 0.70) {
                            esUsuario = true;
                            nombreEtiqueta = AppState.nombrePendiente2FA || 'Usuario';
                        }
                    }

                    // Dibujar Landmarks faciales (68 puntos en ojos, nariz, boca y contorno)
                    faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);

                    // Bounding Box y etiqueta (Verde si es el usuario de la foto, Rojo si desconocido)
                    const colorBox = esUsuario ? '#22C55E' : '#EF4444';
                    const etiqueta = `${nombreEtiqueta} (${distancia.toFixed(2)})`;

                    ctx.strokeStyle = colorBox;
                    ctx.lineWidth = 2.5;
                    ctx.strokeRect(box.x, box.y, box.width, box.height);

                    ctx.fillStyle = colorBox;
                    const textWidth = ctx.measureText(etiqueta).width + 12;
                    ctx.fillRect(box.x, box.y - 20, textWidth, 20);
                    ctx.fillStyle = '#FFFFFF';
                    ctx.font = 'bold 12px sans-serif';
                    ctx.fillText(etiqueta, box.x + 6, box.y - 6);

                    if (esUsuario) {
                        statusText.innerText = `¡Rostro verificado exitosamente (${nombreEtiqueta})!`;

                        // Si la contraseña ya fue verificada en el login, autorizar y pasar automáticamente
                        if (AppState.loginPasswordVerificada) {
                            verificadoExitoso = true;
                            detenerWebcam();
                            notificar('¡Datos y Rostro Verificados con Éxito! Accediendo...', 'success');
                            await confirmarLoginFacial(AppState.usuarioIdPendiente2FA, Array.from(detection.descriptor));
                        } else {
                            // Autocompletar usuario si no estaba escrito
                            const inputUser = document.getElementById('login-correo');
                            if (inputUser && !inputUser.value) {
                                inputUser.value = AppState.nombrePendiente2FA;
                            }
                            const passInput = document.getElementById('login-pass');
                            if (passInput && document.activeElement !== passInput) {
                                passInput.focus();
                            }
                            statusText.innerText = `Rostro reconocido (${nombreEtiqueta}). Ingresa tu contraseña y presiona Login para entrar.`;
                        }
                    } else {
                        statusText.innerText = `Rostro detectado: ${etiqueta}. Mantén la vista al frente...`;
                    }
                }
            } catch (err) {
                console.error('Error en loop de landmarks:', err);
            } finally {
                isProcessing = false;
            }
        }

        if (!verificadoExitoso && AppState.streamWebcamActivo) {
            trackingLoopId = requestAnimationFrame(tick);
        }
    }

    trackingLoopId = requestAnimationFrame(tick);
}

// Confirmar verificación facial en el servidor y otorgar acceso automático con alerta
async function confirmarLoginFacial(usuarioId, descriptor) {
    try {
        const res = await fetch('/api/auth/facial/verificar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuarioId, descriptor })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Verificación fallida');

        guardarSesion(data.token, data.usuario);
        cerrarModal('modal-auth');
        cerrarModalFacial();

        // Alerta solicitada explícitamente: datos verificados
        notificar(`¡Datos verificados! Bienvenido al sistema, ${data.usuario.nombre}.`, 'success');

        AppState.usuarioIdPendiente2FA = null;
        AppState.descriptorPendiente2FA = null;
        AppState.loginPasswordVerificada = false;

        if (data.usuario.rol === 'administrador') {
            navegarA('view-admin');
        } else {
            navegarA('view-catalogo');
        }
    } catch (e) {
        notificar(e.message, 'error');
    }
}

// Modal Registro Facial (Desde el perfil o post-registro si no subió foto)
async function abrirModalRegistroFacial() {
    abrirModal('modal-registro-facial');
    const video = document.getElementById('webcam-registro-video');
    try {
        await asegurarModelosFaciales();
        await iniciarWebcam(video);
    } catch (err) {
        notificar(err.message, 'error');
        cerrarModalRegistroFacial();
    }
}

function cerrarModalRegistroFacial() {
    detenerWebcam();
    cerrarModal('modal-registro-facial');
}

async function capturarYRegistrarRostro() {
    const video = document.getElementById('webcam-registro-video');
    const btn = document.getElementById('btn-capturar-registrar-rostro');

    btn.disabled = true;
    btn.innerText = 'Analizando biometría y puntos faciales...';

    try {
        await asegurarModelosFaciales();
        const detection = await faceapi.detectSingleFace(
            video,
            new faceapi.TinyFaceDetectorOptions()
        ).withFaceLandmarks().withFaceDescriptor();

        if (!detection) {
            throw new Error('No se detectó ningún rostro frente a la cámara. Asegúrate de mirar de frente con buena iluminación.');
        }

        const descriptor = Array.from(detection.descriptor);

        const res = await fetch('/api/auth/facial/registrar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AppState.token}`
            },
            body: JSON.stringify({ descriptor })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al registrar biometría');

        notificar('¡Rostro facial registrado y protegido con 2FA exitosamente!', 'success');
        cerrarModalRegistroFacial();
        if (AppState.usuario && AppState.usuario.rol === 'administrador') {
            navegarA('view-admin');
        } else {
            navegarA('view-catalogo');
        }
    } catch (err) {
        notificar(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="scan"></i> Capturar y Guardar Rostro Facial';
        lucide.createIcons();
    }
}

// Modal Verificación Facial (Cuando se abre el modal dedicado 2FA)
async function abrirModalFacialVerificacion() {
    abrirModal('modal-2fa-facial');
    const video = document.getElementById('webcam-verificar-video');
    const canvas = document.getElementById('webcam-verificar-canvas');
    try {
        await asegurarModelosFaciales();
        await iniciarWebcam(video);
        if (canvas) canvas.classList.remove('hidden');
    } catch (err) {
        notificar(err.message, 'error');
        cerrarModalFacial();
    }
}

function cerrarModalFacial() {
    detenerWebcam();
    cerrarModal('modal-2fa-facial');
}

async function escanearYVerificarRostro() {
    const video = document.getElementById('webcam-verificar-video');
    const btn = document.getElementById('btn-escanear-verificar-rostro');

    btn.disabled = true;
    btn.innerText = 'Comparando biometría en vivo...';

    try {
        await asegurarModelosFaciales();
        const detection = await faceapi.detectSingleFace(
            video,
            new faceapi.TinyFaceDetectorOptions()
        ).withFaceLandmarks().withFaceDescriptor();

        if (!detection) {
            throw new Error('No se detectó ningún rostro en la cámara. Mira de frente con buena luz.');
        }

        const descriptor = Array.from(detection.descriptor);
        await confirmarLoginFacial(AppState.usuarioIdPendiente2FA, descriptor);
    } catch (err) {
        notificar(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="camera"></i> Escanear y Verificar mi Rostro';
        lucide.createIcons();
    }
}

// ==================== MIS PROPIEDADES ====================
async function cargarMisPropiedades() {
    const container = document.getElementById('mis-propiedades-container');
    container.innerHTML = `
        <div class="state-box">
            <div class="spinner"></div>
            <p>Cargando tus publicaciones...</p>
        </div>
    `;

    try {
        const res = await fetch('/api/propiedades/mis-propiedades', {
            headers: { 'Authorization': `Bearer ${AppState.token}` }
        });
        if (!res.ok) throw new Error('Error al consultar propiedades');
        const data = await res.json();
        AppState.misPropiedades = data;

        if (data.length === 0) {
            container.innerHTML = `
                <div class="state-box">
                    <p>Aún no has registrado ninguna propiedad en venta.</p>
                    <button class="btn btn-primary btn-sm" style="margin-top:1rem;" onclick="navegarA('view-publicar')">Publicar mi primera casa</button>
                </div>
            `;
            return;
        }

        container.innerHTML = data.map(p => {
            const foto = p.fotografias && p.fotografias.length > 0 ? p.fotografias[0] : '';
            const precio = Number(p.precio).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

            return `
                <div class="my-prop-card" id="my-prop-${p.id}">
                    <img src="${foto}" class="my-prop-thumb" alt="${p.titulo}" onerror="this.src='https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=400&q=80'">
                    <div class="my-prop-info">
                        <h4 class="my-prop-title">${p.titulo}</h4>
                        <div class="my-prop-meta">
                            <span><strong>${precio}</strong></span>
                            <span>${p.ubicacion}</span>
                            <span>Estado: <span class="badge-status badge-${p.publicacion_estado}">${p.publicacion_estado}</span></span>
                        </div>
                        ${p.observaciones ? `<p style="font-size:0.8rem; color:var(--text-muted); margin-top:0.35rem;">Observaciones: ${p.observaciones}</p>` : ''}
                    </div>
                    <div class="my-prop-actions">
                        <button class="btn btn-outline btn-sm" onclick="abrirEditarPropiedad(${p.id})">
                            <i data-lucide="edit"></i> Editar
                        </button>
                        <button class="btn btn-outline btn-sm" style="color:var(--danger);" onclick="eliminarMiPropiedad(${p.id})">
                            <i data-lucide="trash-2"></i> Eliminar
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        lucide.createIcons();
    } catch (err) {
        container.innerHTML = `<div class="state-box"><p>${err.message}</p></div>`;
    }
}

function abrirEditarPropiedad(id) {
    const p = AppState.misPropiedades.find(item => item.id === id);
    if (!p) return;

    document.getElementById('edit-id').value = p.id;
    document.getElementById('edit-titulo').value = p.titulo;
    document.getElementById('edit-ubicacion').value = p.ubicacion;
    document.getElementById('edit-precio').value = p.precio;
    document.getElementById('edit-contacto').value = p.contacto_vendedor;
    document.getElementById('edit-habs').value = p.habitaciones;
    document.getElementById('edit-banos').value = p.banos;
    document.getElementById('edit-terreno').value = p.superficie_terreno;
    document.getElementById('edit-construccion').value = p.superficie_construccion;
    document.getElementById('edit-descripcion').value = p.descripcion;
    document.getElementById('edit-fotos').value = (p.fotografias || []).join(', ');

    abrirModal('modal-editar-propiedad');
}

async function eliminarMiPropiedad(id) {
    if (!confirm('¿Estás seguro de que deseas eliminar esta propiedad de la plataforma?')) return;

    try {
        const res = await fetch(`/api/propiedades/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${AppState.token}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al eliminar');

        notificar('Propiedad eliminada correctamente', 'success');
        cargarMisPropiedades();
        cargarCatalogoPublico();
    } catch (e) {
        notificar(e.message, 'error');
    }
}

// ==================== PANEL ADMINISTRADOR ====================
async function cargarEstadisticasAdmin() {
    try {
        const res = await fetch('/api/admin/estadisticas', {
            headers: { 'Authorization': `Bearer ${AppState.token}` }
        });
        if (!res.ok) return;
        const s = await res.json();

        document.getElementById('stat-total-usuarios').innerText = s.total_usuarios;
        document.getElementById('stat-total-propiedades').innerText = s.total_propiedades;
        document.getElementById('stat-pendientes').innerText = s.pendientes;
        document.getElementById('stat-aprobadas').innerText = s.aprobadas;
    } catch (e) {
        console.error(e);
    }
}

async function cargarConteoPendientesAdmin() {
    try {
        const res = await fetch('/api/admin/estadisticas', {
            headers: { 'Authorization': `Bearer ${AppState.token}` }
        });
        if (!res.ok) return;
        const s = await res.json();
        const badge = document.getElementById('nav-pending-badge');
        if (badge) badge.innerText = s.pendientes;
    } catch (e) {}
}

async function cargarPublicacionesAdmin() {
    const container = document.getElementById('admin-publicaciones-container');
    container.innerHTML = `
        <div class="state-box">
            <div class="spinner"></div>
            <p>Cargando publicaciones para revisión...</p>
        </div>
    `;

    try {
        let url = '/api/admin/publicaciones';
        if (AppState.filtroEstadoAdmin) url += `?estado=${AppState.filtroEstadoAdmin}`;

        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${AppState.token}` }
        });
        if (!res.ok) throw new Error('Error al cargar publicaciones');
        const rows = await res.json();
        AppState.adminPublicaciones = rows;

        if (rows.length === 0) {
            container.innerHTML = `<div class="state-box"><p>No hay publicaciones en este estado.</p></div>`;
            return;
        }

        container.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Inmueble</th>
                        <th>Vendedor / Propietario</th>
                        <th>Precio</th>
                        <th>Estado Actual</th>
                        <th>Observaciones</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(r => `
                        <tr>
                            <td>
                                <strong>${r.titulo}</strong><br>
                                <small style="color:var(--text-muted);">${r.ubicacion}</small>
                            </td>
                            <td>
                                ${r.propietario}<br>
                                <small style="color:var(--text-muted);">${r.contacto_vendedor}</small>
                            </td>
                            <td><strong>${Number(r.precio).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</strong></td>
                            <td><span class="badge-status badge-${r.estado}">${r.estado}</span></td>
                            <td><small style="color:var(--text-secondary);">${r.observaciones || '-'}</small></td>
                            <td>
                                <div style="display:flex; gap:0.4rem;">
                                    ${r.estado !== 'aprobada' ? `
                                        <button class="btn btn-sm btn-primary" onclick="adminCambiarEstado(${r.publicacion_id}, 'aprobada')">
                                            Aprobar
                                        </button>
                                    ` : ''}
                                    ${r.estado !== 'rechazada' ? `
                                        <button class="btn btn-sm btn-outline" style="color:var(--warning);" onclick="adminCambiarEstado(${r.publicacion_id}, 'rechazada')">
                                            Rechazar
                                        </button>
                                    ` : ''}
                                    <button class="btn btn-sm btn-outline" style="color:var(--danger);" onclick="adminEliminarPublicacion(${r.publicacion_id})">
                                        Eliminar
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (e) {
        container.innerHTML = `<div class="state-box"><p>${e.message}</p></div>`;
    }
}

async function adminCambiarEstado(pubId, nuevoEstado) {
    let observaciones = '';
    if (nuevoEstado === 'rechazada') {
        observaciones = prompt('Indica el motivo de rechazo de la publicación:');
        if (observaciones === null) return;
    } else {
        observaciones = 'Autorizada por administración para el catálogo público.';
    }

    try {
        const res = await fetch(`/api/admin/publicaciones/${pubId}/estado`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AppState.token}`
            },
            body: JSON.stringify({ estado: nuevoEstado, observaciones })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al cambiar estado');

        notificar(data.mensaje, 'success');
        cargarPublicacionesAdmin();
        cargarEstadisticasAdmin();
        cargarCatalogoPublico();
    } catch (e) {
        notificar(e.message, 'error');
    }
}

async function adminEliminarPublicacion(pubId) {
    if (!confirm('¿Eliminar definitivamente esta publicación y su propiedad del sistema?')) return;

    try {
        const res = await fetch(`/api/admin/publicaciones/${pubId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${AppState.token}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al eliminar');

        notificar('Publicación eliminada del sistema', 'success');
        cargarPublicacionesAdmin();
        cargarEstadisticasAdmin();
        cargarCatalogoPublico();
    } catch (e) {
        notificar(e.message, 'error');
    }
}

// Cargar Usuarios en Admin
async function cargarUsuariosAdmin() {
    const container = document.getElementById('admin-usuarios-container');
    container.innerHTML = `
        <div class="state-box">
            <div class="spinner"></div>
            <p>Cargando cuentas de usuarios...</p>
        </div>
    `;

    try {
        const res = await fetch('/api/admin/usuarios', {
            headers: { 'Authorization': `Bearer ${AppState.token}` }
        });
        if (!res.ok) throw new Error('Error al cargar usuarios');
        const usuarios = await res.json();
        AppState.adminUsuarios = usuarios;

        container.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Usuario</th>
                        <th>Correo</th>
                        <th>Teléfono</th>
                        <th>Rol</th>
                        <th>Propiedades</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    ${usuarios.map(u => `
                        <tr>
                            <td><strong>${u.nombre_completo}</strong></td>
                            <td>${u.correo}</td>
                            <td>${u.telefono || '-'}</td>
                            <td>
                                <select onchange="adminCambiarRolUsuario(${u.id}, this.value)" style="padding:0.25rem 0.5rem; border-radius:var(--radius-sm); border:1px solid var(--border-color);">
                                    <option value="usuario" ${u.rol === 'usuario' ? 'selected' : ''}>Usuario</option>
                                    <option value="administrador" ${u.rol === 'administrador' ? 'selected' : ''}>Administrador</option>
                                </select>
                            </td>
                            <td>${u.total_propiedades}</td>
                            <td>
                                ${u.id !== AppState.usuario.id ? `
                                    <button class="btn btn-sm btn-outline" style="color:var(--danger);" onclick="adminEliminarUsuario(${u.id})">
                                        Eliminar
                                    </button>
                                ` : '<small style="color:var(--text-muted);">Tu cuenta</small>'}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (e) {
        container.innerHTML = `<div class="state-box"><p>${e.message}</p></div>`;
    }
}

async function adminCambiarRolUsuario(id, nuevoRol) {
    try {
        const res = await fetch(`/api/admin/usuarios/${id}/rol`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AppState.token}`
            },
            body: JSON.stringify({ rol: nuevoRol })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al cambiar rol');
        notificar(data.mensaje, 'success');
    } catch (e) {
        notificar(e.message, 'error');
        cargarUsuariosAdmin();
    }
}

async function adminEliminarUsuario(id) {
    if (!confirm('¿Eliminar la cuenta de este usuario y todas sus publicaciones asociadas?')) return;

    try {
        const res = await fetch(`/api/admin/usuarios/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${AppState.token}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al eliminar usuario');

        notificar('Usuario eliminado', 'success');
        cargarUsuariosAdmin();
        cargarEstadisticasAdmin();
    } catch (e) {
        notificar(e.message, 'error');
    }
}


// ==================== UTILIDADES DE MODALES ====================
function abrirModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
}

function cerrarModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
    if (id === 'modal-auth' || id === 'modal-2fa-facial' || id === 'modal-registro-facial') {
        detenerWebcam();
    }
}

function cambiarAuthPestana(tab) {
    const cardLogin = document.getElementById('card-login-view');
    const cardReg = document.getElementById('card-registro-view');
    const btnLogin = document.getElementById('btn-tab-login');
    const btnReg = document.getElementById('btn-tab-registro');

    detenerWebcam();
    const camBox = document.getElementById('login-camera-container');
    if (camBox) camBox.classList.add('hidden');

    if (tab === 'login') {
        if (cardLogin) cardLogin.classList.remove('hidden');
        if (cardReg) cardReg.classList.add('hidden');
        if (btnLogin) btnLogin.classList.add('active');
        if (btnReg) btnReg.classList.remove('active');
    } else {
        if (cardLogin) cardLogin.classList.add('hidden');
        if (cardReg) cardReg.classList.remove('hidden');
        if (btnLogin) btnLogin.classList.remove('active');
        if (btnReg) btnReg.classList.add('active');
    }
    if (window.lucide) lucide.createIcons();
}

// Modales Estáticos: No se cierran al hacer clic fuera de ellos (backdrop estático)
window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) {
        // No cerrar la pantalla. Efecto táctil sutil de rebote para indicar que es estático
        const dialog = e.target.querySelector('.modal-dialog');
        if (dialog) {
            dialog.classList.remove('modal-static-bounce');
            void dialog.offsetWidth; // Forzar reflow para reiniciar animación
            dialog.classList.add('modal-static-bounce');
        }
    }
});
