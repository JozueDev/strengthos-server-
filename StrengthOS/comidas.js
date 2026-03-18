const API_URL = window.location.protocol === 'file:' ? 'http://127.0.0.1:5000/api' : '/api';

// Auth check
const userDataStr = localStorage.getItem("strengthos_user") || sessionStorage.getItem("strengthos_user");
if (!userDataStr) {
    window.location.href = "index.html";
}
const userData = JSON.parse(userDataStr);

let macrosChart = null;

document.addEventListener("DOMContentLoaded", () => {
    const mealList = document.getElementById("meal-list");
    const datePicker = document.getElementById("date-picker");
    const pageDate = document.getElementById("page-date");
    const pageObjective = document.getElementById("page-objective");

    const addNombre = document.getElementById("add-nombre");
    const addKcal = document.getElementById("add-calorias");
    const addP = document.getElementById("add-proteinas");
    const addC = document.getElementById("add-carbos");
    const addG = document.getElementById("add-grasas");
    const btnAdd = document.getElementById("btn-add-meal");

    const modalEdit = document.getElementById("modal-edit");
    const editId = document.getElementById("edit-id");
    const editNombre = document.getElementById("edit-nombre");
    const editKcal = document.getElementById("edit-calorias");
    const editP = document.getElementById("edit-proteinas");
    const editC = document.getElementById("edit-carbos");
    const editG = document.getElementById("edit-grasas");
    const btnSaveEdit = document.getElementById("btn-save-edit");
    const btnCloseModal = document.getElementById("btn-close-modal");

    // Scanner Refs
    const btnOpenScanner = document.getElementById("btn-open-scanner");
    const scannerPanel = document.getElementById("scanner-panel");
    const scannerInput = document.getElementById("scanner-input");
    const scannerDropzone = document.getElementById("scanner-dropzone");
    const scannerPreview = document.getElementById("scanner-preview");
    const scannerPlaceholder = document.getElementById("scanner-placeholder");
    const scannerLoading = document.getElementById("scanner-loading");
    const btnScanFetch = document.getElementById("btn-scan");
    const hoy = new Date().toISOString().split('T')[0];
    datePicker.value = hoy;
    updateDateDisplay(hoy);

    fetchComidas(hoy);

    datePicker.addEventListener("change", (e) => {
        updateDateDisplay(e.target.value);
        fetchComidas(e.target.value);
    });

    btnAdd.addEventListener("click", async () => {
        const payload = {
            user_id: userData.user_id,
            dia: datePicker.value,
            nombre: addNombre.value.trim(),
            calorias: parseInt(addKcal.value) || 0,
            proteinas: parseFloat(addP.value) || 0,
            carbohidratos: parseFloat(addC.value) || 0,
            grasas: parseFloat(addG.value) || 0
        };

        if (!payload.nombre) {
            alert("Escribe el nombre de la comida.");
            return;
        }

        try {
            const res = await fetch(`${API_URL}/comidas`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                // Limpiar campos
                addNombre.value = "";
                addKcal.value = "";
                addP.value = "";
                addC.value = "";
                addG.value = "";
                fetchComidas(datePicker.value);
            }
        } catch (e) {
            console.error(e);
        }
    });

    btnSaveEdit.addEventListener("click", async () => {
        const id = editId.value;
        const payload = {
            nombre: editNombre.value.trim(),
            calorias: parseInt(editKcal.value) || 0,
            proteinas: parseFloat(editP.value) || 0,
            carbohidratos: parseFloat(editC.value) || 0,
            grasas: parseFloat(editG.value) || 0
        };

        try {
            const res = await fetch(`${API_URL}/comidas/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                modalEdit.style.display = "none";
                fetchComidas(datePicker.value);
            }
        } catch (e) {
            console.error(e);
        }
    });

    btnCloseModal.addEventListener("click", () => {
        modalEdit.style.display = "none";
    });

    // ── Lógica Scanner ──
    btnOpenScanner.addEventListener("click", () => {
        scannerPanel.style.display = scannerPanel.style.display === "none" ? "block" : "none";
    });

    scannerDropzone.addEventListener("click", () => scannerInput.click());

    scannerInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = () => {
                scannerPreview.src = reader.result;
                scannerPreview.style.display = "block";
                scannerPlaceholder.style.display = "none";
                btnScanFetch.style.display = "block";
            };
            reader.readAsDataURL(file);
        }
    });

    btnScanFetch.addEventListener("click", async () => {
        const file = scannerInput.files[0];
        if (!file) return;

        scannerLoading.style.display = "block";
        btnScanFetch.disabled = true;

        const formData = new FormData();
        formData.append("foto", file);

        try {
            const res = await fetch(`${API_URL}/nutricion/analizar-comida`, {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (res.ok) {
                // Autocompletar el formulario
                addNombre.value = data.nombre;
                addKcal.value = data.calorias;
                addP.value = data.proteinas;
                addC.value = data.carbohidratos;
                addG.value = data.grasas;
                
                // Ocultar scanner
                scannerPanel.style.display = "none";
                alert(`IA detectó: ${data.nombre}. Se han rellenado los macros.`);
            } else {
                alert(data.error || "Error al analizar imagen.");
            }
        } catch (e) {
            alert("Error de conexión con IA.");
        } finally {
            scannerLoading.style.display = "none";
            btnScanFetch.disabled = false;
        }
    });

    async function fetchComidas(dia) {
        try {
            const res = await fetch(`${API_URL}/comidas/${userData.user_id}?dia=${dia}`);
            const data = await res.json();

            if (res.ok) {
                renderMeals(data.comidas);
                updateStats(data.comidas);
                pageObjective.innerText = `Objetivo: ${data.objetivo || "No especificado en perfil"}`;
            }
        } catch (e) {
            console.error(e);
        }
    }

    function renderMeals(comidas) {
        if (!comidas || comidas.length === 0) {
            mealList.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-tertiary);">
                    <p>No has registrado comidas para este día.</p>
                </div>`;
            return;
        }

        mealList.innerHTML = "";
        comidas.forEach(m => {
            const item = document.createElement("div");
            item.className = `meal-item ${m.completado ? 'completed' : ''}`;
            item.innerHTML = `
                <div class="checkbox ${m.completado ? 'checked' : ''}" data-id="${m.id}"></div>
                <div class="meal-info">
                    <div class="meal-name">${m.nombre}</div>
                    <div class="meal-macros">${m.calorias} kcal · P: ${m.proteinas}g · C: ${m.carbohidratos}g · G: ${m.grasas}g</div>
                </div>
                <div style="display: flex; gap: 5px;">
                    <button class="btn-delete btn-edit" data-id="${m.id}" style="color: var(--primary-200); opacity:1;">✏️</button>
                    <button class="btn-delete" data-id="${m.id}">🗑️</button>
                </div>
            `;

            // Toggle completado
            item.querySelector(".checkbox").onclick = async (e) => {
                const id = e.target.getAttribute("data-id");
                await fetch(`${API_URL}/comidas/${id}/toggle`, { method: 'PUT' });
                fetchComidas(datePicker.value);
            };

            // Abrir edición
            item.querySelector(".btn-edit").onclick = (e) => {
                const id = e.currentTarget.getAttribute("data-id");
                editId.value = id;
                editNombre.value = m.nombre;
                editKcal.value = m.calorias;
                editP.value = m.proteinas;
                editC.value = m.carbohidratos;
                editG.value = m.grasas;
                modalEdit.style.display = "flex";
            };

            // Eliminar
            item.querySelector(".btn-delete").onclick = async (e) => {
                if (!confirm("¿Eliminar este registro?")) return;
                const id = e.currentTarget.getAttribute("data-id");
                await fetch(`${API_URL}/comidas/${id}`, { method: 'DELETE' });
                fetchComidas(datePicker.value);
            };

            mealList.appendChild(item);
        });
    }

    function updateStats(comidas) {
        let totalKcal = 0, totalP = 0, totalC = 0, totalG = 0;

        comidas.filter(m => m.completado).forEach(m => {
            totalKcal += m.calorias;
            totalP += m.proteinas;
            totalC += m.carbohidratos;
            totalG += m.grasas;
        });

        document.getElementById("total-kcal").innerText = totalKcal;
        document.getElementById("total-p").innerText = `${totalP.toFixed(1)}g`;
        document.getElementById("total-c").innerText = `${totalC.toFixed(1)}g`;
        document.getElementById("total-g").innerText = `${totalG.toFixed(1)}g`;

        renderChart(totalP, totalC, totalG);
    }

    function renderChart(p, c, g) {
        const ctx = document.getElementById('macros-chart').getContext('2d');
        
        if (macrosChart) {
            macrosChart.destroy();
        }

        if (p === 0 && c === 0 && g === 0) {
            // No mostrar gráfica si no hay datos
            return;
        }

        macrosChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Proteínas', 'Carbos', 'Grasas'],
                datasets: [{
                    data: [p * 4, c * 4, g * 9], // Aproximación por calorías
                    backgroundColor: ['#ff6384', '#36a2eb', '#ffcd56'],
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                cutout: '70%'
            }
        });
    }

    function updateDateDisplay(diaStr) {
        const d = new Date(diaStr + 'T00:00:00');
        const hoy = new Date().toISOString().split('T')[0];
        
        let label = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
        if (diaStr === hoy) label = "Hoy, " + label;

        pageDate.innerText = label.charAt(0).toUpperCase() + label.slice(1);
    }
});
