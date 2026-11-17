/**
 * PULSAR TECHNOLOGIES - Carrusel Interactivo de Identidad (index.html)
 * Permanece fijo al seleccionar un concepto y activa giro automático tras 2 min de inactividad.
 */

document.addEventListener('DOMContentLoaded', () => {
  initIdentityCarousel();
});

function initIdentityCarousel() {
  const carousel = document.getElementById('identityCarousel');
  const stage = document.getElementById('carouselStage');
  if (!carousel || !stage) return;

  const slides = Array.from(stage.querySelectorAll('.carousel-slide'));
  const pills = Array.from(document.querySelectorAll('#carouselPills .pill-btn'));
  const dots = Array.from(document.querySelectorAll('#carouselDots .dot'));

  const prevArrow = document.getElementById('carouselPrevArrow');
  const nextArrow = document.getElementById('carouselNextArrow');
  const prevBtn = document.getElementById('prevCarouselBtn');
  const nextBtn = document.getElementById('nextCarouselBtn');

  const total = slides.length;
  if (total === 0) return;

  let currentIndex = 0;
  let autoPlayTimer = null;
  let inactivityTimer = null;

  // Tiempo de inactividad antes de activar el giro automático: 2 minutos (120,000 ms)
  const INACTIVITY_DELAY_MS = 120000;
  // Intervalo pausado entre diapositivas cuando el giro automático está activo: 10 segundos
  const AUTO_ADVANCE_MS = 10000;

  function updateCarousel(index) {
    currentIndex = ((index % total) + total) % total;
    const prevIndex = (currentIndex - 1 + total) % total;
    const nextIndex = (currentIndex + 1) % total;

    slides.forEach((slide, idx) => {
      slide.classList.remove('is-active', 'is-prev', 'is-next');
      if (idx === currentIndex) {
        slide.classList.add('is-active');
      } else if (idx === prevIndex) {
        slide.classList.add('is-prev');
      } else if (idx === nextIndex) {
        slide.classList.add('is-next');
      }
    });

    pills.forEach((pill, idx) => {
      const isActive = idx === currentIndex;
      pill.classList.toggle('active', isActive);
      pill.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    dots.forEach((dot, idx) => {
      dot.classList.toggle('active', idx === currentIndex);
    });
  }

  function stopAutoPlay() {
    if (autoPlayTimer) {
      clearInterval(autoPlayTimer);
      autoPlayTimer = null;
    }
  }

  function startAutoPlay() {
    stopAutoPlay();
    autoPlayTimer = setInterval(() => {
      updateCarousel(currentIndex + 1);
    }, AUTO_ADVANCE_MS);
  }

  // Al interactuar, se detiene el giro y se queda fijo; sólo reactiva tras 2 minutos sin tocarlo
  function registerUserInteraction() {
    stopAutoPlay();
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
    }
    inactivityTimer = setTimeout(() => {
      startAutoPlay();
    }, INACTIVITY_DELAY_MS);
  }

  // Selección por píldoras superiores
  pills.forEach((pill) => {
    pill.addEventListener('click', () => {
      const idx = parseInt(pill.getAttribute('data-index'), 10);
      updateCarousel(idx);
      registerUserInteraction();
    });
  });

  // Selección por puntos inferiores
  dots.forEach((dot) => {
    dot.addEventListener('click', () => {
      const idx = parseInt(dot.getAttribute('data-index'), 10);
      updateCarousel(idx);
      registerUserInteraction();
    });
  });

  // Clic en tarjetas laterales (previa / siguiente)
  slides.forEach((slide, idx) => {
    slide.addEventListener('click', () => {
      if (idx !== currentIndex) {
        updateCarousel(idx);
        registerUserInteraction();
      }
    });
  });

  // Botones Anterior / Siguiente
  if (prevArrow) {
    prevArrow.addEventListener('click', () => {
      updateCarousel(currentIndex - 1);
      registerUserInteraction();
    });
  }

  if (nextArrow) {
    nextArrow.addEventListener('click', () => {
      updateCarousel(currentIndex + 1);
      registerUserInteraction();
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      updateCarousel(currentIndex - 1);
      registerUserInteraction();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      updateCarousel(currentIndex + 1);
      registerUserInteraction();
    });
  }

  // Soporte táctil (Swipe en móviles)
  let touchStartX = 0;
  stage.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
    registerUserInteraction();
  }, { passive: true });

  stage.addEventListener('touchend', (e) => {
    const touchEndX = e.changedTouches[0].screenX;
    const diff = touchStartX - touchEndX;
    if (Math.abs(diff) > 45) {
      if (diff > 0) {
        updateCarousel(currentIndex + 1);
      } else {
        updateCarousel(currentIndex - 1);
      }
      registerUserInteraction();
    }
  }, { passive: true });

  // Inicializar estado y programar temporizador de 2 minutos de inactividad
  updateCarousel(0);
  registerUserInteraction();
}
