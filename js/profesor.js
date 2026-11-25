// Archivo: js/profesor.js
let perfilProfesor = null;
let cuestionarioActualId = null;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Verificar sesión y asegurar que sea profesor
    perfilProfesor = await verificarSesion('profesor');
    if (!perfilProfesor) return;

    // 2. Ruta A: Panel principal del profesor (panel-profesor.html)
    const contenedorCuestionarios = document.getElementById('lista-cuestionarios-profesor');
    if (contenedorCuestionarios) {
        await cargarCuestionariosProfesor();
    }

    // 3. Ruta B: Editor de cuestionarios (crear-cuestionario.html)
    const formCuestionario = document.getElementById('form-cuestionario');
    if (formCuestionario) {
        await inicializarEditorCuestionario();
    }

    // 4. Ruta C: Resultados y estadísticas del profesor (resultados-profesor.html)
    const tablaResultados = document.getElementById('tabla-resultados-profesor');
    if (tablaResultados) {
        await cargarEstadisticasCuestionario();
    }
});

// =========================================================
// FUNCIONES DEL PANEL PRINCIPAL (panel-profesor.html)
// =========================================================

async function cargarCuestionariosProfesor() {
    const contenedor = document.getElementById('lista-cuestionarios-profesor');

    const { data: cuestionarios, error } = await supabaseClient
        .from('cuestionarios')
        .select(`
            id,
            titulo,
            descripcion,
            tiempo_limite,
            intentos_permitidos,
            estado,
            creado_en,
            materias ( nombre )
        `)
        .eq('profesor_id', perfilProfesor.id)
        .order('creado_en', { ascending: false });

    if (error) {
        mostrarAlerta('Error al cargar tus cuestionarios: ' + error.message, 'error');
        return;
    }

    if (!cuestionarios || cuestionarios.length === 0) {
        contenedor.innerHTML = `
            <div class="card">
                <h3 class="card-title">Aún no tienes cuestionarios</h3>
                <p style="color: var(--text-muted); margin-bottom: 1rem;">
                    Crea tu primer examen haciendo clic en el botón "+ Nuevo Cuestionario".
                </p>
            </div>
        `;
        return;
    }

    contenedor.innerHTML = cuestionarios.map(c => {
        const nombreMateria = c.materias ? c.materias.nombre : 'Sin materia';
        const textoTiempo = c.tiempo_limite > 0 ? `${c.tiempo_limite} min` : 'Sin límite';

        let botonEstado = '';
        if (c.estado === 'borrador') {
            botonEstado = `<button onclick="cambiarEstadoCuestionario('${c.id}', 'publicado')" class="btn btn-primary btn-sm">Publicar</button>`;
        } else if (c.estado === 'publicado') {
            botonEstado = `<button onclick="cambiarEstadoCuestionario('${c.id}', 'cerrado')" class="btn btn-secondary btn-sm">Cerrar</button>`;
        } else {
            botonEstado = `<button onclick="cambiarEstadoCuestionario('${c.id}', 'publicado')" class="btn btn-primary btn-sm">Reabrir</button>`;
        }

        return `
            <article class="card">
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: start; gap: 0.5rem; margin-bottom: 0.5rem;">
                        <span style="font-size: 0.8rem; font-weight: 600; color: var(--primary);">${nombreMateria}</span>
                        <span class="badge badge-${c.estado}">${c.estado}</span>
                    </div>
                    <h3 class="card-title">${c.titulo}</h3>
                    <p style="color: var(--text-muted); font-size: 0.9rem;">
                        ${c.descripcion || 'Sin descripción'}
                    </p>
                    <div class="card-meta">
                        ⏱ Tiempo: ${textoTiempo} &nbsp;|&nbsp; 🔄 Intentos: ${c.intentos_permitidos}
                    </div>
                </div>
                <div class="card-actions">
                    <a href="crear-cuestionario.html?id=${c.id}" class="btn btn-secondary btn-sm">Editar</a>
                    <a href="resultados-profesor.html?id=${c.id}" class="btn btn-primary btn-sm" style="background-color: var(--success);">Resultados</a>
                    ${botonEstado}
                    <button onclick="eliminarCuestionario('${c.id}')" class="btn btn-danger btn-sm">Eliminar</button>
                </div>
            </article>
        `;
    }).join('');
}

async function cambiarEstadoCuestionario(cuestionarioId, nuevoEstado) {
    const { error } = await supabaseClient
        .from('cuestionarios')
        .update({ estado: nuevoEstado })
        .eq('id', cuestionarioId);

    if (error) {
        mostrarAlerta('No se pudo actualizar el estado: ' + error.message, 'error');
        return;
    }

    mostrarAlerta(`Cuestionario marcado como "${nuevoEstado}".`, 'success');
    await cargarCuestionariosProfesor();
}

