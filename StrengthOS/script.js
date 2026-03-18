document.addEventListener("DOMContentLoaded", () => {
    // 0. Redirigir si ya hay sesión (Evita que el usuario logueado caiga en el index)
    const userDataStr = sessionStorage.getItem("strengthos_user");
    if (userDataStr && window.location.pathname.endsWith("index.html") || window.location.pathname === "/") {
        const userData = JSON.parse(userDataStr);
        if (userData.es_admin) {
            window.location.href = "admin.html";
        } else {
            window.location.href = "dashboard.html";
        }
    }

    // Navbar Sticky
    const navbar = document.getElementById("navbar");
    window.addEventListener("scroll", () => {
        if (window.scrollY > 50) {
            navbar.classList.add("scrolled");
        } else {
            navbar.classList.remove("scrolled");
        }
    });

    // Mobile Menu
    const menuToggle = document.querySelector(".mobile-menu-toggle");
    const navLinks = document.querySelector(".nav-links");

    menuToggle.addEventListener("click", () => {
        if (navLinks.style.display === "flex") {
            navLinks.style.display = "none";
        } else {
            navLinks.style.display = "flex";
            navLinks.style.flexDirection = "column";
            navLinks.style.position = "absolute";
            navLinks.style.top = "100%";
            navLinks.style.left = "0";
            navLinks.style.width = "100%";
            navLinks.style.background = "rgba(0,0,0,0.95)";
            navLinks.style.padding = "20px";
            navLinks.style.textAlign = "center";
        }
    });

    // Partículas Background
    const particlesContainer = document.getElementById("particles");
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

    // Intersection Observer para Animaciones de Scroll
    const observerOptions = {
        threshold: 0.1,
        rootMargin: "0px 0px -50px 0px"
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                setTimeout(() => {
                    entry.target.classList.add("animate-in");
                }, index * 100);
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    const animatedElements = document.querySelectorAll(".animated-element");
    animatedElements.forEach(el => observer.observe(el));

    // Contador Animado
    const counters = document.querySelectorAll(".proof-number");
    const counterObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const target = entry.target;
                const finalValue = parseInt(target.innerText.replace(/\D/g, ''));
                const hasPlus = target.innerText.includes('+');
                const hasPercent = target.innerText.includes('%');
                const hasK = target.innerText.includes('K');

                let current = 0;
                const duration = 2000;
                const increment = finalValue / (duration / 16);

                const timer = setInterval(() => {
                    current += increment;
                    if (current >= finalValue) {
                        target.innerText = finalValue + (hasK ? 'K+' : (hasPlus ? '+' : (hasPercent ? '%' : '')));
                        clearInterval(timer);
                    } else {
                        target.innerText = Math.round(current) + (hasK ? 'K+' : (hasPlus ? '+' : (hasPercent ? '%' : '')));
                    }
                }, 16);

                counterObserver.unobserve(target);
            }
        });
    });

    counters.forEach(counter => counterObserver.observe(counter));

    // Smooth Scroll
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth'
                });
                if (window.innerWidth <= 768 && navLinks.style.display === "flex") {
                    navLinks.style.display = "none";
                }
            }
        });
    });

    // Flip Card Click Mobile Support
    const flipCards = document.querySelectorAll(".service-card-flip");
    flipCards.forEach(card => {
        card.addEventListener("click", () => {
            if (window.innerWidth <= 1024) {
                card.classList.toggle("flipped");
            }
        });
    });

    // Formulario de Login (Conectado a la Base de Datos Local)
    const loginForm = document.querySelector(".login-form");
    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const btn = loginForm.querySelector("button");
            const inputs = loginForm.querySelectorAll("input");
            const userId = inputs[0].value;
            const password = inputs[1].value;

            const originalText = btn.innerText;
            btn.innerText = "Verificando...";
            btn.style.opacity = "0.7";

            const API_URL = window.location.protocol === 'file:' ? 'http://127.0.0.1:5000/api' : '/api';
            try {
                // Hacemos una petición al servidor Flask
                const response = await fetch(`${API_URL}/login`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        user_id: userId,
                        contrasena: password
                    })
                });

                const data = await response.json();

                if (response.ok) {
                    // Guardar sesión para ambos (Admin y Cliente)
                    localStorage.setItem("strengthos_user", JSON.stringify(data.cliente));
                    sessionStorage.setItem("strengthos_user", JSON.stringify(data.cliente));

                    if (data.cliente.es_admin) {
                        alert(`¡Bienvenido/a de nuevo, Entrenador! Ingresando al panel de control...`);
                        window.location.href = "admin.html";
                    } else {
                        alert(`¡Bienvenido/a de nuevo, ${data.cliente.nombre}!`);
                        window.location.href = "dashboard.html";
                    }
                } else {
                    alert(data.error || "Error al iniciar sesión. Intenta de nuevo.");
                }
            } catch (error) {
                console.error("Error conectando con la base de datos:", error);
                alert("Error de conexión. Asegúrate de que el servidor (app.py) esté encendido.");
            } finally {
                btn.innerText = originalText;
                btn.style.opacity = "1";
            }
        });
    }

    // Calculadora 1RM (Fórmula de Epley)
    const epleyForm = document.getElementById("epley-form");
    if (epleyForm) {
        epleyForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const weight = parseFloat(document.getElementById("calc-weight").value);
            const reps = parseInt(document.getElementById("calc-reps").value);
            const unit = document.getElementById("calc-unit").value;

            if (weight > 0 && reps > 0) {
                // Fórmula de Epley: 1RM = Peso * (1 + 0.0333 * Repeticiones)
                const rm = weight * (1 + 0.0333 * reps);

                // Mostrar resultado animado
                const resultDiv = document.getElementById("calc-result");
                const rmValue = document.getElementById("rm-value");

                resultDiv.style.display = "block";

                // Pequeña animación para mostrar el número
                rmValue.innerText = "--";
                setTimeout(() => {
                    rmValue.innerText = rm.toFixed(1) + " " + unit;
                }, 300);
            }
        });
    }

});
