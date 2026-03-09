// admin.js — Lista de clientes del panel admin

document.addEventListener("DOMContentLoaded", () => {
    const API_URL = window.location.protocol === 'file:' ? 'http://127.0.0.1:5000/api' : '/api';
    const clientsList = document.getElementById("clients-list");
    const form = document.getElementById("create-client-form");

    // ── Cargar y mostrar clientes ──────────────────────────────
    const fetchClients = async () => {
        try {
            const response = await fetch(`${API_URL}/clientes`);
            const clientes = await response.json();

            clientsList.innerHTML = "";

            if (clientes.length === 0) {
                clientsList.innerHTML = `<p style="color:var(--text-tertiary);font-size:0.9rem;padding:20px 0;">No hay clientes registrados aún.</p>`;
                return;
            }

            clientes.forEach(cliente => {
                const card = document.createElement("div");
                card.className = "client-card";

                // Iniciales del avatar
                const initials = cliente.nombre.trim().split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
                const encodedNombre = encodeURIComponent(cliente.nombre);

                if (cliente.user_id === 'admin') {
                    card.innerHTML = `
                        <div class="client-card-info">
                            <div class="client-avatar">👑</div>
                            <div>
                                <div class="client-name">${cliente.nombre}</div>
                                <div class="client-id">Administrador</div>
                            </div>
                        </div>
                        <span class="admin-badge">Súper Admin</span>
                    `;
                } else {
                    card.innerHTML = `
                        <div class="client-card-info">
                            <div class="client-avatar">${initials}</div>
                            <div>
                                <div class="client-name">${cliente.nombre}</div>
                                <div class="client-id">#${cliente.user_id}</div>
                            </div>
                        </div>
                        <div class="client-actions">
                            <a href="admin-routines.html?user_id=${cliente.user_id}&nombre=${encodedNombre}"
                               class="action-icon-btn" title="Rutinas">📅</a>
                            <a href="admin-progress.html?user_id=${cliente.user_id}&nombre=${encodedNombre}"
                               class="action-icon-btn" title="Progreso">📈</a>
                            <button class="action-icon-btn" title="Cambiar contraseña"
                                onclick="changePassword('${cliente.user_id}', '${cliente.nombre}')">🔑</button>
                            <button class="action-icon-btn danger" title="Eliminar cliente"
                                onclick="deleteClient('${cliente.user_id}', '${cliente.nombre}')">🗑</button>
                        </div>
                    `;
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

    fetchClients();
});