async function eliminarCuestionario(cuestionarioId) {
    const confirmar = confirm('¿Estás seguro de eliminar este cuestionario? Se borrarán también todas sus preguntas y resultados.');
    if (!confirmar) return;

    const { error } = await supabaseClient
        .from('cuestionarios')
        .delete()
        .eq('id', cuestionarioId);

    if (error) {
        mostrarAlerta('Error al eliminar: ' + error.message, 'error');
        return;
    }

    mostrarAlerta('Cuestionario eliminado correctamente.', 'success');
    await cargarCuestionariosProfesor();
}

// =========================================================
// FUNCIONES DEL EDITOR (crear-cuestionario.html)
// =========================================================

function renderizarCamposOpciones(tipo) {
    const contenedor = document.getElementById('contenedor-opciones-inputs');
    if (tipo === 'verdadero_falso') {
        contenedor.innerHTML = `
            <div class="form-group" style="display: flex; align-items: center; gap: 0.5rem;">
                <input type="radio" name="correcta" value="0" required title="Marcar como correcta">
                <input type="text" class="form-control opcion-texto" value="Verdadero" readonly required>
            </div>
            <div class="form-group" style="display: flex; align-items: center; gap: 0.5rem;">
                <input type="radio" name="correcta" value="1" required title="Marcar como correcta">
                <input type="text" class="form-control opcion-texto" value="Falso" readonly required>
            </div>
        `;
    } else {
        contenedor.innerHTML = [0, 1, 2, 3].map(i => `
            <div class="form-group" style="display: flex; align-items: center; gap: 0.5rem;">
                <input type="radio" name="correcta" value="${i}" required title="Marcar como correcta">
                <input type="text" class="form-control opcion-texto" placeholder="Opción ${String.fromCharCode(65 + i)}" required>
            </div>
        `).join('');
    }
}

