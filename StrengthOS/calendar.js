// calendar.js - Lógica del Calendario y Rutinas del Atleta

document.addEventListener("DOMContentLoaded", () => {
    const userDataStr = sessionStorage.getItem("strengthos_user");
    if (!userDataStr) {
        window.location.href = "index.html";
        return;
    }

    const userData = JSON.parse(userDataStr);
    const API_URL = window.location.protocol === 'file:' ? 'http://127.0.0.1:5000/api' : '/api';

    const viewCalendar = document.getElementById("view-calendar");
    const viewRoutine = document.getElementById("view-routine");
    const calendarDays = document.getElementById("calendar-days");
    const monthYearDisplay = document.getElementById("month-year-display");
    const prevMonthBtn = document.getElementById("prev-month");
    const nextMonthBtn = document.getElementById("next-month");
    const routineText = document.getElementById("routine-text");

    let currentDate = new Date();
    let rutinas = [];
    let currentObtainedRoutineId = null;

    // Cargar rutinas y renderizar
    async function fetchRutinas() {
        try {
            const res = await fetch(`${API_URL}/cliente/${userData.user_id}/rutinas`);
            if (res.ok) rutinas = await res.json();
        } catch (error) {
            console.error("Error de conexión:", error);
        }
    }

    function renderCalendar() {
        if (!calendarDays) return;
        calendarDays.innerHTML = '';

        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
            "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        monthYearDisplay.innerText = `${monthNames[month]} ${year}`;

        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = new Date();

        for (let i = 0; i < firstDayOfMonth; i++) {
            const emptyDay = document.createElement("div");
            emptyDay.className = "calendar-day empty";
            calendarDays.appendChild(emptyDay);
        }

        for (let i = 1; i <= daysInMonth; i++) {
            const dayDiv = document.createElement("div");
            dayDiv.className = "calendar-day";

            if (i === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
                dayDiv.classList.add("today");
            }

            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const rutinaDelDia = rutinas.find(r => r.dia === dateStr);

            if (rutinaDelDia) {
                dayDiv.classList.add("has-routine");
                dayDiv.addEventListener("click", () => mostrarRutina(dateStr, rutinaDelDia.ejercicios, rutinaDelDia.id, rutinaDelDia.notas_cliente));

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
                dayDiv.addEventListener("click", () => mostrarRutina(dateStr, "Día de descanso activo o sin rutina asignada. ¡Recupérate bien!", null, ""));
                dayDiv.innerHTML = `<span class="calendar-day-number">${i}</span>`;
            }
            calendarDays.appendChild(dayDiv);
        }
    }

    function mostrarRutina(fechaStr, textoRutina, rutinaId, notasCliente) {
        viewCalendar.style.display = "none";
        viewRoutine.style.display = "block";
        window.scrollTo({ top: 0, behavior: 'smooth' });

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
                    if (numSets > 0 && numSets <= 15) {
                        const cleanTrimmed = trimmed.replace(/^[-•*]\s*/, "");
                        const formattedTrimmed = cleanTrimmed
                            .replace(/(series|sets)\s+de\s+/ig, "$1\n")
                            .replace(/(repeticiones|reps)\s+con\s+/ig, "$1\n");
                        const separator = currentExerciseName.endsWith(":") ? "\n" : " - ";
                        const exKey = currentExerciseName ? `${currentExerciseName}${separator}${formattedTrimmed}` : formattedTrimmed;
                        const savedSets = previousDynamicData[exKey] || [];

                        let extractedWeight = "-";
                        const currentIndex = lines.indexOf(line);
                        let sameLineM = line.match(/(\d+(?:\.\d+)?\s*(?:kg|lbs|lb|libras|kilos)[^\n]*)/i);
                        if (sameLineM) {
                            extractedWeight = sameLineM[1].trim();
                        } else {
                            for (let k = currentIndex + 1; k < currentIndex + 5 && k < lines.length; k++) {
                                let lookAhead = lines[k].trim();
                                if (!lookAhead) continue;
                                if (lookAhead.match(/(?:\d+)\s*(?:[xX]|sets?|series?)/i)) break;
                                let m = lookAhead.match(/(\d+(?:\.\d+)?\s*(?:kg|lbs|lb|libras|kilos)[^\n]*)/i);
                                if (m) { extractedWeight = m[1].trim(); break; }
                            }
                        }

                        const container = document.createElement('div');
                        container.style.cssText = 'margin-bottom:20px;padding:15px;background:rgba(255,255,255,0.03);border-radius:12px;border:1px solid rgba(255,255,255,0.05);';

                        const title = document.createElement('h5');
                        let formatStr = exKey.replace(/\s+(?:de\s+|con\s+|-)?(?=\d+(?:-\d+)?\s*(?:series|sets|reps|repeticiones|x|kg|lbs|lb|libras|kilos)\b)/ig, "\n");
                        let nicelyFormatted = formatStr.split('\n').map(l => l.trim().replace(/^(de|con|-|•|\*)\s+/i, '')).filter(l => l);

                        if (extractedWeight !== "-" && !nicelyFormatted.some(l => l.toLowerCase().includes(extractedWeight.toLowerCase()))) {
                            nicelyFormatted.push(`${extractedWeight}`);
                        }

                        if (nicelyFormatted.length > 0) {
                            title.innerHTML = `<span style="display:block;margin-bottom:8px;font-size:1.1rem;color:var(--primary-100);">${nicelyFormatted[0]}</span>` +
                                nicelyFormatted.slice(1).map(l => `<span style="display:block;font-size:0.85rem;color:var(--text-secondary);margin-bottom:4px;">• ${l.toUpperCase()}</span>`).join('');
                        } else {
                            title.innerText = exKey;
                        }
                        title.style.cssText = 'white-space:normal;margin-bottom:16px;';
                        container.appendChild(title);

                        // Historial de repeticiones previas
                        let historial = [];
                        let sortedRutinas = [...rutinas].sort((a, b) => new Date(a.dia) - new Date(b.dia));
                        sortedRutinas.forEach(rut => {
                            if (rut.dia < fechaStr && rut.notas_cliente) {
                                try {
                                    const parsed = JSON.parse(rut.notas_cliente);
                                    if (parsed.setsData) {
                                        const searchStr = currentExerciseName ? currentExerciseName.trim().toLowerCase() : exKey.trim().toLowerCase();
                                        const cleanSearch = searchStr.replace(/[^a-z0-9]/gi, '');
                                        let matchKey = null;
                                        for (let k in parsed.setsData) {
                                            const cleanK = k.replace(/[^a-z0-9]/gi, '');
                                            if (cleanSearch && cleanK && (cleanK.includes(cleanSearch) || cleanSearch.includes(cleanK))) {
                                                matchKey = k; break;
                                            }
                                        }
                                        if (matchKey && parsed.setsData[matchKey]) {
                                            const repsArray = parsed.setsData[matchKey].map(s => s.reps).filter(r => r !== "" && r !== null);
                                            if (repsArray.length > 0) historial.push({ dia: rut.dia, reps: repsArray.join(", ") });
                                        }
                                    }
                                } catch (e) { }
                            }
                        });

                        if (historial.length > 0) {
                            const historyDiv = document.createElement('div');
                            historyDiv.style.cssText = 'font-size:0.75rem;color:var(--text-tertiary);margin-bottom:12px;padding:8px;background:rgba(0,0,0,0.3);border-left:2px solid var(--primary-500);border-radius:2px 6px 6px 2px;line-height:1.4;';
                            let historyHtml = '<strong style="color:var(--primary-300);">Progresión Anterior:</strong><br>';
                            const recentHistory = historial.slice(-4);
                            recentHistory.forEach((h, index) => {
                                const semText = recentHistory.length - index === 1 ? 'Última vez' : `Hace ${recentHistory.length - index} sesiones`;
                                historyHtml += `<span style="padding-left:4px;display:inline-block;margin-top:2px;">• ${semText}: [${h.reps}] reps</span><br>`;
                            });
                            historyDiv.innerHTML = historyHtml;
                            container.appendChild(historyDiv);
                        }

                        for (let s = 1; s <= numSets; s++) {
                            const setRow = document.createElement('div');
                            setRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:12px;';

                            const setLabel = document.createElement('span');
                            setLabel.innerText = `Serie ${s}`;
                            setLabel.style.cssText = 'width:60px;font-size:0.85rem;color:var(--text-secondary);';

                            const savedRep = savedSets[s - 1] ? savedSets[s - 1].reps : "";
                            const repInput = document.createElement('input');
                            repInput.type = 'number';
                            repInput.placeholder = '¿Reps?';
                            repInput.value = savedRep;
                            repInput.className = 'dynamic-rep-input';
                            repInput.dataset.ex = exKey;
                            repInput.dataset.set = s;
                            repInput.style.cssText = 'padding:8px;width:100px;border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:white;background:rgba(0,0,0,0.4);';
                            repInput.dataset.weight = extractedWeight;

                            const weightLabel = document.createElement('span');
                            weightLabel.innerText = extractedWeight !== "-" ? extractedWeight : "Sin peso";
                            weightLabel.style.cssText = 'font-size:0.75rem;color:var(--text-tertiary);margin-left:5px;font-style:italic;';

                            setRow.appendChild(setLabel);
                            setRow.appendChild(repInput);
                            setRow.appendChild(weightLabel);
                            container.appendChild(setRow);
                        }
                        dynamicSetsContainer.appendChild(container);
                    }
                    currentExerciseName = "";
                } else {
                    currentExerciseName = trimmed;
                }
            });
        }

        if (rutinaId !== null) {
            progressForm.style.display = "block";
        } else {
            progressForm.style.display = "none";
        }

        routineText.innerText = textoRutina ? textoRutina.replace(/@/g, ', Peso sugerido:') : "";
    }

    // Botón Volver al Calendario
    document.getElementById("btn-back-calendar")?.addEventListener("click", () => {
        viewRoutine.style.display = "none";
        viewCalendar.style.display = "block";
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Nav meses
    prevMonthBtn?.addEventListener("click", () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderCalendar();
    });
    nextMonthBtn?.addEventListener("click", () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendar();
    });

    // Formulario de Progreso
    const progressForm = document.getElementById("progress-form");
    if (progressForm) {
        progressForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!currentObtainedRoutineId) return;

            const btn = document.getElementById("save-progress-btn");
            const originalText = btn.innerText;
            btn.innerText = "Guardando...";
            const notasText = document.getElementById("routine-notes").value;

            const setsData = {};
            document.querySelectorAll('.dynamic-rep-input').forEach((input) => {
                const ex = input.dataset.ex;
                if (!setsData[ex]) setsData[ex] = [];
                setsData[ex].push({ reps: input.value, weight: input.dataset.weight || "-" });
            });

            const jsonString = JSON.stringify({ setsData, notas: notasText });

            try {
                const res = await fetch(`${API_URL}/cliente/rutina/${currentObtainedRoutineId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ notas_cliente: jsonString })
                });

                if (res.ok) {
                    btn.innerText = "¡Guardado!";
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

    // Iniciar
    fetchRutinas().then(() => renderCalendar());
});
