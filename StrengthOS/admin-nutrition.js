const API_URL = window.location.protocol === 'file:' ? 'http://127.0.0.1:5000/api' : '/api';

// ── Modal de error de IA ──────────────────────────────────────────────────────
function showAIError(errorMsg) {
    // Eliminar modal anterior si existe
    const prev = document.getElementById('ai-error-modal');
    if (prev) prev.remove();

    const isPermanent = errorMsg.includes('CUOTA_AGOTADA');
    const isRateLimit = errorMsg.includes('RATE_LIMIT');

    const title = isPermanent
        ? '⚠️ Cuota de IA Agotada'
        : isRateLimit
            ? '⏳ Límite Temporal Alcanzado'
            : '❌ Error de IA';

    const body = isPermanent
        ? `<p style="color:#94a3b8;line-height:1.6;margin-bottom:16px;">La cuota <strong>gratuita</strong> de tu API de Gemini se agotó por hoy. Tienes dos opciones:</p>
           <div style="display:flex;flex-direction:column;gap:10px;">
             <div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.3);border-radius:12px;padding:14px;">
               <div style="font-weight:700;color:#22c55e;margin-bottom:4px;">✅ Opción 1 (Recomendada): Activar facturación</div>
               <div style="font-size:0.85rem;color:#94a3b8;">Activa tu cuenta en Google AI Studio. El costo es muy bajo (~$0.10 por 1M tokens). Los planes gratis gastan ~3,000 tokens.</div>
               <a href="https://aistudio.google.com/app/apikey" target="_blank" style="display:inline-block;margin-top:10px;padding:8px 16px;background:rgba(34,197,94,0.2);border:1px solid rgba(34,197,94,0.5);border-radius:8px;color:#22c55e;font-weight:600;font-size:0.85rem;text-decoration:none;">Abrir Google AI Studio →</a>
             </div>
             <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px;">
               <div style="font-weight:700;color:#e2e8f0;margin-bottom:4px;">⏰ Opción 2: Esperar</div>
               <div style="font-size:0.85rem;color:#94a3b8;">La cuota gratuita se renueva a las <strong style="color:#e2e8f0;">medianoche (hora del Pacífico)</strong>. Puedes intentarlo de nuevo mañana.</div>
             </div>
           </div>`
        : `<p style="color:#94a3b8;line-height:1.6;">Has enviado demasiadas solicitudes en poco tiempo. Espera <strong style="color:#e2e8f0;">1-2 minutos</strong> y vuelve a intentarlo. La IA procesará tu solicitud correctamente.</p>`;

    const modal = document.createElement('div');
    modal.id = 'ai-error-modal';
    modal.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(8px);
        display:flex;align-items:center;justify-content:center;z-index:9999;
        animation:fadeIn 0.2s ease;
    `;
    modal.innerHTML = `
        <style>@keyframes fadeIn{from{opacity:0;transform:scale(0.95)}to{opacity:1;transform:scale(1)}}</style>
        <div style="background:#0f1623;border:1px solid rgba(255,255,255,0.1);border-radius:20px;
                    padding:32px;max-width:480px;width:90%;box-shadow:0 25px 60px rgba(0,0,0,0.5);">
            <h3 style="margin:0 0 16px;font-size:1.2rem;color:#f1f5f9;">${title}</h3>
            ${body}
            <button onclick="document.getElementById('ai-error-modal').remove()"
                style="margin-top:20px;width:100%;padding:12px;background:rgba(255,255,255,0.07);
                       border:1px solid rgba(255,255,255,0.12);border-radius:10px;color:#e2e8f0;
                       font-weight:600;cursor:pointer;font-size:0.95rem;">
                Entendido
            </button>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

// Auth check (Admin only)
const userDataStr = localStorage.getItem("strengthos_user") || sessionStorage.getItem("strengthos_user");
if (!userDataStr) {
    window.location.href = "index.html";
}
const authData = JSON.parse(userDataStr);
if (!authData.es_admin) {
    window.location.href = "dashboard.html";
}

// Get client from URL
const urlParams = new URLSearchParams(window.location.search);
const targetUserId = urlParams.get('user_id');
const targetUserName = urlParams.get('nombre') || 'Atleta';

if (!targetUserId) {
    alert("No se especificó un usuario.");
    window.location.href = "admin.html";
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("client-name-title").innerText = targetUserName;

    // Referencias DOM
    const inputPeso = document.getElementById("nutri-peso");
    const inputEstatura = document.getElementById("nutri-estatura");
    const inputEdad = document.getElementById("nutri-edad");
    const inputGrasa = document.getElementById("nutri-grasa");
    const inputObjetivo = document.getElementById("nutri-objetivo");
    const inputAlergias = document.getElementById("nutri-alergias");
    const inputAlimentos = document.getElementById("nutri-alimentos");

    const btnGenerate = document.getElementById("btn-generate-plan");
    const loadingOverlay = document.getElementById("loading-overlay");
    const loadingText = document.getElementById("loading-text");
    const planResult = document.getElementById("plan-result");
    const planWrapper = document.getElementById("plan-result-wrapper");
    const planEditor = document.getElementById("plan-editor");
    const btnEditPlan = document.getElementById("btn-edit-plan");
    const btnSavePlan = document.getElementById("btn-save-plan");
    const planEmpty = document.getElementById("plan-empty");

    const chatInput = document.getElementById("chat-input");
    const btnChatSend = document.getElementById("btn-chat-send");

    let currentPlanMarkdown = "";

    // Cargar datos existentes del cliente
    function loadClientData() {
        fetch(`${API_URL}/nutricion/${targetUserId}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (!data) return;
                
                // Actualizar displays (Visual)
                document.getElementById("nutri-peso-display").innerText = (data.peso && data.peso !== '--') ? `${data.peso} kg` : '--';
                document.getElementById("nutri-estatura-display").innerText = (data.estatura && data.estatura !== '--') ? `${data.estatura} cm` : '--';
                document.getElementById("nutri-edad-display").innerText = (data.edad && data.edad !== '--') ? `${data.edad} años` : '--';
                document.getElementById("nutri-grasa-display").innerText = (data.grasa_corporal && data.grasa_corporal !== '--') ? `${data.grasa_corporal} %` : '--';

                // Actualizar inputs (Para la generación con IA)
                if (data.peso && data.peso !== '--') inputPeso.value = data.peso;
                if (data.estatura && data.estatura !== '--') inputEstatura.value = data.estatura;
                if (data.edad && data.edad !== '--') inputEdad.value = data.edad;
                if (data.grasa_corporal && data.grasa_corporal !== '--') inputGrasa.value = data.grasa_corporal;
                if (data.objetivo) inputObjetivo.value = data.objetivo;
                if (data.alergias) inputAlergias.value = data.alergias;
                if (data.alimentos) inputAlimentos.value = data.alimentos;
                
                if (data.plan_nutricional) {
                    renderPlan(data.plan_nutricional);
                }
            })
            .catch(err => console.error("Error loading nutrition data:", err));
    }

    loadClientData();

    btnEditPlan.addEventListener("click", () => {
        if (planEditor.style.display === "none") {
            planEditor.value = currentPlanMarkdown;
            planResult.style.display = "none";
            planEditor.style.display = "block";
            btnEditPlan.innerHTML = "👁️ Ver";
            btnSavePlan.style.display = "inline-block";
        } else {
            currentPlanMarkdown = planEditor.value;
            renderPlan(currentPlanMarkdown);
            planEditor.style.display = "none";
            planResult.style.display = "block";
            btnEditPlan.innerHTML = "✏️ Editar";
        }
    });

    btnSavePlan.addEventListener("click", async () => {
        const newPlan = planEditor.style.display === "block" ? planEditor.value : currentPlanMarkdown;
        
        btnSavePlan.innerText = "Guardando...";
        try {
            const res = await fetch(`${API_URL}/nutricion/${targetUserId}/plan`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plan: newPlan })
            });
            if (res.ok) {
                currentPlanMarkdown = newPlan;
                renderPlan(newPlan);
                planEditor.style.display = "none";
                planResult.style.display = "block";
                btnEditPlan.innerHTML = "✏️ Editar";
                btnSavePlan.style.display = "none";
                alert("Plan guardado y enviado al cliente.");
            }
        } catch (e) {
            alert("Error al guardar.");
        } finally {
            btnSavePlan.innerText = "💾 Guardar";
        }
    });

    const btnDeletePlanManual = document.getElementById("btn-delete-plan-manual");
    if (btnDeletePlanManual) {
        btnDeletePlanManual.addEventListener("click", async () => {
            console.log("Delete button clicked for user:", targetUserId);
            if (!confirm("¿ESTÁS SEGURO? Se borrará el texto del plan, los objetivos, alergias y las comidas programadas de hoy.")) return;

            try {
                const res = await fetch(`${API_URL}/nutricion/${targetUserId}/plan`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ plan: "" })
                });

                if (res.ok) {
                    console.log("Plan deleted OK on server");
                    alert("¡Eliminado con éxito! Recargando para limpiar todo...");
                    // Forzar recarga de página para limpiar cualquier residuo visual
                    window.location.reload();
                } else {
                    const error = await res.json();
                    console.error("Server error on delete:", error);
                    alert("Error: " + (error.error || "No se pudo borrar. Intenta de nuevo."));
                }
            } catch (e) {
                console.error("Network error on delete:", e);
                alert("Error de conexión al intentar borrar.");
            }
        });
    }

    btnChatSend.addEventListener("click", async () => {
        const mensaje = chatInput.value.trim();
        if (!mensaje) return;

        setLoading(true, "Ajustando plan con IA...");
        
        try {
            const res = await fetch(`${API_URL}/nutricion/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: targetUserId,
                    mensaje: mensaje,
                    plan_actual: currentPlanMarkdown
                })
            });

            const data = await res.json();
            if (res.ok) {
                renderPlan(data.plan);
                chatInput.value = "";
                if (data.meals_json) {
                    await saveMealsToTarget(data.meals_json);
                }
                alert("Plan actualizado correctamente.");
            } else {
                const errMsg = data.error || 'No se pudo actualizar el plan.';
                if (errMsg.includes('CUOTA_AGOTADA') || errMsg.includes('RATE_LIMIT') || errMsg.includes('Límite')) {
                    showAIError(errMsg);
                } else {
                    alert(errMsg);
                }
            }
        } catch (err) {
            alert("Error de conexión.");
        } finally {
            setLoading(false);
        }
    });

    // Event listeners removed for photo upload from admin side

    // ── Botón: Enviar Plan ────────────────────────────────────
    const btnSendPlan  = document.getElementById("btn-send-plan");
    const btnSendDays  = document.getElementById("btn-send-days");
    const inputDias    = document.getElementById("input-dias");
    const sendStatus   = document.getElementById("send-status");

    const sendPlan = async (dias = 1) => {
        if (!currentPlanMarkdown) {
            sendStatus.textContent = "Primero genera un plan para poder enviarlo.";
            sendStatus.style.color = "#f87171";
            return;
        }

        const plural    = dias === 1 ? "hoy" : `los próximos ${dias} días`;
        btnSendPlan.disabled = true;
        btnSendDays.disabled = true;
        sendStatus.textContent = `Enviando plan para ${plural}...`;
        sendStatus.style.color = "var(--text-tertiary)";

        try {
            const endpoint = dias === 1
                ? `${API_URL}/nutricion/${targetUserId}/enviar-dia`
                : `${API_URL}/nutricion/${targetUserId}/enviar-rango`;

            const res  = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: dias > 1 ? JSON.stringify({ dias }) : null
            });
            const data = await res.json();

            if (res.ok) {
                const msg = dias === 1
                    ? `✓ Plan enviado para hoy (${data.comidas_enviadas} comidas).`
                    : `✓ Plan enviado para ${data.dias_enviados} días (${data.total_comidas} comidas en total).`;
                sendStatus.textContent = msg;
                sendStatus.style.color = "#22c55e";
            } else {
                sendStatus.textContent = data.error || "Error al enviar el plan.";
                sendStatus.style.color = "#f87171";
            }
        } catch (e) {
            sendStatus.textContent = "Error de conexión.";
            sendStatus.style.color = "#f87171";
        } finally {
            btnSendPlan.disabled = false;
            btnSendDays.disabled = false;
            btnSendPlan.innerHTML = "📤 Enviar Plan de Hoy";
            btnSendDays.innerHTML = "📅 Enviar para los próximos";
        }
    };

    btnSendPlan.addEventListener("click", () => sendPlan(1));

    btnSendDays.addEventListener("click", () => {
        const dias = Math.min(Math.max(parseInt(inputDias.value) || 7, 1), 30);
        inputDias.value = dias;
        sendPlan(dias);
    });


    btnGenerate.addEventListener("click", async () => {
        const payload = {
            user_id: targetUserId,
            peso: inputPeso.value,
            estatura: inputEstatura.value,
            edad: inputEdad.value,
            grasa_corporal: inputGrasa.value,
            objetivo: inputObjetivo.value,
            alergias: inputAlergias.value,
            alimentos: inputAlimentos.value
        };

        if (!payload.peso || !payload.estatura) {
            alert("Ingresa peso y estatura.");
            return;
        }

        setLoading(true, "Generando plan personalizado...");

        try {
            const res = await fetch(`${API_URL}/nutricion/generar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (res.ok) {
                renderPlan(data.plan);
                sendStatus.textContent = "Plan generado. Presiona 'Enviar Plan de Hoy' para mandarlo al cliente.";
                sendStatus.style.color = "var(--text-tertiary)";
            } else {
                const errMsg = data.error || 'Error desconocido';
                if (errMsg.includes('CUOTA_AGOTADA') || errMsg.includes('RATE_LIMIT') || errMsg.includes('Límite')) {
                    showAIError(errMsg);
                } else {
                    alert('Error al generar plan: ' + errMsg);
                }
            }
        } catch (err) {
            console.error("Generate error:", err);
            alert("Error de conexión al generar el plan.");
        } finally {
            setLoading(false);
        }
    });

    function setLoading(show, text = "") {
        loadingOverlay.style.display = show ? "flex" : "none";
        if (text) loadingText.innerText = text;
        btnGenerate.disabled = show;
    }

    function renderPlan(markdown) {
        if (!markdown) return;
        currentPlanMarkdown = markdown;
        planEmpty.style.display = "none";
        planWrapper.style.display = "block";
        planResult.style.display = "block";
        planResult.innerHTML = marked.parse(markdown);
    }

    async function saveMealsToTarget(jsonStr) {
        try {
            const meals = JSON.parse(jsonStr);
            const hoy = new Date().toISOString().split('T')[0];
            
            // Primero, podríamos limpiar las comidas de hoy para re-asignar el plan nuevo
            // (Opcional, pero recomendado según la lógica del usuario)
            
            for (const meal of meals) {
                await fetch(`${API_URL}/comidas`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_id: targetUserId,
                        dia: hoy,
                        ...meal
                    })
                });
            }
        } catch (e) {
            console.error("Error saving meals:", e);
        }
    }
});