async function inicializarEditorCuestionario() {
    const selectMateria = document.getElementById('materia');
    const { data: materias } = await supabaseClient.from('materias').select('*').order('nombre');
    if (materias) {
        selectMateria.innerHTML = materias.map(m => `<option value="${m.id}">${m.nombre}</option>`).join('');
    }

    // Cambiar campos de opciones dinámicamente según el tipo de pregunta elegido
    const selectTipo = document.getElementById('tipo-pregunta');
    selectTipo.addEventListener('change', (e) => {
        renderizarCamposOpciones(e.target.value);
    });

    const params = new URLSearchParams(window.location.search);
    cuestionarioActualId = params.get('id');

    if (cuestionarioActualId) {
        document.getElementById('titulo-pagina').textContent = 'Editar Cuestionario y Preguntas';
        document.getElementById('btn-guardar-cuestionario').textContent = 'Actualizar Datos Generales';
        document.getElementById('seccion-preguntas').style.display = 'block';
        await cargarDatosCuestionarioExistente(cuestionarioActualId);
        await cargarPreguntasGuardadas(cuestionarioActualId);
    }

    document.getElementById('form-cuestionario').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btn-guardar-cuestionario');
        btn.disabled = true;

        const datos = {
            titulo: document.getElementById('titulo').value.trim(),
            materia_id: document.getElementById('materia').value,
            descripcion: document.getElementById('descripcion').value.trim(),
            tiempo_limite: parseInt(document.getElementById('tiempo_limite').value, 10) || 0,
            intentos_permitidos: parseInt(document.getElementById('intentos_permitidos').value, 10) || 1,
            profesor_id: perfilProfesor.id
        };

        if (!cuestionarioActualId) {
            const { data, error } = await supabaseClient
                .from('cuestionarios')
                .insert([datos])
                .select()
                .single();

            btn.disabled = false;
            if (error) {
                mostrarAlerta('Error al crear cuestionario: ' + error.message, 'error');
                return;
            }

            cuestionarioActualId = data.id;
            window.history.replaceState({}, '', `crear-cuestionario.html?id=${cuestionarioActualId}`);
            document.getElementById('titulo-pagina').textContent = 'Editar Cuestionario y Preguntas';
            btn.textContent = 'Actualizar Datos Generales';
            document.getElementById('seccion-preguntas').style.display = 'block';
            mostrarAlerta('¡Cuestionario creado! Ahora agrega las preguntas abajo.', 'success');
        } else {
            const { error } = await supabaseClient
                .from('cuestionarios')
                .update(datos)
                .eq('id', cuestionarioActualId);

            btn.disabled = false;
            if (error) {
                mostrarAlerta('Error al actualizar: ' + error.message, 'error');
                return;
            }
            mostrarAlerta('Datos del cuestionario actualizados.', 'success');
        }
    });

    document.getElementById('form-pregunta').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!cuestionarioActualId) return;

        const btnAgregar = document.getElementById('btn-agregar-pregunta');
        btnAgregar.disabled = true;
        btnAgregar.textContent = 'Guardando pregunta...';

        const tipoPregunta = document.getElementById('tipo-pregunta').value;
        const textoPregunta = document.getElementById('texto-pregunta').value.trim();
        const inputsOpciones = document.querySelectorAll('.opcion-texto');
        const radioSeleccionado = document.querySelector('input[name="correcta"]:checked');

        if (!radioSeleccionado) {
            mostrarAlerta('Debes marcar cuál de las opciones es la respuesta correcta.', 'error');
            btnAgregar.disabled = false;
            btnAgregar.textContent = '+ Agregar Pregunta al Cuestionario';
            return;
        }

        const indiceCorrecto = parseInt(radioSeleccionado.value, 10);

        const { data: preguntaCreada, error: errorPregunta } = await supabaseClient
            .from('preguntas')
            .insert([{
                cuestionario_id: cuestionarioActualId,
                pregunta: textoPregunta,
                tipo: tipoPregunta
            }])
            .select()
            .single();

        if (errorPregunta) {
            mostrarAlerta('Error al guardar la pregunta: ' + errorPregunta.message, 'error');
            btnAgregar.disabled = false;
            btnAgregar.textContent = '+ Agregar Pregunta al Cuestionario';
            return;
        }

        const opcionesAInsertar = Array.from(inputsOpciones).map((input, idx) => ({
            pregunta_id: preguntaCreada.id,
            texto: input.value.trim(),
            es_correcta: idx === indiceCorrecto
        }));

        const { error: errorOpciones } = await supabaseClient
            .from('opciones')
            .insert(opcionesAInsertar);

        btnAgregar.disabled = false;
        btnAgregar.textContent = '+ Agregar Pregunta al Cuestionario';

        if (errorOpciones) {
            mostrarAlerta('Error al guardar las opciones: ' + errorOpciones.message, 'error');
            return;
        }

        // Restablecer formulario y mantener sincronizados los campos según el tipo seleccionado
        document.getElementById('texto-pregunta').value = '';
        renderizarCamposOpciones(tipoPregunta);
        mostrarAlerta('Pregunta agregada correctamente.', 'success');
        await cargarPreguntasGuardadas(cuestionarioActualId);
    });

    document.getElementById('btn-publicar-ahora').addEventListener('click', async () => {
        if (!cuestionarioActualId) return;
        const { error } = await supabaseClient
            .from('cuestionarios')
            .update({ estado: 'publicado' })
            .eq('id', cuestionarioActualId);

        if (error) {
            mostrarAlerta('Error al publicar: ' + error.message, 'error');
            return;
        }
        window.location.href = 'panel-profesor.html';
    });
}

async function cargarDatosCuestionarioExistente(id) {
    const { data: c, error } = await supabaseClient
        .from('cuestionarios')
        .select('*')
        .eq('id', id)
        .single();

    if (error || !c) return;

    document.getElementById('titulo').value = c.titulo;
    document.getElementById('materia').value = c.materia_id || '';
    document.getElementById('descripcion').value = c.descripcion || '';
    document.getElementById('tiempo_limite').value = c.tiempo_limite;
    document.getElementById('intentos_permitidos').value = c.intentos_permitidos;
}

