// admin-routines.js — Editor de rutinas por cliente (página dedicada)

document.addEventListener("DOMContentLoaded", () => {
    const API_URL = window.location.protocol === 'file:' ? 'http://127.0.0.1:5000/api' : '/api';

    // Leer parámetros de URL
    const params = new URLSearchParams(window.location.search);
    const userId = params.get('user_id');
    const nombre = params.get('nombre') || 'Atleta';

    if (!userId) {
        window.location.href = 'admin.html';
        return;
    }

    // Título de la página
    document.getElementById("routine-page-title").innerText = `📅 Rutinas — ${nombre}`;
    document.title = `Rutinas de ${nombre} | StrengthOS Admin`;

    // DOM refs
    const viewCalendar = document.getElementById("view-calendar");
    const viewEditor = document.getElementById("view-editor");
    const adminCalendarDays = document.getElementById("admin-calendar-days");
    const adminMonthYearDisplay = document.getElementById("admin-month-year-display");
    const routineForm = document.getElementById("routine-editor-form");
    const btnDeleteRoutine = document.getElementById("btn-delete-routine");
    const btnBackCalendar = document.getElementById("btn-back-calendar");

    let adminCurrentDate = new Date();
    let loadedRutinas = [];

    // ── Cargar rutinas del cliente ───────────────────────────
    async function fetchClientRutinas() {
        try {
            const res = await fetch(`${API_URL}/cliente/${userId}/rutinas`);
            if (res.ok) loadedRutinas = await res.json();
        } catch (error) {
            console.error(error);
        }
    }

    // ── Renderizar Calendario ────────────────────────────────
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
                    <span style="font-size:0.65rem;color:var(--primary-200);max-width:90%;text-align:center;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-top:2px;line-height:1.2;">${previewText}</span>
                `;
            } else {
                dayDiv.addEventListener("click", () => openDailyEditor(dateStr, "", ""));
                dayDiv.innerHTML = `<span class="calendar-day-number">${i}</span>`;
            }
            adminCalendarDays.appendChild(dayDiv);
        }
    }

    // ── Abrir editor de un día ───────────────────────────────
    function openDailyEditor(fechaStr, textoActual, notasCliente) {
        viewCalendar.style.display = "none";
        viewEditor.style.display = "block";
        window.scrollTo({ top: 0, behavior: 'smooth' });

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

                        // Historial de sesiones anteriores para este ejercicio
                        let historial = [];
                        let sortedRutinas = [...loadedRutinas].sort((a, b) => new Date(a.dia) - new Date(b.dia));
                        sortedRutinas.forEach(rut => {
                            if (rut.dia < fechaStr && rut.notas_cliente) {
                                try {
                                    const pastParsed = JSON.parse(rut.notas_cliente);
                                    if (pastParsed.setsData) {
                                        const cleanSearch = exKey.replace(/[^a-z0-9]/gi, '');
                                        let matchKey = null;
                                        for (let k in pastParsed.setsData) {
                                            const cleanK = k.replace(/[^a-z0-9]/gi, '');
                                            if (cleanSearch && cleanK && (cleanK.includes(cleanSearch) || cleanSearch.includes(cleanK))) {
                                                matchKey = k; break;
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
                            html += `<div style="font-size:0.8rem;background:rgba(0,0,0,0.3);border-left:2px solid var(--primary-500);padding:6px;margin:4px 0 8px 0;border-radius:3px;">`;
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
                            html += `<span style="display:inline-block;min-width:80px;font-size:0.85rem;">Serie ${index + 1}:</span> ${reps}<br>`;
                        });
                        html += `<br>`;
                    }
                }

                if (html === "") html = "(Sin registros ingresados)";
                notesText.innerHTML = html;
            } catch (e) {
                notesText.innerText = notasCliente;
            }
        } else {
            notesContainer.style.display = "none";
            notesText.innerText = "";
        }
    }

    // ── Guardar/Limpiar rutina ───────────────────────────────
    async function sendRoutineRequest(ejerciciosText) {
        const dateVal = document.getElementById("routine-date").value;
        const btn = routineForm.querySelector("button[type='submit']");
        const originalText = btn.innerText;
        btn.innerText = "Guardando...";

        try {
            const res = await fetch(`${API_URL}/admin/rutina`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: userId, dia: dateVal, ejercicios: ejerciciosText })
            });
            const data = await res.json();
            btn.innerText = originalText;

            if (res.ok) {
                await fetchClientRutinas();
                viewEditor.style.display = "none";
                viewCalendar.style.display = "block";
                window.scrollTo({ top: 0, behavior: 'smooth' });
                renderAdminCalendar();
            } else {
                alert(data.error || "Error al actualizar la rutina.");
            }
        } catch (error) {
            console.error("Error:", error);
            alert("Error de conexión.");
            btn.innerText = originalText;
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

    btnBackCalendar.addEventListener("click", () => {
        viewEditor.style.display = "none";
        viewCalendar.style.display = "block";
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Nav meses
    document.getElementById("admin-prev-month")?.addEventListener("click", () => {
        adminCurrentDate.setMonth(adminCurrentDate.getMonth() - 1);
        renderAdminCalendar();
    });
    document.getElementById("admin-next-month")?.addEventListener("click", () => {
        adminCurrentDate.setMonth(adminCurrentDate.getMonth() + 1);
        renderAdminCalendar();
    });

    // Iniciar
    fetchClientRutinas().then(() => renderAdminCalendar());
});
