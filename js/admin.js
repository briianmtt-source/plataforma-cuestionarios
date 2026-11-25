// Archivo: js/admin.js
let perfilAdmin = null;
let listaUsuariosCache = [];

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Verificar sesión y exigir rol 'admin'
    perfilAdmin = await verificarSesion('admin');
    if (!perfilAdmin) return;

    // 2. Cargar usuarios y materias iniciales
    await cargarUsuarios();
    await cargarMateriasAdmin();

    // 3. Filtro de búsqueda en tiempo real para usuarios
    const buscador = document.getElementById('buscador-usuarios');
    if (buscador) {
        buscador.addEventListener('input', (e) => {
            const termino = e.target.value.toLowerCase().trim();
            const filtrados = listaUsuariosCache.filter(u =>
                u.nombre.toLowerCase().includes(termino) ||
                u.correo.toLowerCase().includes(termino)
            );
            renderizarTablaUsuarios(filtrados);
        });
    }

    // 4. Formulario para agregar nueva materia
    const formMateria = document.getElementById('form-nueva-materia');
    if (formMateria) {
        formMateria.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('btn-agregar-materia');
            const nombre = document.getElementById('nombre-materia').value.trim();
            const descripcion = document.getElementById('desc-materia').value.trim();

            btn.disabled = true;
            btn.textContent = 'Guardando...';

            const { error } = await supabaseClient
                .from('materias')
                .insert([{ nombre, descripcion }]);

            btn.disabled = false;
            btn.textContent = '+ Agregar Materia';

            if (error) {
                mostrarAlerta('Error al agregar materia: ' + error.message, 'error');
                return;
            }

            formMateria.reset();
            mostrarAlerta(`Materia "${nombre}" agregada correctamente.`, 'success');
            await cargarMateriasAdmin();
        });
    }
});

// =========================================================
// GESTIÓN DE USUARIOS Y ROLES
// =========================================================

async function cargarUsuarios() {
    const { data: usuarios, error } = await supabaseClient
        .from('perfiles')
        .select('id, nombre, correo, rol, creado_en')
        .order('creado_en', { ascending: false });

    if (error) {
        mostrarAlerta('Error al cargar usuarios: ' + error.message, 'error');
        return;
    }

    listaUsuariosCache = usuarios || [];
    renderizarTablaUsuarios(listaUsuariosCache);
}

function renderizarTablaUsuarios(usuarios) {
    const tbody = document.getElementById('tabla-usuarios-admin');
    if (!tbody) return;

    if (usuarios.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; color: var(--text-muted);">
                    No se encontraron usuarios.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = usuarios.map(u => {
        // Etiqueta visual del rol
        let badgeClass = 'badge-borrador';
        if (u.rol === 'admin') badgeClass = 'badge-cerrado';
        if (u.rol === 'profesor') badgeClass = 'badge-publicado';

        // Evitar que el admin actual se quite su propio rol por accidente
        let botonAccion = '';
        if (u.id === perfilAdmin.id) {
            botonAccion = `<span style="font-size: 0.85rem; color: var(--text-muted);">Tu cuenta actual</span>`;
        } else if (u.rol === 'alumno') {
            botonAccion = `<button onclick="cambiarRolUsuario('${u.id}', 'profesor', '${u.nombre}')" class="btn btn-primary btn-sm">Promover a Profesor</button>`;
        } else if (u.rol === 'profesor') {
            botonAccion = `<button onclick="cambiarRolUsuario('${u.id}', 'alumno', '${u.nombre}')" class="btn btn-secondary btn-sm">Cambiar a Alumno</button>`;
        } else {
            botonAccion = `<span style="font-size: 0.85rem; color: var(--text-muted);">Administrador</span>`;
        }

        return `
            <tr>
                <td><strong>${u.nombre}</strong></td>
                <td>${u.correo}</td>
                <td><span class="badge ${badgeClass}">${u.rol.toUpperCase()}</span></td>
                <td>${botonAccion}</td>
            </tr>
        `;
    }).join('');
}

async function cambiarRolUsuario(usuarioId, nuevoRol, nombreUsuario) {
    const accionTexto = nuevoRol === 'profesor' ? 'promover a Profesor' : 'cambiar a Alumno';
    const confirmar = confirm(`¿Seguro que deseas ${accionTexto} a ${nombreUsuario}?`);
    if (!confirmar) return;

    const { error } = await supabaseClient
        .from('perfiles')
        .update({ rol: nuevoRol })
        .eq('id', usuarioId);

    if (error) {
        mostrarAlerta('No se pudo cambiar el rol: ' + error.message, 'error');
        return;
    }

    mostrarAlerta(`El rol de ${nombreUsuario} ahora es "${nuevoRol}".`, 'success');
    await cargarUsuarios();
}

// =========================================================
// GESTIÓN DE MATERIAS
// =========================================================

async function cargarMateriasAdmin() {
    const tbody = document.getElementById('tabla-materias-admin');
    if (!tbody) return;

    const { data: materias, error } = await supabaseClient
        .from('materias')
        .select('*')
        .order('nombre', { ascending: true });

    if (error) {
        mostrarAlerta('Error al cargar materias: ' + error.message, 'error');
        return;
    }

    if (!materias || materias.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3" style="text-align: center; color: var(--text-muted);">
                    No hay materias registradas.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = materias.map(m => `
        <tr>
            <td><strong>${m.nombre}</strong></td>
            <td style="color: var(--text-muted);">${m.descripcion || 'Sin descripción'}</td>
            <td>
                <button onclick="eliminarMateria('${m.id}', '${m.nombre}')" class="btn btn-danger btn-sm">Eliminar</button>
            </td>
        </tr>
    `).join('');
}

async function eliminarMateria(materiaId, nombreMateria) {
    const confirmar = confirm(`¿Eliminar la materia "${nombreMateria}"? Los cuestionarios asociados quedarán sin materia asignada.`);
    if (!confirmar) return;

    const { error } = await supabaseClient
        .from('materias')
        .delete()
        .eq('id', materiaId);

    if (error) {
        mostrarAlerta('Error al eliminar materia: ' + error.message, 'error');
        return;
    }

    mostrarAlerta(`Materia "${nombreMateria}" eliminada.`, 'success');
    await cargarMateriasAdmin();
}