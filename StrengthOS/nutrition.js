const API_URL = window.location.protocol === 'file:' ? 'http://127.0.0.1:5000/api' : '/api';

// Auth check
const userDataStr = localStorage.getItem("strengthos_user") || sessionStorage.getItem("strengthos_user");
if (!userDataStr) window.location.href = "index.html";
const userData = JSON.parse(userDataStr);

document.addEventListener("DOMContentLoaded", () => {
    const mealList     = document.getElementById("meal-list");
    const datePicker   = document.getElementById("date-picker");
    const totalKcal    = document.getElementById("total-kcal");
    const totalP       = document.getElementById("total-p");
    const totalC       = document.getElementById("total-c");
    const totalG       = document.getElementById("total-g");
    const progressBar  = document.getElementById("progress-bar");
    const progressText = document.getElementById("progress-text");
    const progressPct  = document.getElementById("progress-pct");

    let macrosChart = null;
    let allMeals    = [];

    // Fecha de hoy
    const hoy = new Date().toISOString().split('T')[0];
    datePicker.value = hoy;

    // Personalizar saludo
    const hour = new Date().getHours();
    const greet = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
    const sub = document.getElementById("greeting-sub");
    if (sub) sub.textContent = `${greet}, ${userData.nombre?.split(' ')[0] || ''}! Marca lo que ya consumiste hoy.`;

    // ── Cargar comidas del día ─────────────────────────────────
    const loadDay = async () => {
        const dia = datePicker.value;
        try {
            const res  = await fetch(`${API_URL}/comidas/${userData.user_id}?dia=${dia}`);
            const data = await res.json();
            allMeals = data.comidas || [];
            renderMeals(allMeals);
            updateStats(allMeals);
        } catch (e) {
            console.error(e);
        }
    };

    // ── Renderizar checklist ───────────────────────────────────
    const renderMeals = (comidas) => {
        mealList.innerHTML = "";

        if (!comidas || comidas.length === 0) {
            mealList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🍽️</div>
                    <h3>Sin comidas asignadas</h3>
                    <p>Tu entrenador aún no ha enviado el plan de hoy.</p>
                </div>`;
            updateProgress(0, 0);
            return;
        }

        // Calcular max de cada macro para las barras proporcionales
        const maxP   = Math.max(...comidas.map(m => m.proteinas || 0), 1);
        const maxC   = Math.max(...comidas.map(m => m.carbohidratos || 0), 1);
        const maxG   = Math.max(...comidas.map(m => m.grasas || 0), 1);
        const totalKcalPlan = comidas.reduce((s, m) => s + (m.calorias || 0), 0);

        comidas.forEach(meal => {
            const p    = meal.proteinas     || 0;
            const c    = meal.carbohidratos || 0;
            const g    = meal.grasas        || 0;
            const kcal = meal.calorias      || 0;

            // Porcentaje de calorias respecto al total del plan
            const kcalPct  = totalKcalPlan > 0 ? Math.round((kcal / totalKcalPlan) * 100) : 0;

            // Barras relativas al max de cada macro en el dia
            const barP = Math.round((p / maxP) * 100);
            const barC = Math.round((c / maxC) * 100);
            const barG = Math.round((g / maxG) * 100);

            // Ratio de macros en calorias
            const calP  = p * 4;
            const calC  = c * 4;
            const calG  = g * 9;
            const calT  = calP + calC + calG || 1;
            const ratioP = Math.round((calP / calT) * 100);
            const ratioC = Math.round((calC / calT) * 100);
            const ratioG = Math.round((calG / calT) * 100);

            const item = document.createElement("div");
            item.className = `meal-item ${meal.completado ? 'completed' : ''}`;
            item.setAttribute('data-id', meal.id);

            item.innerHTML = `
                <!-- Fila principal -->
                <div class="check-circle" data-action="check">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2 7l3.5 3.5L12 3" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </div>
                <div class="meal-info" data-action="check" style="cursor:pointer;">
                    <div class="meal-name">${meal.nombre}</div>
                    <div class="meal-macros">
                        <span class="macro-badge badge-kcal">⚡ ${kcal} kcal</span>
                        <span class="macro-badge badge-p">P: ${p}g</span>
                        <span class="macro-badge badge-c">C: ${c}g</span>
                        <span class="macro-badge badge-g">G: ${g}g</span>
                    </div>
                </div>
                <button class="expand-btn" data-action="expand" title="Ver detalles">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2.5 5l4.5 4 4.5-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>

                <!-- Panel de detalles expandible -->
                <div class="meal-detail">
                    <div class="detail-divider"></div>

                    ${(meal.ingredientes && meal.ingredientes.length > 0) ? `
                        <div class="ingredients-label">🛒 Ingredientes</div>
                        <ul class="ingredients-list">
                            ${meal.ingredientes.map(ing => `<li>${ing}</li>`).join('')}
                        </ul>
                    ` : `
                        <p style="font-size:0.8rem; color:var(--text-tertiary); margin:0;">
                            Sin detalle de ingredientes.
                        </p>
                    `}

                    <div class="detail-macros-row">
                        <span style="color:#f87171;">P <strong>${p}g</strong></span>
                        <span style="color:#60a5fa;">C <strong>${c}g</strong></span>
                        <span style="color:#6ee7b7;">G <strong>${g}g</strong></span>
                        <span style="color:var(--text-tertiary);">🔥 <strong>${kcalPct}%</strong> del plan</span>
                    </div>
                </div>
            `;


            // Evento: checkbox (check-circle + meal-info)
            item.querySelectorAll('[data-action="check"]').forEach(el => {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleMeal(meal.id, item, meal);
                });
            });

            // Evento: expandir (botón chevron)
            item.querySelector('[data-action="expand"]').addEventListener('click', (e) => {
                e.stopPropagation();
                item.classList.toggle('expanded');
            });

            mealList.appendChild(item);
        });

        const done  = comidas.filter(m => m.completado).length;
        updateProgress(done, comidas.length);
    };


    // ── Toggle comida ──────────────────────────────────────────
    const toggleMeal = async (id, itemEl, meal) => {
        // Optimistic UI
        const nowDone = !itemEl.classList.contains('completed');
        itemEl.classList.toggle('completed', nowDone);
        meal.completado = nowDone;

        // Recalcular stats inmediatamente
        updateStats(allMeals);
        const done = allMeals.filter(m => m.completado).length;
        updateProgress(done, allMeals.length);

        try {
            await fetch(`${API_URL}/comidas/${id}/toggle`, { method: 'PUT' });
        } catch (e) {
            // Revertir si falla
            itemEl.classList.toggle('completed', !nowDone);
            meal.completado = !nowDone;
            updateStats(allMeals);
        }
    };

    // ── Barra de progreso ──────────────────────────────────────
    const updateProgress = (done, total) => {
        const pct = total === 0 ? 0 : Math.round((done / total) * 100);
        progressBar.style.width  = pct + '%';
        progressText.textContent = `${done} de ${total} comidas`;
        progressPct.textContent  = pct + '%';
    };

    // ── Estadísticas y gráfica ─────────────────────────────────
    const updateStats = (comidas) => {
        let p = 0, c = 0, g = 0, cal = 0;
        (comidas || []).forEach(m => {
            if (m.completado) {
                p   += Number(m.proteinas)     || 0;
                c   += Number(m.carbohidratos) || 0;
                g   += Number(m.grasas)        || 0;
                cal += Number(m.calorias)      || 0;
            }
        });

        // Animación de contador
        animateCount(totalKcal, cal);
        totalP.textContent = p + 'g';
        totalC.textContent = c + 'g';
        totalG.textContent = g + 'g';

        renderChart(p, c, g);
    };

    const animateCount = (el, target) => {
        const current = parseInt(el.textContent) || 0;
        const diff = target - current;
        const steps = 20;
        let step = 0;
        const timer = setInterval(() => {
            step++;
            el.textContent = Math.round(current + (diff * step / steps));
            if (step >= steps) clearInterval(timer);
        }, 15);
    };

    // ── Donut Chart ───────────────────────────────────────────
    const renderChart = (p, c, g) => {
        const ctx = document.getElementById('macros-chart').getContext('2d');

        const hasData = p > 0 || c > 0 || g > 0;
        const data    = hasData ? [p, c, g] : [1, 1, 1];
        const colors  = hasData
            ? ['#f87171', '#60a5fa', '#6ee7b7']
            : ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.05)'];

        if (macrosChart) {
            macrosChart.data.datasets[0].data         = data;
            macrosChart.data.datasets[0].backgroundColor = colors;
            macrosChart.update('active');
            return;
        }

        macrosChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Proteína', 'Carbos', 'Grasas'],
                datasets: [{
                    data: data,
                    backgroundColor: colors,
                    borderWidth: 0,
                    hoverOffset: 6,
                    borderRadius: 4
                }]
            },
            options: {
                cutout: '72%',
                animation: { animateRotate: true, duration: 600 },
                plugins: { legend: { display: false }, tooltip: {
                    callbacks: {
                        label: ctx => ` ${ctx.label}: ${hasData ? ctx.raw + 'g' : '--'}`
                    }
                }},
                responsive: true,
                maintainAspectRatio: false,
            }
        });
    };

    datePicker.addEventListener("change", loadDay);
    loadDay();
});
