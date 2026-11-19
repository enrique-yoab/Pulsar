/**
 * PULSAR TECHNOLOGIES - Control de Ventana Flotante de Inicio de Sesión (Global)
 */

document.addEventListener('DOMContentLoaded', () => {
  initLoginModal();
});

function initLoginModal() {
  const modal = document.getElementById('loginModal');
  if (!modal) return;

  const closeBtn = document.getElementById('closeLoginModal');
  const form = document.getElementById('loginForm');
  const userInput = document.getElementById('loginUsername');
  const passInput = document.getElementById('loginPassword');
  const togglePassBtn = document.getElementById('togglePasswordBtn');
  const feedbackBox = document.getElementById('loginFeedback');
  const navMenu = document.getElementById('navMenu');
  const menuToggle = document.getElementById('menuToggle');

  // Abrir ventana flotante desde cualquier botón de Iniciar Sesión
  const openTriggers = document.querySelectorAll('[data-open-login], a[href="#login"]');
  openTriggers.forEach((trigger) => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();

      // Cerrar menú móvil si estuviera abierto
      if (navMenu && navMenu.classList.contains('active')) {
        navMenu.classList.remove('active');
        if (menuToggle) menuToggle.setAttribute('aria-expanded', 'false');
      }

      clearFeedback();
      modal.showModal();
      if (userInput) {
        setTimeout(() => userInput.focus(), 60);
      }
    });
  });

  // Cerrar con el botón X
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.close();
    });
  }

  // Cerrar al hacer clic fuera de la tarjeta (en el backdrop)
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.close();
    }
  });

  // Limpiar estado visual al cerrar
  modal.addEventListener('close', () => {
    clearFeedback();
    if (form) form.reset();
    if (passInput) passInput.type = 'password';
    if (togglePassBtn) togglePassBtn.setAttribute('aria-pressed', 'false');
  });

  // Mostrar / ocultar contraseña
  if (togglePassBtn && passInput) {
    togglePassBtn.addEventListener('click', () => {
      const isHidden = passInput.type === 'password';
      passInput.type = isHidden ? 'text' : 'password';
      togglePassBtn.setAttribute('aria-pressed', isHidden ? 'true' : 'false');
      togglePassBtn.setAttribute(
        'aria-label',
        isHidden ? 'Ocultar contraseña' : 'Mostrar contraseña'
      );
    });
  }

  // Validación y envío preliminar del formulario
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const usuario = userInput ? userInput.value.trim() : '';
      const password = passInput ? passInput.value : '';

      if (!usuario || !password) {
        showFeedback(
          'Por favor ingresa el usuario y la contraseña asignados a tu empresa.',
          'is-error'
        );
        return;
      }

      const submitBtn = form.querySelector('button[type="submit"]');
      const originalText = submitBtn ? submitBtn.textContent : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Verificando acceso...';
      }

      // Simulación de validación previa hasta conectar con el backend FastAPI
      setTimeout(() => {
        showFeedback(
          `Credenciales listas para "${usuario}". El inicio de sesión se habilitará al conectar el servidor SGS-Pulsar.`,
          'is-info'
        );
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        }
      }, 450);
    });
  }

  function showFeedback(message, typeClass) {
    if (!feedbackBox) return;
    feedbackBox.textContent = message;
    feedbackBox.className = `login-feedback ${typeClass}`;
  }

  function clearFeedback() {
    if (!feedbackBox) return;
    feedbackBox.textContent = '';
    feedbackBox.className = 'login-feedback';
  }
}
