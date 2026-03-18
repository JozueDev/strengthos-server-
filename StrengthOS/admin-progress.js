// admin-progress.js — Gráficas de progreso por cliente (página dedicada)
const userDataStr = localStorage.getItem("strengthos_user") || sessionStorage.getItem("strengthos_user");
if (!userDataStr) {
    window.location.href = "index.html";
}
const authData = JSON.parse(userDataStr);
if (!authData.es_admin) {
    window.location.href = "dashboard.html";
}

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

    document.getElementById("progress-page-title").innerText = `📈 Progreso — ${nombre}`;
    document.title = `Progreso de ${nombre} | StrengthOS Admin`;

    let rutinas = [];

    // ── Cargar datos ──────────────────────────────────────────
    async function loadData() {
        try {
            const res = await fetch(`${API_URL}/cliente/${userId}/rutinas`);
            if (res.ok) {
                rutinas = await res.json();
                calcularStats();
                initMonthlySelect();
            } else {
                document.getElementById("admin-progress-stats-container").innerHTML =
                    `<p style="color:var(--text-tertiary);text-align:center;">No se pudieron cargar los datos.</p>`;
            }
        } catch (e) {
            document.getElementById("admin-progress-stats-container").innerHTML =
                `<p style="color:var(--text-tertiary);text-align:center;">Error de conexión.</p>`;
        }
    }

    // ── Estadísticas generales ───────────────────────────────
    function calcularStats() {
        let minDate = Infinity, maxDate = -Infinity, routCount = 0;
        rutinas.forEach(r => {
            if (r.notas_cliente) routCount++;
            const d = new Date(r.dia).getTime();
            if (d < minDate) minDate = d;
            if (d > maxDate) maxDate = d;
        });

        if (minDate !== Infinity) {
            const diffWeeks = Math.round((maxDate - minDate) / (1000 * 3600 * 24 * 7));
            document.getElementById("admin-prog-weeks").innerText = diffWeeks === 0 ? '1' : diffWeeks;
        } else {
            document.getElementById("admin-prog-weeks").innerText = '0';
        }
        document.getElementById("admin-prog-routines").innerText = routCount;
    }

    // ── Selector de meses ────────────────────────────────────
    function initMonthlySelect() {
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

        select.onchange = (e) => renderAdminMonthlyStats(e.target.value);

        if (monthsArr.length > 0) {
            select.value = monthsArr[0];
            renderAdminMonthlyStats(monthsArr[0]);
        } else {
            document.getElementById("admin-progress-stats-container").innerHTML =
                `<p style="color:var(--text-tertiary);text-align:center;padding:20px;">Este atleta aún no ha registrado métricas en sus rutinas.</p>`;
        }
    }

    // ── Renderizar gráficas ──────────────────────────────────
    function renderAdminMonthlyStats(monthFilter) {
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
                                let ejName = k.split('\n')[0].trim() || k;
                                if (!ejerciciosStats[ejName]) ejerciciosStats[ejName] = [];

                                const totalReps = validSets.map(s => parseInt(s.reps) || 0).reduce((a, b) => a + b, 0);
                                let tempWeight = "-";
                                const mKey = k.match(/(\d+(?:\.\d+)?\s*(?:kg|lbs|lb|libras|kilos)[^\n]*)/i);
                                if (mKey) tempWeight = mKey[1].trim();
                                const maxWeight = Math.max(...validSets.map(s => parseFloat(s.weight && s.weight !== "-" ? s.weight : tempWeight) || 0));

                                ejerciciosStats[ejName].push({
                                    dia: rut.dia,
                                    repsString: validSets.map(s => s.reps).join(", "),
                                    weightString: validSets.map(s => (s.weight && s.weight !== "-") ? s.weight : tempWeight).join(", "),
                                    totalReps,
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
            container.innerHTML = `<div style="text-align:center;padding:30px;background:rgba(0,0,0,0.2);border-radius:12px;border:1px dashed rgba(255,255,255,0.1);"><p style="color:var(--text-secondary);">No hay datos de rendimiento para este mes.</p></div>`;
            return;
        }

        exercises.forEach(ej => {
            const records = ejerciciosStats[ej];
            if (records.length === 0) return;

            const ejContainer = document.createElement("div");
            ejContainer.className = "chart-card";

            const title = document.createElement("h4");
            title.style.cssText = "color:var(--primary-100);margin-bottom:5px;font-size:1.1rem;";
            title.innerText = `📈 ${ej}`;
            ejContainer.appendChild(title);

            const legendDiv = document.createElement("div");
            legendDiv.style.cssText = "margin-bottom:15px;font-size:0.8rem;display:flex;gap:15px;flex-wrap:wrap;";
            legendDiv.innerHTML = `
                <div style="display:flex;align-items:center;gap:5px;"><div style="width:12px;height:12px;background:rgba(255,255,255,0.4);border-radius:2px;"></div><span style="color:var(--text-secondary);">Inicial/Igual</span></div>
                <div style="display:flex;align-items:center;gap:5px;"><div style="width:12px;height:12px;background:rgba(0,255,100,0.6);border-radius:2px;"></div><span style="color:var(--text-secondary);">Aumento</span></div>
                <div style="display:flex;align-items:center;gap:5px;"><div style="width:12px;height:12px;background:rgba(255,99,132,0.6);border-radius:2px;"></div><span style="color:var(--text-secondary);">Disminución</span></div>`;
            ejContainer.appendChild(legendDiv);

            const canvasWrapper = document.createElement("div");
            canvasWrapper.style.cssText = "position:relative;height:250px;width:100%;";
            const canvas = document.createElement("canvas");
            canvasWrapper.appendChild(canvas);
            ejContainer.appendChild(canvasWrapper);
            container.appendChild(ejContainer);

            const labels = records.map(r => new Date(r.dia + 'T00:00:00').toLocaleDateString('es-ES', { month: 'short', day: 'numeric' }));
            const dataReps = records.map(r => r.totalReps);
            const dataWeights = records.map(r => r.maxWeight);

            const colors = dataReps.map((val, i) => {
                if (i === 0) return 'rgba(255,255,255,0.4)';
                const rd = val - dataReps[i - 1];
                const wd = (dataWeights[i] || 0) - (dataWeights[i - 1] || 0);
                if (rd > 0 || wd > 0) return 'rgba(0,255,100,0.6)';
                if (rd < 0 || wd < 0) return 'rgba(255,99,132,0.6)';
                return 'rgba(255,255,255,0.4)';
            });

            new Chart(canvas, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{ label: 'Reps Totales', data: dataReps, backgroundColor: colors, borderRadius: 4, yAxisID: 'y' }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            intersect: false,
                            titleFont: { size: 11 },
                            bodyFont: { size: 11 },
                            padding: 8,
                            callbacks: {
                                afterLabel: (ctx) => {
                                    const r = records[ctx.dataIndex];
                                    const wArr = r.weightString.split(", ");
                                    const wText = wArr.every(w => w === wArr[0]) && wArr[0] !== "-" ? wArr[0] : `[ ${r.weightString} ]`;
                                    return [`Peso: ${wText}`, `Series: [ ${r.repsString} ]`];
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            type: 'linear', display: true, position: 'left',
                            title: { display: true, text: 'Reps Totales', color: 'rgba(255,255,255,0.5)' },
                            ticks: { color: 'rgba(255,255,255,0.7)', precision: 0 },
                            grid: { color: 'rgba(255,255,255,0.05)' }
                        },
                        x: { ticks: { color: 'rgba(255,255,255,0.7)' }, grid: { display: false } }
                    }
                }
            });
        });
    }

    loadData();
});
