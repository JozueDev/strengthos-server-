document.addEventListener("DOMContentLoaded", () => {

    const API_URL = window.location.protocol === 'file:' ? 'http://localhost:5000/api' : '/api';
    const tbody = document.getElementById("clients-tbody");
    const form = document.getElementById("create-client-form");

    // Función para obtener y mostrar todos los clientes
    const fetchClients = async () => {
        try {
            const response = await fetch(`${API_URL}/clientes`);
            const clientes = await response.json();

            tbody.innerHTML = ""; // Limpiar tabla

            if (clientes.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" style="text-align: center;">No hay clientes registrados aún.</td></tr>`;
                return;
            }

            clientes.forEach(cliente => {
                const tr = document.createElement("tr");

                tr.innerHTML = `
                    <td>
                        <span style="color: var(--primary-100); font-family: 'JetBrains Mono', monospace; font-weight: bold;">
                            #${cliente.user_id}
                        </span>
                    </td>
                    <td style="font-weight: 500;">
                        ${cliente.nombre}
                    </td>

                    <td>
                        ${cliente.user_id === 'admin'
                        ? '<span style="color: var(--text-tertiary); font-size: 0.875rem; font-style: italic;">Súper Admin</span>'
                        : `
                            <button class="btn-primary" style="padding: 6px 12px; font-size: 0.8rem; margin-right: 8px;" onclick="openRoutineEditor('${cliente.user_id}', '${cliente.nombre}')">Rutinas</button>
                            <button class="btn-primary" style="padding: 6px 12px; font-size: 0.8rem; margin-right: 8px; background: rgba(0,255,100,0.1); border-color: rgba(0,255,100,0.5); color: #2ecc71;" onclick="viewClientProgress('${cliente.user_id}', '${cliente.nombre}')">Ver Progreso</button>
                            <button class="btn-primary" style="padding: 6px 12px; font-size: 0.8rem; margin-right: 8px;" onclick="changePassword('${cliente.user_id}', '${cliente.nombre}')">Clave</button>
                            <button class="btn-danger" style="padding: 6px 12px; font-size: 0.8rem;" onclick="deleteClient('${cliente.user_id}', '${cliente.nombre}')">Eliminar</button>
                          `}
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } catch (error) {
            console.error("Error cargando clientes:", error);
            tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #ef4444;">Error de conexión. Asegúrate de que app.py esté ejecutándose.</td></tr>`;
        }
    };

    // Función global para eliminar
    window.deleteClient = async (user_id, nombre) => {
        if (confirm(`¿Estás seguro que deseas eliminar a ${nombre}? Esta acción no se puede deshacer.`)) {
            const adminUser = prompt("Para confirmar, ingresa tu Usuario de Administrador:");
            if (!adminUser) return;

            const adminPass = prompt("Ingresa tu Contraseña de Administrador:");
            if (!adminPass) return;

            try {
                const response = await fetch(`${API_URL}/clientes/${user_id}`, {
                    method: 'DELETE',
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        admin_user: adminUser,
                        admin_pass: adminPass
                    })
                });

                const data = await response.json();

                if (response.ok) {
                    alert(`${nombre} eliminado correctamente.`);
                    fetchClients(); // Refrescar tabla
                } else {
                    alert(data.error || "Hubo un error al intentar eliminar.");
                }
            } catch (error) {
                console.error("Error al eliminar:", error);
                alert("Error de conexión...");
            }
        }
    };

    // Función global para cambiar contraseña de usuario por el admin
    window.changePassword = async (user_id, nombre) => {
        const nuevaClave = prompt(`Ingresa la nueva contraseña para ${nombre}:`);
        if (!nuevaClave) return;

        const adminUser = prompt("Para confirmar, ingresa tu Usuario de Administrador:");
        if (!adminUser) return;

        const adminPass = prompt("Ingresa tu Contraseña de Administrador:");
        if (!adminPass) return;

        try {
            const response = await fetch(`${API_URL}/admin/cambiar-password`, {
                method: 'PUT',
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    user_id: user_id,
                    nueva_contrasena: nuevaClave,
                    admin_user: adminUser,
                    admin_pass: adminPass
                })
            });

            const data = await response.json();

            if (response.ok) {
                alert(`Contraseña de ${nombre} actualizada exitosamente.`);
            } else {
                alert(data.error || "Hubo un error al intentar cambiar la contraseña.");
            }
        } catch (error) {
            console.error("Error al cambiar contraseña:", error);
            alert("Error de conexión.");
        }
    };

    // ===================================
    // LÓGICA DEL CALENDARIO DE CLIENTES (ADMIN)
    // ===================================
    const routineModal = document.getElementById("routine-editor-modal");
    const closeRoutineModal = document.getElementById("close-routine-modal");
    const adminCalendarDays = document.getElementById("admin-calendar-days");
    const adminMonthYearDisplay = document.getElementById("admin-month-year-display");
    const viewCalendar = document.getElementById("admin-calendar-view");
    const viewEditor = document.getElementById("admin-editor-view");
    const routineForm = document.getElementById("routine-editor-form");
    const btnDeleteRoutine = document.getElementById("btn-delete-routine");
    const btnBackCalendar = document.getElementById("btn-back-calendar");

    let currentRoutineUserId = null;
    let adminCurrentDate = new Date();
    let currentClientUser_id = null;

    // ABRIR PROGRESS VIEWER
    const progModal = document.getElementById("progress-viewer-modal");
    document.getElementById("close-progress-modal")?.addEventListener("click", () => {
        progModal.classList.remove("active");
        progModal.style.display = ""; // Limpiar cualquier estilo remanente
    });

    window.viewClientProgress = async (user_id, nombre) => {
        progModal.classList.add("active");
        progModal.style.display = ""; // Evitar interferencias
        document.getElementById("progress-viewer-title").innerText = `Progreso de ${nombre}`;
        document.getElementById("admin-progress-stats-container").innerHTML = "<p>Cargando datos...</p>";

        try {


            // Get Routines
            const resRutinas = await fetch(`${API_URL}/cliente/${user_id}/rutinas`);
            let rutinas = [];
            if (resRutinas.ok) {
                const data = await resRutinas.json();
                if (Array.isArray(data)) {
                    rutinas = data;
                }
            }

            // Calcular Semanas Activas
            let minDate = Infinity;
            let maxDate = -Infinity;
            let routCount = 0;
            rutinas.forEach(r => {
                if (r.notas_cliente) { routCount++; }
                let d = new Date(r.dia).getTime();
                if (d < minDate) minDate = d;
                if (d > maxDate) maxDate = d;
            });

            if (minDate !== Infinity && maxDate !== -Infinity) {
                let diffInTime = maxDate - minDate;
                let diffInWeeks = Math.round(diffInTime / (1000 * 3600 * 24 * 7));
                document.getElementById("admin-prog-weeks").innerText = diffInWeeks === 0 ? "1 semana" : `${diffInWeeks} semanas`;
            } else {
                document.getElementById("admin-prog-weeks").innerText = "0 semanas";
            }
            document.getElementById("admin-prog-routines").innerText = routCount;

            // Render Charts
            const select = document.getElementById("admin-monthly-stats-select");
            let monthsSet = new Set();
            rutinas.forEach(r => {
                if (r.notas_cliente) {
                    const dateObj = new Date(r.dia + 'T00:00:00');
                    const monthStr = dateObj.getFullYear() + "-" + String(dateObj.getMonth() + 1).padStart(2, '0');
                    monthsSet.add(monthStr);
                }
            });

            const monthsArr = Array.from(monthsSet).sort().reverse();
            select.innerHTML = '<option value="">Selecciona un mes...</option>';
            monthsArr.forEach(m => {
                const [y, mth] = m.split('-');
                const d = new Date(y, parseInt(mth) - 1, 1);
                const label = d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
                const opt = document.createElement("option");
                opt.value = m;
                opt.innerText = label.charAt(0).toUpperCase() + label.slice(1);
                select.appendChild(opt);
            });

            select.onchange = (e) => {
                renderAdminMonthlyStats(rutinas, e.target.value);
            };

            if (monthsArr.length > 0) {
                select.value = monthsArr[0];
                renderAdminMonthlyStats(rutinas, monthsArr[0]);
            } else {
                document.getElementById("admin-progress-stats-container").innerHTML = "<p style='color: var(--text-secondary); text-align: center; margin-top: 30px;'>Este cliente aún no ha registrado métricas de repeticiones en sus rutinas.</p>";
            }
        } catch (e) {
            console.error(e);
            document.getElementById("admin-progress-stats-container").innerHTML = "<p>Error al cargar datos.</p>";
        }
    };

    // FUNCIÓN PARA ABRIR EL CALENDARIO DE CLIENTE PARA ASIGNAR RUTINAS
    let loadedRutinas = [];

    // Función que carga el calendario cuando se abre
    window.openRoutineEditor = async (user_id, clientName) => {
        currentRoutineUserId = user_id;
        currentClientUser_id = user_id;

        document.getElementById("routine-editor-title").innerText = `Rutina para ${clientName}`;

        viewCalendar.style.display = "block";
        viewEditor.style.display = "none";

        await fetchClientRutinas();
        renderAdminCalendar();
        routineModal.classList.add("active");
    };

    closeRoutineModal.addEventListener("click", () => {
        routineModal.classList.remove("active");
    });
    routineModal.addEventListener("click", (e) => {
        if (e.target === routineModal) routineModal.classList.remove("active");
    });

    btnBackCalendar.addEventListener("click", () => {
        viewCalendar.style.display = "block";
        viewEditor.style.display = "none";
        fetchClientRutinas().then(renderAdminCalendar);
    });

    // Petición de rutinas
    async function fetchClientRutinas() {
        if (!currentClientUser_id) return;
        try {
            const res = await fetch(`${API_URL}/cliente/${currentClientUser_id}/rutinas`);
            if (res.ok) {
                loadedRutinas = await res.json();
            }
        } catch (error) {
            console.error(error);
        }
    }

    // Renderizar Calendario Admin
    function renderAdminCalendar() {
        if (!adminCalendarDays) return;
        adminCalendarDays.innerHTML = '';

        const year = adminCurrentDate.getFullYear();
        const month = adminCurrentDate.getMonth();
        const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
            "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        adminMonthYearDisplay.innerText = `${monthNames[month]} ${year}`;

        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = new Date();

        for (let i = 0; i < firstDayOfMonth; i++) {
            const emptyDay = document.createElement("div");
            emptyDay.className = "calendar-day empty";
            adminCalendarDays.appendChild(emptyDay);
        }

        for (let i = 1; i <= daysInMonth; i++) {
            const dayDiv = document.createElement("div");
            dayDiv.className = "calendar-day";

            if (i === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
                dayDiv.classList.add("today");
            }

            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const rutinaDelDia = loadedRutinas.find(r => r.dia === dateStr);

            if (rutinaDelDia) {
                dayDiv.classList.add("has-routine");
                dayDiv.addEventListener("click", () => openDailyEditor(dateStr, rutinaDelDia.ejercicios, rutinaDelDia.notas_cliente));

                let previewText = "";
                if (rutinaDelDia.ejercicios) {
                    const lines = rutinaDelDia.ejercicios.trim().split('\n');
                    let line1 = lines[0] ? lines[0].trim() : "";
                    let line2 = lines[1] ? lines[1].replace(/\(.*?\)/g, "").trim() : "";

                    if (line1.toLowerCase().includes("día") || line1.toLowerCase().includes("dia")) {
                        previewText = line2 ? `${line1}<br>${line2}` : line1;
                    } else {
                        previewText = line1;
                    }
                }

                dayDiv.innerHTML = `
                    <span class="calendar-day-number">${i}</span>
                    <span style="font-size: 0.65rem; color: var(--primary-200); max-width: 90%; text-align: center; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-top: 2px; line-height: 1.2;">${previewText}</span>
                `;
            } else {
                dayDiv.addEventListener("click", () => openDailyEditor(dateStr, "", ""));
                dayDiv.innerHTML = `<span class="calendar-day-number">${i}</span>`;
            }
            adminCalendarDays.appendChild(dayDiv);
        }
    }

    document.getElementById("admin-prev-month")?.addEventListener("click", () => {
        adminCurrentDate.setMonth(adminCurrentDate.getMonth() - 1);
        renderAdminCalendar();
    });

    document.getElementById("admin-next-month")?.addEventListener("click", () => {
        adminCurrentDate.setMonth(adminCurrentDate.getMonth() + 1);
        renderAdminCalendar();
    });

    // Abrir un día para editar
    function openDailyEditor(fechaStr, textoActual, notasCliente) {
        viewCalendar.style.display = "none";
        viewEditor.style.display = "block";

        const [yearStr, monthStr, dayStr] = fechaStr.split('-');
        const dateObj = new Date(yearStr, parseInt(monthStr) - 1, dayStr);
        const dateFormatted = dateObj.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        document.getElementById("editor-date-title").innerText = dateFormatted.charAt(0).toUpperCase() + dateFormatted.slice(1);
        document.getElementById("routine-date").value = fechaStr;
        document.getElementById("routine-text").value = textoActual;

        const notesContainer = document.getElementById("client-notes-container");
        const notesText = document.getElementById("admin-client-notes-text");

        if (notasCliente && notasCliente.trim() !== "") {
            notesContainer.style.display = "block";
            try {
                const parsed = JSON.parse(notasCliente);
                let html = "";

                if (parsed.notas) {
                    html += `<strong>Notas adicionales:</strong><br>${parsed.notas}<br><br>`;
                }

                for (let exKey in parsed.setsData) {
                    const sets = parsed.setsData[exKey];
                    if (sets.length > 0) {
                        html += `<strong style="color:var(--primary-200);">${exKey}</strong><br>`;

                        let historial = [];
                        let sortedRutinas = [...loadedRutinas].sort((a, b) => new Date(a.dia) - new Date(b.dia));
                        sortedRutinas.forEach(rut => {
                            if (rut.dia < fechaStr && rut.notas_cliente) {
                                try {
                                    const pastParsed = JSON.parse(rut.notas_cliente);
                                    if (pastParsed.setsData) {
                                        let matchKey = null;
                                        const cleanSearch = exKey.replace(/[^a-z0-9]/gi, '');
                                        for (let k in pastParsed.setsData) {
                                            const cleanK = k.replace(/[^a-z0-9]/gi, '');
                                            if (cleanSearch && cleanK && (cleanK.includes(cleanSearch) || cleanSearch.includes(cleanK))) {
                                                matchKey = k;
                                                break;
                                            }
                                        }
                                        if (matchKey && pastParsed.setsData[matchKey]) {
                                            const repsArray = pastParsed.setsData[matchKey].map(s => s.reps).filter(r => r !== "" && r !== null);
                                            if (repsArray.length > 0) historial.push({ dia: rut.dia, reps: repsArray.join(", ") });
                                        }
                                    }
                                } catch (e) { }
                            }
                        });

                        if (historial.length > 0) {
                            html += `<div style="font-size:0.8rem; background:rgba(0,0,0,0.3); border-left:2px solid var(--primary-500); padding:6px; margin: 4px 0 8px 0; border-radius:3px;">`;
                            html += `<span style="color:var(--primary-300);">Progresión anterior:</span><br>`;
                            const recentHistory = historial.slice(-4);
                            recentHistory.forEach((h, index) => {
                                const semText = recentHistory.length - index === 1 ? 'Última vez' : `Hace ${recentHistory.length - index} sesiones`;
                                html += `<span style="color:var(--text-tertiary);">• ${semText}: [${h.reps}] reps</span><br>`;
                            });
                            html += `</div>`;
                        }

                        sets.forEach((set, index) => {
                            const reps = set.reps ? `${set.reps} reps logradas` : '-- reps';
                            html += `<span style="display:inline-block; min-width:80px; font-size:0.85rem;">Serie ${index + 1}:</span> ${reps}<br>`;
                        });
                        html += `<br>`;
                    }
                }

                if (html === "") html = "(Sin registros ingresados)";
                notesText.innerHTML = html;
            } catch (e) {
                // Si no es JSON (registros muy viejos), mostramos texto normal
                notesText.innerText = notasCliente;
            }
        } else {
            notesContainer.style.display = "none";
            notesText.innerText = "";
        }
    }

    async function sendRoutineRequest(ejerciciosText) {
        if (!currentRoutineUserId) return;
        const dateVal = document.getElementById("routine-date").value;

        try {
            const btn = routineForm.querySelector("button[type='submit']");
            const originalText = btn.innerText;
            btn.innerText = "Guardando...";

            const res = await fetch(`${API_URL}/admin/rutina`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_id: currentRoutineUserId,
                    dia: dateVal,
                    ejercicios: ejerciciosText
                })
            });

            const data = await res.json();
            btn.innerText = originalText;

            if (res.ok) {
                // Return to calendar properly updated
                viewCalendar.style.display = "block";
                viewEditor.style.display = "none";
                fetchClientRutinas().then(renderAdminCalendar);
            } else {
                alert(data.error || "Error al actualizar la rutina.");
            }
        } catch (error) {
            console.error("Error:", error);
            alert("Error de conexión.");
        }
    }

    routineForm.addEventListener("submit", (e) => {
        e.preventDefault();
        sendRoutineRequest(document.getElementById("routine-text").value);
    });

    btnDeleteRoutine.addEventListener("click", () => {
        if (confirm("¿Limpiar por completo la rutina de este día?")) {
            sendRoutineRequest("");
        }
    });

    // Event listener para el formulario
    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const btn = form.querySelector("button");
        const originalText = btn.innerText;
        btn.innerText = "Guardando...";
        btn.style.opacity = "0.7";

        const nombre = document.getElementById("nombre").value;
        const contrasena = document.getElementById("contrasena").value;

        try {
            const response = await fetch(`${API_URL}/clientes`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ nombre, contrasena })
            });

            const data = await response.json();

            if (response.ok) {
                alert(`¡Éxito! El cliente ${nombre} fue creado con el Usuario ID: #${data.user_id}`);
                form.reset(); // Limpiar inputs
                fetchClients(); // Actualizar la tabla
            } else {
                alert(data.error || "Ocurrió un error al crear al cliente.");
            }
        } catch (error) {
            console.error("Error al guardar cliente:", error);
            alert("Error de red. Verifica que el servidor Flask esté encendido.");
        } finally {
            btn.innerText = originalText;
            btn.style.opacity = "1";
        }
    });



    // Cargar pacientes por primera vez al iniciar vista
    fetchClients();

    function renderAdminMonthlyStats(rutinas, monthFilter) {
        const container = document.getElementById("admin-progress-stats-container");
        if (!container) return;
        container.innerHTML = "";

        if (!monthFilter) return;

        let ejerciciosStats = {};
        let sortedRutinas = [...rutinas].sort((a, b) => new Date(a.dia) - new Date(b.dia));

        sortedRutinas.forEach(rut => {
            const dateObj = new Date(rut.dia + 'T00:00:00');
            const mStr = dateObj.getFullYear() + "-" + String(dateObj.getMonth() + 1).padStart(2, '0');

            if (rut.notas_cliente && mStr === monthFilter) {
                try {
                    const parsed = JSON.parse(rut.notas_cliente);
                    if (parsed.setsData) {
                        Object.keys(parsed.setsData).forEach(k => {
                            let validSets = parsed.setsData[k].filter(s => s.reps && s.reps.trim() !== "");
                            if (validSets.length > 0) {
                                let ejName = k.split('\n')[0].trim();
                                if (!ejName) ejName = k;

                                if (!ejerciciosStats[ejName]) {
                                    ejerciciosStats[ejName] = [];
                                }

                                const repsList = validSets.map(s => parseInt(s.reps) || 0);
                                const totalReps = repsList.reduce((acc, curr) => acc + curr, 0);

                                let tempWeightFromKey = "-";
                                let mKey = k.match(/(\d+(?:\.\d+)?\s*(?:kg|lbs|lb|libras|kilos)[^\n]*)/i);
                                if (mKey) { tempWeightFromKey = mKey[1].trim(); }

                                const maxWeight = Math.max(...validSets.map(s => parseFloat(s.weight && s.weight !== "-" ? s.weight : tempWeightFromKey) || 0));

                                ejerciciosStats[ejName].push({
                                    dia: rut.dia,
                                    repsString: validSets.map(s => s.reps).join(", "),
                                    weightString: validSets.map(s => (s.weight && s.weight !== "-") ? s.weight : tempWeightFromKey).join(", "),
                                    totalReps: totalReps,
                                    maxWeight: maxWeight > 0 ? maxWeight : null
                                });
                            }
                        });
                    }
                } catch (e) { }
            }
        });

        const exercises = Object.keys(ejerciciosStats).sort();

        if (exercises.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 30px; background: rgba(0,0,0,0.2); border-radius: 12px; border: 1px dashed rgba(255,255,255,0.1);">
                    <p style="color: var(--text-secondary);">No hay datos de rendimiento para este mes.</p>
                </div>
            `;
            return;
        }

        exercises.forEach(ej => {
            let records = ejerciciosStats[ej];
            if (records.length === 0) return;

            const ejContainer = document.createElement("div");
            ejContainer.style.background = "rgba(0,0,0,0.4)";
            ejContainer.style.padding = "20px";
            ejContainer.style.borderRadius = "12px";
            ejContainer.style.borderTop = "3px solid var(--primary-500)";

            const title = document.createElement("h4");
            title.style.color = "var(--primary-100)";
            title.style.marginBottom = "5px";
            title.style.fontSize = "1.1rem";
            title.innerText = `📈 ${ej}`;

            ejContainer.appendChild(title);

            const legendDiv = document.createElement("div");
            legendDiv.style.marginBottom = "15px";
            legendDiv.style.fontSize = "0.8rem";
            legendDiv.style.display = "flex";
            legendDiv.style.gap = "15px";
            legendDiv.style.flexWrap = "wrap";
            legendDiv.innerHTML = `
                <div style="display: flex; align-items: center; gap: 5px;">
                    <div style="width: 12px; height: 12px; background: rgba(255, 255, 255, 0.4); border-radius: 2px;"></div>
                    <span style="color: var(--text-secondary);">Inicial / Mantuvo</span>
                </div>
                <div style="display: flex; align-items: center; gap: 5px;">
                    <div style="width: 12px; height: 12px; background: rgba(0, 255, 100, 0.6); border-radius: 2px;"></div>
                    <span style="color: var(--text-secondary);">Aumento</span>
                </div>
                <div style="display: flex; align-items: center; gap: 5px;">
                    <div style="width: 12px; height: 12px; background: rgba(255, 99, 132, 0.6); border-radius: 2px;"></div>
                    <span style="color: var(--text-secondary);">Disminución</span>
                </div>
            `;
            ejContainer.appendChild(legendDiv);

            const canvasWrapper = document.createElement("div");
            canvasWrapper.style.position = "relative";
            canvasWrapper.style.height = "250px";
            canvasWrapper.style.width = "100%";

            const canvas = document.createElement("canvas");
            canvasWrapper.appendChild(canvas);
            ejContainer.appendChild(canvasWrapper);
            container.appendChild(ejContainer);

            const labels = records.map(r => {
                const d = new Date(r.dia + 'T00:00:00');
                return d.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
            });

            const dataReps = records.map(r => r.totalReps);
            const dataWeights = records.map(r => r.maxWeight);

            const colorsReps = dataReps.map((val, index) => {
                if (index === 0) return 'rgba(255, 255, 255, 0.4)';

                let repsDiff = val - dataReps[index - 1];
                let weightDiff = (dataWeights[index] || 0) - (dataWeights[index - 1] || 0);

                if (repsDiff > 0 || weightDiff > 0) return 'rgba(0, 255, 100, 0.6)';
                if (repsDiff < 0 || weightDiff < 0) return 'rgba(255, 99, 132, 0.6)';

                return 'rgba(255, 255, 255, 0.4)';
            });

            new Chart(canvas, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Repeticiones Totales',
                            data: dataReps,
                            backgroundColor: colorsReps,
                            borderRadius: 4,
                            yAxisID: 'y'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                afterLabel: function (context) {
                                    const record = records[context.dataIndex];
                                    let wArr = record.weightString.split(", ");
                                    let allSame = wArr.every(w => w === wArr[0]);
                                    let weightText = (allSame && wArr[0] !== "-")
                                        ? `${wArr[0]}`
                                        : `[ ${record.weightString} ]`;

                                    return [
                                        `Peso asignado en esta fecha: ${weightText}`,
                                        `Series repeticiones: [ ${record.repsString} ]`
                                    ];
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            type: 'linear',
                            display: true,
                            position: 'left',
                            title: { display: true, text: 'Reps Totales', color: 'rgba(255,255,255,0.5)' },
                            ticks: { color: 'rgba(255,255,255,0.7)', precision: 0 },
                            grid: { color: 'rgba(255,255,255,0.05)' }
                        },
                        x: {
                            ticks: { color: 'rgba(255,255,255,0.7)' },
                            grid: { display: false }
                        }
                    }
                }
            });
        });
    }

});
