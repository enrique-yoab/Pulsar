/**
 * PULSAR TECHNOLOGIES - Fondo Animado de Red en Canvas (Hero de index.html)
 */

document.addEventListener('DOMContentLoaded', () => {
  const heroSection = document.querySelector('.hero-section');
  let isHeroVisible = true;

  if (heroSection && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      isHeroVisible = entries[0].isIntersecting;
    }, { threshold: 0.05 });
    observer.observe(heroSection);
  }

  const isVisible = () => isHeroVisible && !document.hidden;

  initPulsarCanvas(isVisible);
  initPulsarLogoCanvas(isVisible);
});

/**
 * Fondo animado en Canvas: Red de nodos conectados (sin interacción de mouse)
 */
function initPulsarCanvas(isVisible) {
  const canvas = document.getElementById('pulsarCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let width = 0;
  let height = 0;
  let particles = [];

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    if (rect.width === width && Math.abs(rect.height - height) < 120) return;
    width = canvas.width = rect.width;
    height = canvas.height = rect.height;
    createParticles();
  }

  function createParticles() {
    particles = [];
    const maxCount = width < 768 ? 26 : 55;
    const count = Math.min(Math.floor((width * height) / 18000), maxCount);
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.55,
        vy: (Math.random() - 0.5) * 0.55,
        size: Math.random() * 2.2 + 1.2,
        pulsePhase: Math.random() * Math.PI * 2
      });
    }
  }

  window.addEventListener('resize', resize, { passive: true });

  function animate() {
    requestAnimationFrame(animate);
    if (!isVisible()) return;

    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.pulsePhase += 0.03;

      if (p.x < 0 || p.x > width) p.vx *= -1;
      if (p.y < 0 || p.y > height) p.vy *= -1;

      const alpha = 0.32 + Math.sin(p.pulsePhase) * 0.14;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(249, 115, 22, ${alpha})`;
      ctx.fill();

      for (let j = i + 1; j < particles.length; j++) {
        const p2 = particles[j];
        const dx = p.x - p2.x;
        const dy = p.y - p2.y;
        const distSq = dx * dx + dy * dy;
        const maxDist = 145;

        if (distSq < maxDist * maxDist) {
          const dist = Math.sqrt(distSq);
          const lineAlpha = (1 - dist / maxDist) * 0.22;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = `rgba(249, 115, 22, ${lineAlpha})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
  }

  resize();
  animate();
}

/**
 * Emblema Central Animado del Púlsar (Sección 1 Hero sobre PULSAR TECHNOLOGIES)
 */