async function cargarPreguntasGuardadas(cuestionarioId) {
    const contenedor = document.getElementById('lista-preguntas-guardadas');
    const contador = document.getElementById('contador-preguntas');

    const { data: preguntas, error } = await supabaseClient
        .from('preguntas')
        .select(`
            id,
            pregunta,
            tipo,
            opciones ( id, texto, es_correcta )
        `)
        .eq('cuestionario_id', cuestionarioId);

    if (error) {
        mostrarAlerta('Error al cargar preguntas: ' + error.message, 'error');
        return;
    }

    contador.textContent = preguntas.length;

    if (preguntas.length === 0) {
        contenedor.innerHTML = `<div class="card"><p style="color: var(--text-muted);">Aún no hay preguntas en este cuestionario.</p></div>`;
        return;
    }

    contenedor.innerHTML = preguntas.map((p, index) => {
        const etiquetaTipo = p.tipo === 'verdadero_falso' ? 'Verdadero / Falso' : 'Opción múltiple';
        const opcionesHtml = p.opciones.map(o => `
            <li style="margin-bottom: 0.3rem; color: ${o.es_correcta ? 'var(--success)' : 'var(--text-main)'}; font-weight: ${o.es_correcta ? '700' : '400'};">
                ${o.es_correcta ? '✔ ' : '• '} ${o.texto}
            </li>
        `).join('');

        return `
            <div class="card" style="margin-bottom: 1rem;">
                <div style="display: flex; justify-content: space-between; align-items: start; gap: 1rem;">
                    <div>
                        <span style="font-size: 0.75rem; font-weight: 600; color: var(--secondary); text-transform: uppercase;">${etiquetaTipo}</span>
                        <h3 style="font-size: 1.05rem; margin: 0.2rem 0 0.5rem 0;">${index + 1}. ${p.pregunta}</h3>
                        <ul style="list-style: none; padding-left: 0.5rem;">
                            ${opcionesHtml}
                        </ul>
                    </div>
                    <button onclick="eliminarPregunta('${p.id}')" class="btn btn-danger btn-sm">Eliminar</button>
                </div>
            </div>
        `;
    }).join('');
}

async function eliminarPregunta(preguntaId) {
    const { error } = await supabaseClient
        .from('preguntas')
        .delete()
        .eq('id', preguntaId);

    if (error) {
        mostrarAlerta('Error al borrar la pregunta: ' + error.message, 'error');
        return;
    }

    mostrarAlerta('Pregunta eliminada.', 'success');
    await cargarPreguntasGuardadas(cuestionarioActualId);
}

// =========================================================
// FUNCIONES DE RESULTADOS Y ESTADÍSTICAS (resultados-profesor.html)
// =========================================================

async function cargarEstadisticasCuestionario() {
    const params = new URLSearchParams(window.location.search);
    const cuestionarioId = params.get('id');

    if (!cuestionarioId) {
        window.location.href = 'panel-profesor.html';
        return;
    }

    const { data: cuestionario, error: errorCuest } = await supabaseClient
        .from('cuestionarios')
        .select(`titulo, materias ( nombre )`)
        .eq('id', cuestionarioId)
        .eq('profesor_id', perfilProfesor.id)
        .single();

    if (errorCuest || !cuestionario) {
        mostrarAlerta('No tienes permiso para ver los resultados de este cuestionario.', 'error');
        return;
    }

    document.getElementById('stat-materia').textContent = cuestionario.materias ? cuestionario.materias.nombre : 'General';
    document.getElementById('stat-titulo').textContent = `Resultados: ${cuestionario.titulo}`;

    const { data: intentos, error: errorIntentos } = await supabaseClient
        .from('intentos')
        .select(`
            id,
            fecha_fin,
            calificacion,
            perfiles ( nombre, correo )
        `)
        .eq('cuestionario_id', cuestionarioId)
        .not('fecha_fin', 'is', null)
        .order('fecha_fin', { ascending: false });

    const tbody = document.getElementById('tabla-resultados-profesor');

    if (errorIntentos) {
        mostrarAlerta('Error al cargar intentos: ' + errorIntentos.message, 'error');
        return;
    }

    if (!intentos || intentos.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; color: var(--text-muted);">
                    Ningún alumno ha completado este cuestionario todavía.
                </td>
            </tr>
        `;
        return;
    }

    const total = intentos.length;
    const sumaNotas = intentos.reduce((acc, item) => acc + Number(item.calificacion || 0), 0);
    const promedio = (sumaNotas / total).toFixed(1);
    const aprobados = intentos.filter(item => Number(item.calificacion || 0) >= 60).length;
    const tasaAprobacion = Math.round((aprobados / total) * 100);

    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-promedio').textContent = `${promedio} / 100`;
    document.getElementById('stat-aprobacion').textContent = `${tasaAprobacion}%`;

    tbody.innerHTML = intentos.map(item => {
        const nombreAlumno = item.perfiles ? item.perfiles.nombre : 'Alumno';
        const correoAlumno = item.perfiles ? item.perfiles.correo : '---';
        const fecha = new Date(item.fecha_fin).toLocaleString('es-MX', {
            year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        const nota = Number(item.calificacion || 0);
        const aprobado = nota >= 60;

        return `
            <tr>
                <td><strong>${nombreAlumno}</strong></td>
                <td>${correoAlumno}</td>
                <td>${fecha}</td>
                <td><strong>${nota} / 100</strong></td>
                <td>
                    <span class="badge ${aprobado ? 'badge-publicado' : 'badge-cerrado'}">
                        ${aprobado ? 'Aprobado' : 'Reprobado'}
                    </span>
                </td>
            </tr>
        `;
    }).join('');
}