// Archivo: js/alumno.js
let perfilAlumno = null;
let cuestionarioExamen = null;
let preguntasExamen = [];
let intentoActualId = null;
let intervaloTemporizador = null;
let examenEnviado = false;

// Algoritmo Fisher-Yates para mezclar preguntas y respuestas aleatoriamente
function mezclarArreglo(arreglo) {
    const copia = [...arreglo];
    for (let i = copia.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
}

document.addEventListener('DOMContentLoaded', async () => {
    perfilAlumno = await verificarSesion('alumno');
    if (!perfilAlumno) return;

    const contenedorDisponibles = document.getElementById('lista-cuestionarios-alumno');
    if (contenedorDisponibles) {
        await cargarCuestionariosDisponibles();
        await cargarHistorialAlumno();
    }

    const formResolver = document.getElementById('form-resolver-examen');
    if (formResolver) {
        await inicializarExamen();
    }

    const resTitulo = document.getElementById('res-titulo');
    if (resTitulo) {
        await cargarResultadoIntento();
    }
});

// =========================================================
// 1. FUNCIONES DEL PANEL DEL ALUMNO (panel-alumno.html)
// =========================================================

async function cargarCuestionariosDisponibles() {
    const contenedor = document.getElementById('lista-cuestionarios-alumno');

    const { data: cuestionarios, error } = await supabaseClient
        .from('cuestionarios')
        .select(`
            id,
            titulo,
            descripcion,
            tiempo_limite,
            intentos_permitidos,
            materias ( nombre ),
            perfiles ( nombre )
        `)
        .eq('estado', 'publicado')
        .order('creado_en', { ascending: false });

    if (error) {
        mostrarAlerta('Error al cargar cuestionarios: ' + error.message, 'error');
        return;
    }

    if (!cuestionarios || cuestionarios.length === 0) {
        contenedor.innerHTML = `
            <div class="card">
                <h3 class="card-title">No hay exámenes disponibles</h3>
                <p style="color: var(--text-muted);">
                    Por el momento ningún profesor ha publicado cuestionarios activos.
                </p>
            </div>
        `;
        return;
    }

    const { data: intentosAlumno } = await supabaseClient
        .from('intentos')
        .select('cuestionario_id, fecha_fin')
        .eq('usuario_id', perfilAlumno.id)
        .not('fecha_fin', 'is', null);

    contenedor.innerHTML = cuestionarios.map(c => {
        const nombreMateria = c.materias ? c.materias.nombre : 'General';
        const nombreProfesor = c.perfiles ? c.perfiles.nombre : 'Profesor';
        const textoTiempo = c.tiempo_limite > 0 ? `${c.tiempo_limite} min` : 'Sin límite';

        const intentosRealizados = intentosAlumno
            ? intentosAlumno.filter(i => i.cuestionario_id === c.id).length
            : 0;

        const puedeIntentar = intentosRealizados < c.intentos_permitidos;

        const botonAccion = puedeIntentar
            ? `<a href="resolver-examen.html?id=${c.id}" class="btn btn-primary btn-sm">Iniciar Examen</a>`
            : `<button class="btn btn-secondary btn-sm" disabled>Intentos agotados</button>`;

        return `
            <article class="card">
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                        <span style="font-size: 0.8rem; font-weight: 600; color: var(--primary);">${nombreMateria}</span>
                        <span style="font-size: 0.8rem; color: var(--text-muted);">Prof. ${nombreProfesor}</span>
                    </div>
                    <h3 class="card-title">${c.titulo}</h3>
                    <p style="color: var(--text-muted); font-size: 0.9rem;">
                        ${c.descripcion || 'Sin instrucciones adicionales.'}
                    </p>
                    <div class="card-meta">
                        ⏱ ${textoTiempo} &nbsp;|&nbsp; 🔄 Intentos: ${intentosRealizados} / ${c.intentos_permitidos}
                    </div>
                </div>
                <div class="card-actions">
                    ${botonAccion}
                </div>
            </article>
        `;
    }).join('');
}

async function cargarHistorialAlumno() {
    const tbody = document.getElementById('tabla-historial-alumno');
    if (!tbody) return;

    const { data: intentos, error } = await supabaseClient
        .from('intentos')
        .select(`
            id,
            fecha_fin,
            calificacion,
            cuestionarios ( titulo )
        `)
        .eq('usuario_id', perfilAlumno.id)
        .not('fecha_fin', 'is', null)
        .order('fecha_fin', { ascending: false });

    if (error || !intentos || intentos.length === 0) return;

    tbody.innerHTML = intentos.map(item => {
        const titulo = item.cuestionarios ? item.cuestionarios.titulo : 'Cuestionario';
        const fecha = new Date(item.fecha_fin).toLocaleDateString('es-MX', {
            year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        const nota = item.calificacion !== null ? `${item.calificacion} / 100` : 'Pendiente';

        return `
            <tr>
                <td><strong>${titulo}</strong></td>
                <td>${fecha}</td>
                <td><span class="badge ${item.calificacion >= 60 ? 'badge-publicado' : 'badge-cerrado'}">${nota}</span></td>
                <td><a href="resultados.html?intento_id=${item.id}" class="btn btn-secondary btn-sm">Ver detalle</a></td>
            </tr>
        `;
    }).join('');
}

// =========================================================
// 2. FUNCIONES PARA RESOLVER EXAMEN (resolver-examen.html)
// =========================================================

async function inicializarExamen() {
    const params = new URLSearchParams(window.location.search);
    const cuestionarioId = params.get('id');

    if (!cuestionarioId) {
        window.location.href = 'panel-alumno.html';
        return;
    }

    const { data: cuestionario, error: errorCuest } = await supabaseClient
        .from('cuestionarios')
        .select(`*, materias ( nombre )`)
        .eq('id', cuestionarioId)
        .eq('estado', 'publicado')
        .single();

    if (errorCuest || !cuestionario) {
        mostrarAlerta('El cuestionario no está disponible o ya fue cerrado.', 'error');
        return;
    }

    cuestionarioExamen = cuestionario;
    document.getElementById('examen-materia').textContent = cuestionario.materias ? cuestionario.materias.nombre : 'General';
    document.getElementById('examen-titulo').textContent = cuestionario.titulo;
    document.getElementById('examen-descripcion').textContent = cuestionario.descripcion || '';

    const { data: intentosPrevios } = await supabaseClient
        .from('intentos')
        .select('id')
        .eq('usuario_id', perfilAlumno.id)
        .eq('cuestionario_id', cuestionarioId)
        .not('fecha_fin', 'is', null);

    if (intentosPrevios && intentosPrevios.length >= cuestionario.intentos_permitidos) {
        mostrarAlerta('Ya has alcanzado el límite máximo de intentos para este cuestionario.', 'error');
        document.getElementById('form-resolver-examen').style.display = 'none';
        return;
    }

    const { data: preguntas, error: errorPreg } = await supabaseClient
        .from('preguntas')
        .select('id, pregunta, tipo, orden')
        .eq('cuestionario_id', cuestionarioId);

    if (errorPreg || !preguntas || preguntas.length === 0) {
        mostrarAlerta('Este cuestionario aún no tiene preguntas registradas.', 'error');
        document.getElementById('form-resolver-examen').style.display = 'none';
        return;
    }

    // Mezclar aleatoriamente el orden de las preguntas
    preguntasExamen = mezclarArreglo(preguntas);

    const idsPreguntas = preguntasExamen.map(p => p.id);
    const { data: opciones, error: errorOpc } = await supabaseClient
        .from('opciones_alumno')
        .select('id, pregunta_id, texto')
        .in('pregunta_id', idsPreguntas);

    if (errorOpc) {
        mostrarAlerta('Error al cargar las opciones de respuesta: ' + errorOpc.message, 'error');
        return;
    }

    const { data: nuevoIntento, error: errorIntento } = await supabaseClient
        .from('intentos')
        .insert([{
            usuario_id: perfilAlumno.id,
            cuestionario_id: cuestionarioId
        }])
        .select()
        .single();

    if (errorIntento || !nuevoIntento) {
        mostrarAlerta('No se pudo iniciar el intento: ' + (errorIntento?.message || ''), 'error');
        return;
    }

    intentoActualId = nuevoIntento.id;

    const contenedorPreguntas = document.getElementById('contenedor-preguntas-examen');
    contenedorPreguntas.innerHTML = preguntasExamen.map((p, index) => {
        let opcionesDeEstaPregunta = opciones.filter(o => o.pregunta_id === p.id);

        // Si es opción múltiple, mezclar también el orden de las respuestas; si es V/F, mantener Verdadero arriba
        if (p.tipo !== 'verdadero_falso') {
            opcionesDeEstaPregunta = mezclarArreglo(opcionesDeEstaPregunta);
        }

        const opcionesHtml = opcionesDeEstaPregunta.map(o => `
            <label style="display: flex; align-items: center; gap: 0.65rem; padding: 0.65rem; border: 1px solid var(--border-color); border-radius: var(--radius); margin-bottom: 0.5rem; cursor: pointer;">
                <input type="radio" name="pregunta_${p.id}" value="${o.id}" required>
                <span>${o.texto}</span>
            </label>
        `).join('');

        return `
            <div class="card" style="margin-bottom: 1.25rem;">
                <h3 style="font-size: 1.1rem; margin-bottom: 1rem;">
                    ${index + 1}. ${p.pregunta}
                </h3>
                <div>
                    ${opcionesHtml}
                </div>
            </div>
        `;
    }).join('');

    if (cuestionario.tiempo_limite > 0) {
        iniciarTemporizador(cuestionario.tiempo_limite);
    }

    document.getElementById('form-resolver-examen').addEventListener('submit', async (e) => {
        e.preventDefault();
        await procesarYEnviarExamen(false);
    });
}

function iniciarTemporizador(minutos) {
    let segundosRestantes = minutos * 60;
    const spanTimer = document.getElementById('temporizador');

    const actualizarTexto = () => {
        const min = Math.floor(segundosRestantes / 60);
        const seg = segundosRestantes % 60;
        spanTimer.textContent = `⏱ ${String(min).padStart(2, '0')}:${String(seg).padStart(2, '0')}`;
        if (segundosRestantes <= 60) {
            spanTimer.style.color = 'var(--danger)';
        }
    };

    actualizarTexto();
    intervaloTemporizador = setInterval(async () => {
        segundosRestantes--;
        actualizarTexto();

        if (segundosRestantes <= 0) {
            clearInterval(intervaloTemporizador);
            alert('¡Se acabó el tiempo! Tus respuestas seleccionadas se enviarán automáticamente.');
            await procesarYEnviarExamen(true);
        }
    }, 1000);
}

async function procesarYEnviarExamen(porTiempoAgotado = false) {
    if (examenEnviado) return;
    examenEnviado = true;

    if (intervaloTemporizador) {
        clearInterval(intervaloTemporizador);
    }

    const btnEnviar = document.getElementById('btn-enviar-examen');
    btnEnviar.disabled = true;
    btnEnviar.textContent = 'Calificando examen...';

    const respuestasAInsertar = [];
    preguntasExamen.forEach(p => {
        const radioMarcado = document.querySelector(`input[name="pregunta_${p.id}"]:checked`);
        if (radioMarcado) {
            respuestasAInsertar.push({
                intento_id: intentoActualId,
                pregunta_id: p.id,
                opcion_id: radioMarcado.value
            });
        }
    });

    if (respuestasAInsertar.length > 0) {
        const { error: errorResp } = await supabaseClient
            .from('respuestas')
            .insert(respuestasAInsertar);

        if (errorResp) {
            mostrarAlerta('Error al guardar tus respuestas: ' + errorResp.message, 'error');
            examenEnviado = false;
            btnEnviar.disabled = false;
            btnEnviar.textContent = 'Finalizar y Enviar Respuestas';
            return;
        }
    }

    const { data: calificacion, error: errorCalif } = await supabaseClient
        .rpc('calificar_intento', { p_intento_id: intentoActualId });

    if (errorCalif) {
        mostrarAlerta('Error al calificar el intento: ' + errorCalif.message, 'error');
        examenEnviado = false;
        btnEnviar.disabled = false;
        btnEnviar.textContent = 'Finalizar y Enviar Respuestas';
        return;
    }

    window.location.href = `resultados.html?intento_id=${intentoActualId}`;
}

// =========================================================
// 3. FUNCIONES DE RESULTADOS (resultados.html)
// =========================================================

async function cargarResultadoIntento() {
    const params = new URLSearchParams(window.location.search);
    const intentoId = params.get('intento_id');

    if (!intentoId) {
        window.location.href = 'panel-alumno.html';
        return;
    }

    const { data: intento, error } = await supabaseClient
        .from('intentos')
        .select(`
            id,
            fecha_fin,
            calificacion,
            cuestionarios (
                titulo,
                materias ( nombre )
            )
        `)
        .eq('id', intentoId)
        .eq('usuario_id', perfilAlumno.id)
        .single();

    if (error || !intento) {
        mostrarAlerta('No se encontró el resultado solicitado.', 'error');
        return;
    }

    const titulo = intento.cuestionarios ? intento.cuestionarios.titulo : 'Cuestionario';
    const materia = intento.cuestionarios?.materias ? intento.cuestionarios.materias.nombre : 'General';
    const fecha = intento.fecha_fin
        ? new Date(intento.fecha_fin).toLocaleString('es-MX')
        : 'En progreso';

    document.getElementById('res-materia').textContent = materia;
    document.getElementById('res-titulo').textContent = titulo;
    document.getElementById('res-fecha').textContent = `Completado el: ${fecha}`;

    const nota = intento.calificacion !== null ? intento.calificacion : 0;
    document.getElementById('res-calificacion').textContent = `${nota} / 100`;

    const badge = document.getElementById('res-estado-badge');
    if (nota >= 60) {
        badge.textContent = 'Aprobado';
        badge.className = 'badge badge-publicado';
    } else {
        badge.textContent = 'No aprobado';
        badge.className = 'badge badge-cerrado';
    }
}