function initPulsarLogoCanvas(isVisible) {
  const canvas = document.getElementById('pulsarLogoCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let width = 0;
  let height = 0;
  let cx = 0;
  let cy = 0;
  let time = 0;
  let lastTimestamp = 0;

  function resize() {
    const container = canvas.parentElement;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    width = rect.width;
    height = rect.height;

    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    cx = width / 2;
    cy = height / 2;
  }

  window.addEventListener('resize', resize, { passive: true });
  if (typeof ResizeObserver !== 'undefined' && canvas.parentElement) {
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement);
  }
  resize();

  const particleCount = window.innerWidth < 768 ? 28 : 42;
  const particles = Array.from({ length: particleCount }, () => ({
    angle: Math.random() * Math.PI * 2,
    radius: Math.random() * 175 + 32,
    speed: (Math.random() - 0.5) * 0.015,
    size: Math.random() * 2 + 0.6,
    glow: Math.random() * 0.5 + 0.5
  }));

  function drawGlowDot(x, y, radius, color, haloAlpha = 0.22) {
    ctx.beginPath();
    ctx.arc(x, y, radius * 2.4, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(249, 115, 22, ${haloAlpha})`;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function animate(timestamp = 0) {
    requestAnimationFrame(animate);
    if (!isVisible() || width <= 0 || height <= 0) {
      lastTimestamp = timestamp;
      return;
    }

    const dt = lastTimestamp ? Math.min((timestamp - lastTimestamp) / 1000, 0.05) : 0.016;
    lastTimestamp = timestamp;

    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, width, height);

    const scale = Math.min(width, height) / 480;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.globalCompositeOperation = 'source-over';

    // 1. Anillos concéntricos giratorios
    ctx.lineWidth = 1.4;
    for (let i = 1; i <= 6; i++) {
      const ringRadius = i * 34;
      ctx.save();
      ctx.rotate((time * 0.14 * (i % 2 === 0 ? 1 : -1)) / i);

      ctx.beginPath();
      ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);

      const alpha = 0.44 - i * 0.048;
      ctx.strokeStyle = `rgba(249, 115, 22, ${alpha})`;

      if (i === 3 || i === 5) {
        ctx.setLineDash([15, 20, 5, 20]);
      } else if (i === 2) {
        ctx.setLineDash([2, 8]);
      } else {
        ctx.setLineDash([]);
      }

      ctx.stroke();
      ctx.restore();
    }

    // 3. Onda senoidal dinámica (Orbitando)
    ctx.save();
    ctx.rotate(-time * 0.3);
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(234, 88, 12, 0.55)';
    ctx.lineWidth = 1.8;
    for (let a = 0; a <= Math.PI * 2.1; a += 0.05) {
      const r = 116 + Math.sin(a * 8 + time * 5) * 14;
      if (a === 0) ctx.moveTo(r * Math.cos(a), r * Math.sin(a));
      else ctx.lineTo(r * Math.cos(a), r * Math.sin(a));
    }
    ctx.stroke();
    ctx.restore();

    // 4. Eje transversal (Frecuencia cardiaca / Señal de radio)
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = '#F97316';
    ctx.lineWidth = 2.6;

    const pulseWidth = 225;
    for (let x = -pulseWidth; x <= pulseWidth; x += 4) {
      const envelope = Math.exp(-Math.pow(x / 95, 2));
      let y = Math.sin(x * 0.15 - time * 8) * 38 * envelope;
      y += Math.sin(x * 0.8 + time * 12) * 14 * envelope;

      if (x === -pulseWidth) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    // 5. Rayos de luz / Destellos saliendo del centro
    ctx.save();
    ctx.rotate(time * 0.12);
    for (let i = 0; i < 12; i++) {
      ctx.rotate(Math.PI / 6);
      ctx.beginPath();
      ctx.moveTo(0, 10);

      const rayLength = i % 3 === 0 ? 175 : 90;
      ctx.lineTo(0, rayLength);

      const rayGrad = ctx.createLinearGradient(0, 0, 0, rayLength);
      const alpha = i % 3 === 0 ? 0.38 : 0.14;
      rayGrad.addColorStop(0, `rgba(249, 115, 22, ${alpha})`);
      rayGrad.addColorStop(1, 'rgba(249, 115, 22, 0)');

      ctx.strokeStyle = rayGrad;
      ctx.lineWidth = i % 3 === 0 ? 2.2 : 1;
      ctx.stroke();
    }
    ctx.restore();

    // 6. Nodos flotantes y conexiones de datos
    const coords = [];
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.angle += p.speed * (dt * 60);
      const px = Math.cos(p.angle) * p.radius;
      const py = Math.sin(p.angle) * p.radius;
      coords.push({ x: px, y: py, size: p.size, glow: p.glow });
    }

    ctx.lineWidth = 0.9;
    for (let i = 0; i < coords.length; i++) {
      const a = coords[i];
      for (let j = i + 1; j < coords.length; j++) {
        const b = coords[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 62) {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(249, 115, 22, ${(1 - dist / 62) * 0.38})`;
          ctx.stroke();
        }
      }
      drawGlowDot(a.x, a.y, a.size, `rgba(234, 88, 12, ${a.glow})`, a.glow * 0.24);
    }

    // 7. Núcleo brillante del púlsar
    const pulseCore = 1 + Math.sin(time * 4) * 0.12;
    const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 36 * pulseCore);
    coreGrad.addColorStop(0, 'rgba(249, 115, 22, 0.95)');
    coreGrad.addColorStop(0.32, 'rgba(251, 146, 60, 0.55)');
    coreGrad.addColorStop(0.65, 'rgba(249, 115, 22, 0.18)');
    coreGrad.addColorStop(1, 'rgba(249, 115, 22, 0)');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 36 * pulseCore, 0, Math.PI * 2);
    ctx.fill();

    drawGlowDot(0, 0, 6.5 * pulseCore, '#EA580C', 0.38);

    ctx.restore();

    time += dt;
  }

  requestAnimationFrame(animate);
}
