// Archivo: js/auth.js

// Función auxiliar para mostrar mensajes de error o éxito en la pantalla
function mostrarAlerta(mensaje, tipo = 'error') {
    const alerta = document.getElementById('mensaje-alerta');
    if (!alerta) return;

    alerta.textContent = mensaje;
    alerta.className = `alert alert-${tipo}`;
    alerta.style.display = 'block';
}

// Función auxiliar para redirigir según el rol del usuario
function redirigirPorRol(rol) {
    if (rol === 'admin') {
        window.location.href = 'panel-admin.html';
    } else if (rol === 'profesor') {
        window.location.href = 'panel-profesor.html';
    } else {
        window.location.href = 'panel-alumno.html';
    }
}

// 1. LÓGICA DE REGISTRO (registro.html) - Siempre crea cuentas de alumno
const formRegistro = document.getElementById('form-registro');
if (formRegistro) {
    formRegistro.addEventListener('submit', async (e) => {
        e.preventDefault();

        const btnRegistro = document.getElementById('btn-registro');
        const nombre = document.getElementById('nombre').value.trim();
        const correo = document.getElementById('correo').value.trim();
        const password = document.getElementById('password').value;

        btnRegistro.disabled = true;
        btnRegistro.textContent = 'Registrando...';

        const { data, error } = await supabaseClient.auth.signUp({
            email: correo,
            password: password,
            options: {
                data: {
                    nombre: nombre
                }
            }
        });

        if (error) {
            mostrarAlerta('Error al registrar: ' + error.message, 'error');
            btnRegistro.disabled = false;
            btnRegistro.textContent = 'Registrarme';
            return;
        }

        mostrarAlerta('¡Cuenta de alumno creada con éxito! Redirigiendo...', 'success');
        setTimeout(() => {
            redirigirPorRol('alumno');
        }, 1200);
    });
}

// 2. LÓGICA DE INICIO DE SESIÓN (index.html)
const formLogin = document.getElementById('form-login');
if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();

        const btnLogin = document.getElementById('btn-login');
        const correo = document.getElementById('correo').value.trim();
        const password = document.getElementById('password').value;

        btnLogin.disabled = true;
        btnLogin.textContent = 'Ingresando...';

        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: correo,
            password: password
        });

        if (error) {
            mostrarAlerta('Correo o contraseña incorrectos.', 'error');
            btnLogin.disabled = false;
            btnLogin.textContent = 'Iniciar Sesión';
            return;
        }

        // Consultamos su perfil para saber si es admin, profesor o alumno
        const { data: perfil, error: perfilError } = await supabaseClient
            .from('perfiles')
            .select('rol')
            .eq('id', data.user.id)
            .single();

        if (perfilError || !perfil) {
            mostrarAlerta('No se pudo obtener el perfil del usuario.', 'error');
            btnLogin.disabled = false;
            btnLogin.textContent = 'Iniciar Sesión';
            return;
        }

        redirigirPorRol(perfil.rol);
    });
}

// 3. LÓGICA DE CIERRE DE SESIÓN
const btnLogout = document.getElementById('btn-logout');
if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
        await supabaseClient.auth.signOut();
        window.location.href = 'index.html';
    });
}

// 4. PROTECCIÓN DE RUTAS Y VERIFICACIÓN DE SESIÓN
async function verificarSesion(rolRequerido = null) {
    const { data: { session } } = await supabaseClient.auth.getSession();

    if (!session) {
        window.location.href = 'index.html';
        return null;
    }

    const { data: perfil, error } = await supabaseClient
        .from('perfiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

    if (error || !perfil) {
        await supabaseClient.auth.signOut();
        window.location.href = 'index.html';
        return null;
    }

    if (rolRequerido && perfil.rol !== rolRequerido) {
        redirigirPorRol(perfil.rol);
        return null;
    }

    const spanNombre = document.getElementById('nombre-usuario');
    if (spanNombre) {
        spanNombre.textContent = perfil.nombre;
    }

    return perfil;
}

// Redirigir si el usuario ya tiene sesión activa y entra a index.html o registro.html
(async function verificarUsuarioYaLogueado() {
    const esPaginaPublica = document.getElementById('form-login') || document.getElementById('form-registro');
    if (!esPaginaPublica) return;

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        const { data: perfil } = await supabaseClient
            .from('perfiles')
            .select('rol')
            .eq('id', session.user.id)
            .single();

        if (perfil) {
            redirigirPorRol(perfil.rol);
        }
    }
})();