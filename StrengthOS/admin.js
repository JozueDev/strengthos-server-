// admin.js — Lista de clientes del panel admin

document.addEventListener("DOMContentLoaded", () => {
    const API_URL = window.location.protocol === 'file:' ? 'http://127.0.0.1:5000/api' : '/api';
    const clientsList = document.getElementById("clients-list");
    const form = document.getElementById("create-client-form");

    // ── Cargar y mostrar clientes ──────────────────────────────
    const fetchClients = async () => {
        try {
            const response = await fetch(`${API_URL}/clientes?t=${new Date().getTime()}`);
            const clientes = await response.json();

            clientsList.innerHTML = "";

            if (clientes.length === 0) {
                clientsList.innerHTML = `<p style="color:var(--text-tertiary);font-size:0.9rem;padding:20px 0;">No hay clientes registrados aún.</p>`;
                return;
            }

            clientes.forEach(cliente => {
                const card = document.createElement("div");
                card.className = "client-card";

                const initials = cliente.nombre.trim().split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
                const encodedNombre = encodeURIComponent(cliente.nombre);
                let profileLoaded = false;

                if (cliente.user_id === 'admin') {
                    card.innerHTML = `
                        <div class="client-card-top">
                            <div class="client-card-left">
                                <div class="client-avatar">👑</div>
                                <div>
                                    <div class="client-name">${cliente.nombre}</div>
                                    <div class="client-id">Administrador</div>
                                </div>
                            </div>
                            <span class="admin-badge">Súper Admin</span>
                        </div>
                    `;
                } else {
                    card.innerHTML = `
                        <div class="client-card-top">
                            <div class="client-card-left">
                                <div class="client-avatar">${initials}</div>
                                <div style="min-width:0;">
                                    <div class="client-name">${cliente.nombre}</div>
                                    <div class="client-id">#${cliente.user_id}</div>
                                </div>
                            </div>
                            <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
                                <div class="client-actions">
                                    <a href="admin-routines.html?user_id=${cliente.user_id}&nombre=${encodedNombre}"
                                       class="action-icon-btn" title="Rutinas">📅</a>
                                    <a href="admin-nutrition.html?user_id=${cliente.user_id}&nombre=${encodedNombre}"
                                       class="action-icon-btn" title="Plan Alimenticio">🥗</a>
                                    <a href="admin-progress.html?user_id=${cliente.user_id}&nombre=${encodedNombre}"
                                       class="action-icon-btn" title="Progreso">📈</a>
                                    <button class="action-icon-btn" title="Cambiar contraseña"
                                        onclick="changePassword('${cliente.user_id}', '${cliente.nombre}')">🔑</button>
                                    <button class="action-icon-btn danger" title="Eliminar cliente"
                                        onclick="deleteClient('${cliente.user_id}', '${cliente.nombre}')">🗑</button>
                                </div>
                                <button class="btn-expand" title="Ver perfil" data-uid="${cliente.user_id}">▼</button>
                            </div>
                        </div>
                        <div class="client-profile-panel">
                            <div class="profile-stats">
                                <div class="profile-stat">
                                    <div class="profile-stat-value" data-field="edad">--</div>
                                    <div class="profile-stat-label">Edad</div>
                                </div>
                                <div class="profile-stat">
                                    <div class="profile-stat-value" data-field="peso">--</div>
                                    <div class="profile-stat-label">Peso (kg)</div>
                                </div>
                                <div class="profile-stat">
                                    <div class="profile-stat-value" data-field="estatura">--</div>
                                    <div class="profile-stat-label">Estatura (cm)</div>
                                </div>
                            </div>
                            <div class="profile-meta" data-field="fecha">
                                <span style="opacity:0.5;">Cargando...</span>
                            </div>
                        </div>
                    `;

                    // Toggle expandir + carga lazy de perfil
                    const expandBtn = card.querySelector('.btn-expand');
                    expandBtn.addEventListener('click', async () => {
                        const isExpanded = card.classList.toggle('expanded');

                        if (isExpanded && !profileLoaded) {
                            profileLoaded = true;
                            try {
                                const res = await fetch(`${API_URL}/cliente/${cliente.user_id}/perfil?t=${new Date().getTime()}`);
                                if (res.ok) {
                                    const perfil = await res.json();
                                    card.querySelector('[data-field="edad"]').innerText = perfil.edad && perfil.edad !== '--' ? perfil.edad : '--';
                                    card.querySelector('[data-field="peso"]').innerText = perfil.peso && perfil.peso !== '--' ? perfil.peso : '--';
                                    card.querySelector('[data-field="estatura"]').innerText = perfil.estatura && perfil.estatura !== '--' ? perfil.estatura : '--';

                                    let fechaStr = '';
                                    if (perfil.fecha_registro) {
                                        const d = new Date(perfil.fecha_registro);
                                        fechaStr = `Registrado el ${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}`;
                                    }
                                    card.querySelector('[data-field="fecha"]').innerHTML = `<span style="opacity:0.6;">${fechaStr || 'Sin fecha de registro'}</span>`;
                                }
                            } catch (e) {
                                card.querySelector('[data-field="fecha"]').innerHTML = `<span style="color:#ef4444;opacity:0.7;">Error al cargar perfil</span>`;
                            }
                        }
                    });
                }

                clientsList.appendChild(card);
            });
        } catch (error) {
            clientsList.innerHTML = `<p style="color:#ef4444;font-size:0.9rem;padding:20px 0;">Error de conexión. Asegúrate de que app.py esté ejecutándose.</p>`;
        }
    };


    // ── Eliminar cliente ─────────────────────────────────────
    window.deleteClient = async (user_id, nombre) => {
        if (!confirm(`¿Estás seguro que deseas eliminar a ${nombre}? Esta acción no se puede deshacer.`)) return;

        const adminUser = prompt("Para confirmar, ingresa tu Usuario de Administrador:");
        if (!adminUser) return;
        const adminPass = prompt("Ingresa tu Contraseña de Administrador:");
        if (!adminPass) return;

        try {
            const response = await fetch(`${API_URL}/clientes/${user_id}`, {
                method: 'DELETE',
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ admin_user: adminUser, admin_pass: adminPass })
            });
            const data = await response.json();
            if (response.ok) {
                alert(`${nombre} eliminado correctamente.`);
                fetchClients();
            } else {
                alert(data.error || "Hubo un error al intentar eliminar.");
            }
        } catch (error) {
            alert("Error de conexión...");
        }
    };

    // ── Cambiar contraseña ───────────────────────────────────
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
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id, nueva_contrasena: nuevaClave, admin_user: adminUser, admin_pass: adminPass })
            });
            const data = await response.json();
            if (response.ok) {
                alert(`Contraseña de ${nombre} actualizada exitosamente.`);
            } else {
                alert(data.error || "Hubo un error al intentar cambiar la contraseña.");
            }
        } catch (error) {
            alert("Error de conexión.");
        }
    };

    // ── Crear nuevo cliente ──────────────────────────────────
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
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ nombre, contrasena })
            });
            const data = await response.json();
            if (response.ok) {
                alert(`¡Éxito! ${nombre} creado con ID: #${data.user_id}`);
                form.reset();
                fetchClients();
            } else {
                alert(data.error || "Ocurrió un error al crear al cliente.");
            }
        } catch (error) {
            alert("Error de red. Verifica que el servidor Flask esté encendido.");
        } finally {
            btn.innerText = originalText;
            btn.style.opacity = "1";
        }
    });

    // ── Cerrar Sesión Admin ──────────────────────────────────
    const logout = () => {
        localStorage.removeItem("strengthos_user");
        sessionStorage.removeItem("strengthos_user");
        window.location.href = "index.html";
    };

    document.getElementById("admin-logout-btn")?.addEventListener("click", logout);
    document.getElementById("logout-btn")?.addEventListener("click", logout);

    fetchClients();
});
