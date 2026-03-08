document.addEventListener("DOMContentLoaded", () => {
    // 1. Validar sesión
    const userDataStr = sessionStorage.getItem("strengthos_user");
    if (!userDataStr) {
        alert("Debes iniciar sesión para acceder a esta página.");
        window.location.href = "index.html";
        return;
    }

    let userData = JSON.parse(userDataStr);
    const API_URL = window.location.protocol === 'file:' ? 'http://127.0.0.1:5000/api' : '/api';

    // 2. Mostrar datos iniciales del usuario
    // 2. Mostrar datos iniciales del usuario
    if (document.getElementById("client-name-display")) {
        document.getElementById("client-name-display").innerText = userData.nombre;
    }
    if (document.getElementById("sidebar-name")) {
        document.getElementById("sidebar-name").innerText = userData.nombre;
    }
    if (document.getElementById("client-id-display")) {
        document.getElementById("client-id-display").innerText = userData.user_id;
    }
    if (document.getElementById("sidebar-id")) {
        document.getElementById("sidebar-id").innerText = userData.user_id;
    }

    // Fetch complete user data
    async function loadUserProfile() {
        try {
            const res = await fetch(`${API_URL}/cliente/${userData.user_id}/perfil`);
            if (res.ok) {
                const perfil = await res.json();
                document.getElementById("sidebar-age").innerText = perfil.edad !== "--" ? `${perfil.edad} años` : "--";
                document.getElementById("sidebar-height").innerText = perfil.estatura !== "--" ? `${perfil.estatura} cm` : "--";
                document.getElementById("sidebar-weight").innerText = perfil.peso !== "--" ? `${perfil.peso} kg` : "--";

                userData = { ...userData, ...perfil };
                sessionStorage.setItem("strengthos_user", JSON.stringify(userData));
            }
        } catch (e) { }
    }
    loadUserProfile();

    // Lógica para Modales y Nav
    const viewCalendar = document.getElementById("view-calendar");
    const viewRoutine = document.getElementById("view-routine");
    const viewMonthly = document.getElementById("view-monthly");
    const viewSecurity = document.getElementById("view-security");

    const navBtnCalendar = document.getElementById("nav-btn-calendar");
    const navBtnMonthly = document.getElementById("nav-btn-monthly");
    const navBtnSecurity = document.getElementById("nav-btn-security");

    function switchView(viewElement, navElement) {
        [viewCalendar, viewRoutine, viewMonthly, viewSecurity].forEach(v => {
            if (v) v.style.display = "none";
            console.log("No hay modal que cerrar con click fuera");
        });
        document.querySelectorAll(".nav-sidebar-btn").forEach(btn => btn.classList.remove("active"));

        if (viewElement) viewElement.style.display = "block";
        if (navElement) navElement.classList.add("active");
    }

    // --- LÓGICA DE PROGRESO MENSUAL ---
    function initMonthlyStats() {
        const select = document.getElementById("monthly-stats-select");
        if (!select) return;

        // Find available months from routines
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
            renderMonthlyStats(e.target.value);
        };

        if (monthsArr.length > 0) {
            select.value = monthsArr[0];
            renderMonthlyStats(monthsArr[0]);
        }
    }

    function renderMonthlyStats(monthFilter) {
        const container = document.getElementById("monthly-stats-container");
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

    navBtnCalendar?.addEventListener("click", () => switchView(viewCalendar, navBtnCalendar));
    navBtnMonthly?.addEventListener("click", () => {
        switchView(viewMonthly, navBtnMonthly);
        initMonthlyStats();
    });
    navBtnSecurity?.addEventListener("click", () => switchView(viewSecurity, navBtnSecurity));

    document.getElementById("btn-back-calendar")?.addEventListener("click", () => switchView(viewCalendar, navBtnCalendar));

    // 3. Cerrar Sesión
    document.getElementById("logout-btn").addEventListener("click", (e) => {
        e.preventDefault();
        sessionStorage.removeItem("strengthos_user");
        window.location.href = "index.html";
    });

    // 4. Cambiar Contraseña Local Formulario
    const passwordForm = document.getElementById("change-password-form");
    const feedbackMsg = document.getElementById("password-feedback");

    passwordForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const btn = passwordForm.querySelector("button");
        btn.innerText = "Guardando...";

        const currentPass = document.getElementById("current_password").value;
        const newPass = document.getElementById("new_password").value;
        const confirmPass = document.getElementById("confirm_password").value;

        // Validaciones básicas de cliente
        if (newPass !== confirmPass) {
            feedbackMsg.style.color = "var(--warning)";
            feedbackMsg.innerText = "Las nuevas contraseñas no coinciden.";
            btn.innerText = "Actualizar Contraseña";
            return;
        }

        if (newPass.length < 6) {
            feedbackMsg.style.color = "var(--warning)";
            feedbackMsg.innerText = "La contraseña debe tener al menos 6 caracteres.";
            btn.innerText = "Actualizar Contraseña";
            return;
        }

        feedbackMsg.innerText = ""; // Limpiar errores

        try {
            const res = await fetch(`${API_URL}/cliente/cambiar-password`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    user_id: userData.user_id,
                    contrasena_actual: currentPass,
                    nueva_contrasena: newPass
                })
            });

            const data = await res.json();

            if (res.ok) {
                feedbackMsg.style.color = "var(--success)";
                feedbackMsg.innerText = "¡Contraseña actualizada correctamente!";
                passwordForm.reset();
            } else {
                feedbackMsg.style.color = "var(--warning)";
                feedbackMsg.innerText = data.error || "Ocurrió un error al actualizar.";
            }

        } catch (error) {
            console.error("Error cambiando password:", error);
            feedbackMsg.style.color = "var(--warning)";
            feedbackMsg.innerText = "Error de conexión. Intenta más tarde.";
        } finally {
            btn.innerText = "Actualizar Contraseña";
        }
    });

    // Partículas Background (Mismo sistema que index.html)
    const particlesContainer = document.getElementById("particles");
    if (particlesContainer) {
        const particleCount = window.innerWidth < 768 ? 20 : 50;
        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement("div");
            particle.className = "particle";
            particle.style.left = Math.random() * 100 + "%";
            particle.style.top = Math.random() * 100 + "%";
            particle.style.animationDelay = (Math.random() * 20) + "s";
            particle.style.animationDuration = (15 + Math.random() * 10) + "s";
            particlesContainer.appendChild(particle);
        }
    }
    // 5. Calendario y Rutinas
    const calendarDays = document.getElementById("calendar-days");
    const monthYearDisplay = document.getElementById("month-year-display");
    const prevMonthBtn = document.getElementById("prev-month");
    const nextMonthBtn = document.getElementById("next-month");
    const routineText = document.getElementById("routine-text");

    let currentDate = new Date();
    let rutinas = [];

    async function fetchRutinas() {
        try {
            const res = await fetch(`${API_URL}/cliente/${userData.user_id}/rutinas`);
            if (res.ok) {
                const data = await res.json();
                rutinas = data;
            } else {
                console.error("Error al obtener rutinas");
            }
        } catch (error) {
            console.error("Error de conexión:", error);
        }
    }

    function renderCalendar() {
        if (!calendarDays) return;
        calendarDays.innerHTML = '';

        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();

        // Nombres de los meses en español
        const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
            "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        monthYearDisplay.innerText = `${monthNames[month]} ${year}`;

        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const today = new Date();

        // Llenar espacios vacíos antes del primer día del mes
        for (let i = 0; i < firstDayOfMonth; i++) {
            const emptyDay = document.createElement("div");
            emptyDay.className = "calendar-day empty";
            calendarDays.appendChild(emptyDay);
        }

        // Llenar los días del mes
        for (let i = 1; i <= daysInMonth; i++) {
            const dayDiv = document.createElement("div");
            dayDiv.className = "calendar-day";

            // Verificar si es hoy
            if (i === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
                dayDiv.classList.add("today");
            }

            // Crear el formato YYYY-MM-DD para buscar rutinas
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;

            // Buscar si hay rutina este día
            const rutinaDelDia = rutinas.find(r => r.dia === dateStr);
            if (rutinaDelDia) {
                dayDiv.classList.add("has-routine");
                dayDiv.addEventListener("click", () => mostrarRutina(dateStr, rutinaDelDia.ejercicios, rutinaDelDia.id, rutinaDelDia.notas_cliente));

                let previewText = "";
                if (rutinaDelDia.ejercicios) {
                    const lines = rutinaDelDia.ejercicios.trim().split('\n');
                    let line1 = lines[0] ? lines[0].trim() : "";
                    let line2 = lines[1] ? lines[1].replace(/\(.*?\)/g, "").trim() : ""; // Remueve lo que esté entre paréntesis

                    // Si la primera línea menciona 'dia', combinamos la 1 y la 2
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
                dayDiv.addEventListener("click", () => mostrarRutina(dateStr, "Día de descanso activo o sin rutina asignada. ¡Recupérate bien!", null, ""));
                dayDiv.innerHTML = `<span class="calendar-day-number">${i}</span>`;
            }
            calendarDays.appendChild(dayDiv);
        }
    }

    let currentObtainedRoutineId = null;

    function mostrarRutina(fechaStr, textoRutina, rutinaId, notasCliente) {
        switchView(viewRoutine, null);

        const dateObj = new Date(fechaStr + 'T00:00:00');
        const formattedDate = dateObj.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        document.getElementById("routine-view-title").innerText = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);

        const progressForm = document.getElementById("progress-form");
        const routineNotes = document.getElementById("routine-notes");
        currentObtainedRoutineId = rutinaId;

        const dynamicSetsContainer = document.getElementById("dynamic-sets-container");
        if (dynamicSetsContainer) dynamicSetsContainer.innerHTML = '';

        let previousDynamicData = {};
        if (notasCliente) {
            try {
                const parsed = JSON.parse(notasCliente);
                previousDynamicData = parsed.setsData || {};
                routineNotes.value = parsed.notas || "";
            } catch (e) {
                routineNotes.value = notasCliente || "";
            }
        } else {
            routineNotes.value = "";
        }

        if (textoRutina && dynamicSetsContainer) {
            let currentExerciseName = "";
            const lines = textoRutina.split('\n');
            lines.forEach((line) => {
                const trimmed = line.trim();
                if (!trimmed) return;

                const regex = /(\d+)\s*(?:[xX]|sets? de|sets?|series? de|series?(?:,)?)\s*(?:\d+(?:-\d+)?)?/i;
                const match = trimmed.match(regex);
                if (match) {
                    const numSets = parseInt(match[1]);
                    if (numSets > 0 && numSets <= 15) { // Límite de seguridad
                        const cleanTrimmed = trimmed.replace(/^[-•*]\s*/, "");
                        const formattedTrimmed = cleanTrimmed
                            .replace(/(series|sets)\s+de\s+/ig, "$1\n")
                            .replace(/(repeticiones|reps)\s+con\s+/ig, "$1\n");
                        const separator = currentExerciseName.endsWith(":") ? "\n" : " - ";
                        const exKey = currentExerciseName ? `${currentExerciseName}${separator}${formattedTrimmed}` : formattedTrimmed;
                        const savedSets = previousDynamicData[exKey] || [];

                        // Buscar el peso en las siguientes líneas o en la misma línea
                        let extractedWeight = "-";
                        const currentIndex = lines.indexOf(line);

                        // Revisar primero la misma línea por si puso "10 reps con 185 lbs" o "185 lb 10 reps"
                        let sameLineM = line.match(/(\d+(?:\.\d+)?\s*(?:kg|lbs|lb|libras|kilos)[^\n]*)/i);
                        if (sameLineM) { extractedWeight = sameLineM[1].trim(); }
                        else {
                            // Buscar hacia adelante hasta 4 lineas abajo
                            for (let k = currentIndex + 1; k < currentIndex + 5 && k < lines.length; k++) {
                                let lookAhead = lines[k].trim();
                                if (!lookAhead) continue;
                                if (lookAhead.match(/(?:\d+)\s*(?:[xX]|sets?|series?)/i)) break;
                                let m = lookAhead.match(/(\d+(?:\.\d+)?\s*(?:kg|lbs|lb|libras|kilos)[^\n]*)/i);
                                if (m) { extractedWeight = m[1].trim(); break; }
                            }
                        }

                        const container = document.createElement('div');
                        container.style.marginBottom = '20px';
                        container.style.padding = '15px';
                        container.style.background = 'rgba(255, 255, 255, 0.03)';
                        container.style.borderRadius = '12px';
                        container.style.border = '1px solid rgba(255,255,255,0.05)';

                        const title = document.createElement('h5');

                        // Parsear el exKey para separar el nombre del ejercicio de sus parámetros (series, reps, peso)
                        let formatStr = exKey.replace(/\s+(?:de\s+|con\s+|-)?(?=\d+(?:-\d+)?\s*(?:series|sets|reps|repeticiones|x|kg|lbs|lb|libras|kilos)\b)/ig, "\n");
                        let nicelyFormatted = formatStr.split('\n')
                            .map(l => l.trim().replace(/^(de|con|-|•|\*)\s+/i, ''))
                            .filter(l => l);

                        // Si se extrajo un peso de otras líneas pero no figura aquí, añadirlo
                        if (extractedWeight !== "-" && !nicelyFormatted.some(l => l.toLowerCase().includes(extractedWeight.toLowerCase()))) {
                            nicelyFormatted.push(`${extractedWeight}`);
                        }

                        // Formato visual Premium: Nombre en grande, detalles en viñetas abajo
                        if (nicelyFormatted.length > 0) {
                            title.innerHTML = `<span style="display:block; margin-bottom: 8px; font-size: 1.1rem; color: var(--primary-100);">${nicelyFormatted[0]}</span>` +
                                nicelyFormatted.slice(1).map(l => `<span style="display:block; font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 4px;">• ${l.toUpperCase()}</span>`).join('');
                        } else {
                            title.innerText = exKey;
                        }

                        title.style.whiteSpace = 'normal';
                        title.style.marginBottom = '16px';
                        container.appendChild(title);

                        // --- STATS SEMANALES ---
                        let historial = [];
                        let sortedRutinas = [...rutinas].sort((a, b) => new Date(a.dia) - new Date(b.dia));
                        sortedRutinas.forEach(rut => {
                            if (rut.dia < fechaStr && rut.notas_cliente) {
                                try {
                                    const parsed = JSON.parse(rut.notas_cliente);
                                    if (parsed.setsData) {
                                        // Buscar una key de ejercicio que coincida
                                        let matchKey = null;
                                        const searchStr = currentExerciseName ? currentExerciseName.trim().toLowerCase() : exKey.trim().toLowerCase();
                                        const cleanSearch = searchStr.replace(/[^a-z0-9]/gi, ''); // Solo letras y números

                                        for (let k in parsed.setsData) {
                                            const cleanK = k.replace(/[^a-z0-9]/gi, '');
                                            if (cleanSearch && cleanK && (cleanK.includes(cleanSearch) || cleanSearch.includes(cleanK))) {
                                                matchKey = k;
                                                break;
                                            }
                                        }

                                        if (matchKey && parsed.setsData[matchKey]) {
                                            const repsArray = parsed.setsData[matchKey].map(s => s.reps).filter(r => r !== "" && r !== null);
                                            if (repsArray.length > 0) {
                                                historial.push({ dia: rut.dia, reps: repsArray.join(", ") });
                                            }
                                        }
                                    }
                                } catch (e) { }
                            }
                        });

                        if (historial.length > 0) {
                            const historyDiv = document.createElement('div');
                            historyDiv.style.fontSize = '0.75rem';
                            historyDiv.style.color = 'var(--text-tertiary)';
                            historyDiv.style.marginBottom = '12px';
                            historyDiv.style.padding = '8px';
                            historyDiv.style.background = 'rgba(0,0,0,0.3)';
                            historyDiv.style.borderLeft = '2px solid var(--primary-500)';
                            historyDiv.style.borderRadius = '2px 6px 6px 2px';
                            historyDiv.style.lineHeight = '1.4';

                            let historyHtml = '<strong style="color:var(--primary-300);">Progresión Anterior:</strong><br>';
                            // Tomar las últimas 4 sesiones donde hubo repeticiones y mostrarlas
                            const recentHistory = historial.slice(-4);
                            recentHistory.forEach((h, index) => {
                                // Ej: Hace 2 sem: [8, 8, 8] reps
                                const semText = recentHistory.length - index === 1 ? 'Última vez' : `Hace ${recentHistory.length - index} sesiones`;
                                historyHtml += `<span style="padding-left:4px; display:inline-block; margin-top:2px;">• ${semText}: [${h.reps}] reps</span><br>`;
                            });
                            historyDiv.innerHTML = historyHtml;
                            container.appendChild(historyDiv);
                        }
                        // --- FIN STATS ---

                        for (let s = 1; s <= numSets; s++) {
                            const setRow = document.createElement('div');
                            setRow.style.display = 'flex';
                            setRow.style.gap = '10px';
                            setRow.style.alignItems = 'center';
                            setRow.style.marginBottom = '8px';

                            const setLabel = document.createElement('span');
                            setLabel.innerText = `Serie ${s}`;
                            setLabel.style.width = '60px';
                            setLabel.style.fontSize = '0.85rem';
                            setLabel.style.color = 'var(--text-secondary)';

                            const savedRep = savedSets[s - 1] ? savedSets[s - 1].reps : "";
                            const savedWeight = savedSets[s - 1] ? savedSets[s - 1].weight : "";

                            const repInput = document.createElement('input');
                            repInput.type = 'number';
                            repInput.placeholder = '¿Reps?';
                            repInput.value = savedRep;
                            repInput.className = 'dynamic-rep-input';
                            repInput.dataset.ex = exKey;
                            repInput.dataset.set = s;
                            repInput.style.padding = '8px';
                            repInput.style.width = '100px';
                            repInput.style.border = '1px solid rgba(255,255,255,0.1)';
                            repInput.style.borderRadius = '6px';
                            repInput.style.color = 'white';
                            repInput.style.background = 'rgba(0,0,0,0.4)';
                            repInput.dataset.weight = extractedWeight;

                            const weightLabel = document.createElement('span');
                            weightLabel.innerText = extractedWeight !== "-" ? extractedWeight : "Sin peso";
                            weightLabel.style.fontSize = '0.75rem';
                            weightLabel.style.color = 'var(--text-tertiary)';
                            weightLabel.style.marginLeft = '5px';
                            weightLabel.style.fontStyle = 'italic';

                            setRow.appendChild(setLabel);
                            setRow.appendChild(repInput);
                            setRow.appendChild(weightLabel);
                            container.appendChild(setRow);
                        }
                        dynamicSetsContainer.appendChild(container);
                    }
                    currentExerciseName = ""; // Limpiar el nombre después de asignarlo
                } else {
                    currentExerciseName = trimmed; // Si una línea no es de series, se asume que es el nombre del ejercicio
                }
            });
        }

        if (rutinaId !== null) {
            progressForm.style.display = "block";
        } else {
            progressForm.style.display = "none";
        }

        // Fix timezone issue when parsing date
        // ya renderizado arriba routine-view-title
        routineText.innerText = textoRutina ? textoRutina.replace(/@/g, ', Peso sugerido:') : "";

        // Hacer scroll top en la vista de rutina
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    const progressForm = document.getElementById("progress-form");
    if (progressForm) {
        progressForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!currentObtainedRoutineId) return;

            const btn = document.getElementById("save-progress-btn");
            const originalText = btn.innerText;
            btn.innerText = "Guardando...";
            const notasText = document.getElementById("routine-notes").value;

            // Recolectar datos dinamicos
            const setsData = {};
            const repsInputs = document.querySelectorAll('.dynamic-rep-input');

            repsInputs.forEach((input, index) => {
                const ex = input.dataset.ex;
                if (!setsData[ex]) setsData[ex] = [];
                const repVal = input.value;
                const weightVal = input.dataset.weight || "-";

                setsData[ex].push({ reps: repVal, weight: weightVal });
            });

            const payload = {
                setsData: setsData,
                notas: notasText
            };
            const jsonString = JSON.stringify(payload);

            try {
                const res = await fetch(`${API_URL}/cliente/rutina/${currentObtainedRoutineId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ notas_cliente: jsonString })
                });

                if (res.ok) {
                    btn.innerText = "¡Guardado!";
                    // Actualizamos memoria local
                    const rutIndex = rutinas.findIndex(r => r.id === currentObtainedRoutineId);
                    if (rutIndex !== -1) rutinas[rutIndex].notas_cliente = jsonString;

                    setTimeout(() => { btn.innerText = originalText; }, 2000);
                } else {
                    alert("Error guardando progreso");
                    btn.innerText = originalText;
                }
            } catch (error) {
                console.error(error);
                alert("Error de conexión");
                btn.innerText = originalText;
            }
        });
    }

    if (prevMonthBtn && nextMonthBtn) {
        prevMonthBtn.addEventListener("click", () => {
            currentDate.setMonth(currentDate.getMonth() - 1);
            renderCalendar();
        });

        nextMonthBtn.addEventListener("click", () => {
            currentDate.setMonth(currentDate.getMonth() + 1);
            renderCalendar();
        });
    }

    // Iniciar el calendario
    if (document.getElementById("calendar-days")) {
        fetchRutinas().then(() => renderCalendar());
    }
});
