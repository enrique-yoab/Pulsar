/**
 * PULSAR TECHNOLOGIES - Cotizador de 4 Pasos conectado a API Python + SQLite
 * Paso 1: Necesidades (Proteger Red/Internet, Cámaras, Página Web)
 * Paso 2: Botones de nivel (Básico, Regular, Técnico, Profesional)
 * Paso 3: Catálogo desde GET /api/dispositivos + precios unitarios reales
 * Paso 4: Recálculo en POST /api/cotizaciones/calcular + envío en POST /api/cotizaciones
 */

const TIER_KEYS = ['basico', 'regular', 'tecnico', 'profesional'];

const TIER_LABELS = {
  basico: 'Básico',
  regular: 'Regular',
  tecnico: 'Técnico',
  profesional: 'Profesional'
};

const ROUTER_CAPACITY = {
  basico: { minPorts: 4, maxPorts: 4, label: '4 puertos' },
  regular: { minPorts: 5, maxPorts: 7, label: '5–7 puertos' },
  tecnico: { minPorts: 8, maxPorts: 8, label: '8 puertos' },
  profesional: { minPorts: 16, maxPorts: 16, label: '16 puertos' }
};

const FIREWALL_CAPACITY = {
  basico: { maxPorts: 4, label: '4 puertos' },
  regular: { maxPorts: 4, label: '4 puertos' },
  tecnico: { maxPorts: 6, label: '6 puertos' },
  profesional: { maxPorts: 8, label: '8 puertos' }
};

const SERVER_TYPE_LABELS = {
  nvr: 'NVR Dedicado',
  torre: 'Servidor Torre',
  rack: 'Servidor Rack'
};

document.addEventListener('DOMContentLoaded', () => {
  initFourStepCotizador();
});

function formatMXN(value) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2
  }).format(Number(value) || 0);
}

function normalizeApiProduct(row) {
  return {
    id_producto: row.id_producto,
    category: row.categoria,
    categoria_nombre: row.categoria_nombre,
    tier: row.nivel,
    subType: row.subtipo || null,
    lanPorts: Number(row.puertos || 0),
    ports: Number(row.puertos || 0),
    poePorts: Number(row.puertos_poe || 0),
    brand: row.marca,
    modelo: row.modelo,
    name: row.nombre,
    specs: row.especificaciones_tecnicas,
    precio: Number(row.precio || 0)
  };
}

function initFourStepCotizador() {
  const panels = {
    1: document.getElementById('quoteStep1Panel'),
    2: document.getElementById('quoteStep2Panel'),
    3: document.getElementById('quoteStep3Panel'),
    4: document.getElementById('quoteStep4Panel')
  };

  const steppers = {
    1: document.getElementById('stepperStep1'),
    2: document.getElementById('stepperStep2'),
    3: document.getElementById('stepperStep3'),
    4: document.getElementById('stepperStep4')
  };

  const step1Form = document.getElementById('quoteStep1Form');
  const step2Form = document.getElementById('quoteStep2Form');
  const step3Form = document.getElementById('quoteStep3Form');
  const step4Form = document.getElementById('quoteStep4Form');

  if (!step1Form || !step2Form || !step3Form || !step4Form) return;

  let activeCatalog = [];
  let resolvedApiBase = ''; // '' usa mismo origen (/api/...) mediante Proxy Apache

  let maxUnlockedStep = 1;
  let currentFilterQuery = null;
  let categoryFilterOverrides = {};
  let selectedDevices = {};
  let lastServerCalculation = null;

  // Referencias Paso 1
  const areaCheckboxes = Array.from(step1Form.querySelectorAll('.quick-option-input'));
  const statusText = document.getElementById('selectionStatusText');
  const step1Feedback = document.getElementById('step1Feedback');
  const step1ContinueBtn = document.getElementById('step1ContinueBtn');

  // Referencias Paso 2
  const step2NetworkBlock = document.getElementById('step2NetworkBlock');
  const step2CamerasBlock = document.getElementById('step2CamerasBlock');
  const step2ServerBlock = document.getElementById('step2ServerBlock');
  const step2WebBlock = document.getElementById('step2WebBlock');
  const step2Subtitle = document.getElementById('step2Subtitle');

  const firewallTierBox = document.getElementById('firewallTierBox');
  const camInternasInput = document.getElementById('camInternas');
  const camExternasInput = document.getElementById('camExternas');
  const camerasPortSummary = document.getElementById('camerasPortSummary');
  const apConfigBox = document.getElementById('apConfigBox');
  const apCountInput = document.getElementById('apCount');
  const hostingTierBox = document.getElementById('hostingTierBox');

  const step2SummaryText = document.getElementById('step2SummaryText');
  const step2Feedback = document.getElementById('step2Feedback');
  const backToStep1Btn = document.getElementById('backToStep1Btn');

  // Referencias Paso 3
  const step3FilterChips = document.getElementById('step3FilterChips');
  const step3CatalogGroups = document.getElementById('step3CatalogGroups');
  const step3Feedback = document.getElementById('step3Feedback');
  const step3ContinueBtn = document.getElementById('step3ContinueBtn');
  const backToStep2Btn = document.getElementById('backToStep2Btn');

  // Referencias Paso 4
  const step4FormWrap = document.getElementById('step4FormWrap');
  const step4FinalRecapList = document.getElementById('step4FinalRecapList');
  const step4TotalAmount = document.getElementById('step4TotalAmount');
  const step4Feedback = document.getElementById('step4Feedback');
  const step4SubmitBtn = document.getElementById('step4SubmitBtn');
  const backToStep3Btn = document.getElementById('backToStep3Btn');
  const editFromStep4Btn = document.getElementById('editFromStep4Btn');
  const step4SuccessPanel = document.getElementById('step4SuccessPanel');
  const successFolioBadge = document.getElementById('successFolioBadge');
  const successMessageText = document.getElementById('successMessageText');
  const startNewQuoteBtn = document.getElementById('startNewQuoteBtn');

  // =========================================================================
  // COMUNICACIÓN HTTP CON LA API EN PYTHON + SQLITE
  // =========================================================================
  async function fetchApiJson(path, options = {}) {
    const candidates = [resolvedApiBase];
    const isLocalHost =
      window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (resolvedApiBase === '' && isLocalHost && window.location.port !== '8000') {
      candidates.push('http://127.0.0.1:8000');
    }

    let lastError = null;
    for (const base of candidates) {
      try {
        const res = await fetch(`${base}${path}`, {
          headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
          ...options
        });
        const data = await res.json();
        if (res.ok || data.error) {
          resolvedApiBase = base;
          return { status: res.status, ok: res.ok, data };
        }
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error('No se pudo conectar con la API de Python.');
  }

  async function loadCatalogFromApi() {
    if (step1ContinueBtn) step1ContinueBtn.disabled = true;
    try {
      const { ok, data } = await fetchApiJson('/api/dispositivos', { method: 'GET' });
      if (!ok || !data || !Array.isArray(data.dispositivos) || data.dispositivos.length === 0) {
        throw new Error((data && data.error) || 'No hay productos disponibles en el catálogo.');
      }
      activeCatalog = data.dispositivos.map(normalizeApiProduct);
      if (step1ContinueBtn) step1ContinueBtn.disabled = false;
    } catch (err) {
      activeCatalog = [];
      if (step1Feedback) {
        step1Feedback.textContent = err.message || 'No se pudo cargar el catálogo de productos desde el servidor.';
        step1Feedback.className = 'step-feedback is-error';
      }
    }
  }

  loadCatalogFromApi();

  // =========================================================================
  // UTILIDADES
  // =========================================================================
  function getStep1Selection() {
    const selected = { red: false, camaras: false, web: false };
    areaCheckboxes.forEach((cb) => {
      if (cb.checked && cb.value in selected) selected[cb.value] = true;
    });
    return selected;
  }

  function getRadio(form, name) {
    const input = form.querySelector(`input[name="${name}"]:checked`);
    return input ? input.value : '';
  }

  function clampInt(raw, min, max, fallback = 0) {
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  }

  function clearFeedback(box) {
    if (!box) return;
    box.textContent = '';
    box.className = 'step-feedback';
  }

  function syncButtonsVisual(form) {
    form.querySelectorAll('.tier-input').forEach((inp) => {
      const btn = inp.closest('.tier-btn');
      if (btn) btn.classList.toggle('is-selected', inp.checked);
    });
    form.querySelectorAll('.yesno-input').forEach((inp) => {
      const btn = inp.closest('.yesno-btn');
      if (btn) btn.classList.toggle('is-selected', inp.checked);
    });
    form.querySelectorAll('.choice-input').forEach((inp) => {
      const card = inp.closest('.choice-card');
      if (card) card.classList.toggle('is-selected', inp.checked);
    });
  }

  function goToStep(stepNumber) {
    if (stepNumber > maxUnlockedStep) {
      maxUnlockedStep = stepNumber;
    }

    [1, 2, 3, 4].forEach((n) => {
      if (panels[n]) panels[n].hidden = n !== stepNumber;
      if (steppers[n]) {
        steppers[n].disabled = n > maxUnlockedStep;
        steppers[n].classList.toggle('is-active', n === stepNumber);
        steppers[n].classList.toggle('is-done', n < stepNumber);
      }
    });

    const target = document.querySelector('.quote-stepper') || panels[stepNumber];
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  Object.values(steppers).forEach((btn) => {
    if (!btn) return;
    btn.addEventListener('click', () => {
      const targetStep = parseInt(btn.dataset.step, 10);
      if (targetStep <= maxUnlockedStep) {
        if (targetStep === 3 && currentFilterQuery) renderStep3();
        if (targetStep === 4) renderStep4Recap();
        goToStep(targetStep);
      }
    });
  });

  // =========================================================================
  // PASO 1
  // =========================================================================
  function syncStep1UI() {
    areaCheckboxes.forEach((cb) => {
      const card = cb.closest('.quick-option-card');
      if (card) card.classList.toggle('is-selected', cb.checked);
    });

    const { red, camaras, web } = getStep1Selection();
    const labels = [];
    if (red) labels.push('Protección de Red / Internet');
    if (camaras) labels.push('Cámaras de Seguridad');
    if (web) labels.push('Página Web');

    if (statusText) {
      if (labels.length === 0) {
        statusText.innerHTML = 'Selecciona al menos una opción para continuar.';
      } else if (red && !camaras && !web) {
        statusText.innerHTML = 'Tu selección: <strong>Solo proteger tu red o internet</strong> (en el Paso 2 elegirás niveles para Router, Firewall y Access Points).';
      } else {
        statusText.innerHTML = `Tu selección: <strong>${labels.join(' + ')}</strong>.`;
      }
    }
  }

  areaCheckboxes.forEach((cb) => {
    cb.addEventListener('change', () => {
      clearFeedback(step1Feedback);
      syncStep1UI();
    });
  });

  step1Form.addEventListener('submit', (e) => {
    e.preventDefault();
    const selection = getStep1Selection();

    if (!selection.red && !selection.camaras && !selection.web) {
      step1Feedback.textContent = 'Por favor selecciona al menos una opción para continuar.';
      step1Feedback.className = 'step-feedback is-error';
      return;
    }

    try {
      sessionStorage.setItem('pulsar_quote_step1', JSON.stringify(selection));
    } catch (_) {
      // Ignorar
    }

    clearFeedback(step1Feedback);
    configureStep2(selection);
    goToStep(2);
  });

  // =========================================================================
  // PASO 2: BOTONES DE NIVEL / FILTROS PARA CONSULTA AL BACK-END
  // =========================================================================
  function configureStep2(selection) {
    const needsNetwork = selection.red || selection.camaras;

    step2NetworkBlock.hidden = !needsNetwork;
    step2CamerasBlock.hidden = !selection.camaras;
    step2ServerBlock.hidden = !selection.camaras;
    step2WebBlock.hidden = !selection.web;

    if (step2Subtitle) {
      if (!needsNetwork && selection.web) {
        step2Subtitle.textContent = 'Solo elegiste Página Web: define si será presencial o a la medida y si deseas incluir hosting.';
      } else {
        step2Subtitle.textContent = 'Elige con botones qué equipos incluir y en qué nivel cotizarlos. Si tus equipos exceden los puertos del router, se incluirá automáticamente un switch en el siguiente paso.';
      }
    }

    let n = 1;
    if (needsNetwork) {
      document.getElementById('routerStepNum').textContent = String(n++);
      document.getElementById('firewallStepNum').textContent = String(n++);
      if (selection.camaras) {
        document.getElementById('camerasStepNum').textContent = String(n++);
        document.getElementById('serverStepNum').textContent = String(n++);
      }
      document.getElementById('apStepNum').textContent = String(n++);
    }
    if (selection.web) {
      document.getElementById('webStepNum').textContent = String(n++);
      document.getElementById('hostingStepNum').textContent = String(n++);
    }

    updateStep2UI();
  }

  function buildStep2Payload() {
    const s1 = getStep1Selection();
    const needsNetwork = s1.red || s1.camaras;

    const routerTier = getRadio(step2Form, 'routerTier');
    const fwIncluded = getRadio(step2Form, 'firewallIncluded') === 'si';
    const fwTier = fwIncluded ? getRadio(step2Form, 'firewallTier') : null;

    const camInternas = s1.camaras ? clampInt(camInternasInput.value, 0, 64, 0) : 0;
    const camExternas = s1.camaras ? clampInt(camExternasInput.value, 0, 64, 0) : 0;
    const camTotal = camInternas + camExternas;
    const camerasTier = s1.camaras ? getRadio(step2Form, 'camerasTier') : null;

    const serverType = s1.camaras ? getRadio(step2Form, 'serverType') : null;
    const serverTier = s1.camaras ? getRadio(step2Form, 'serverTier') : null;

    const apIncluded = getRadio(step2Form, 'apIncluded') === 'si';
    const apCount = apIncluded ? clampInt(apCountInput.value, 1, 32, 1) : 0;
    const apTier = apIncluded ? getRadio(step2Form, 'apTier') : null;

    const webType = s1.web ? getRadio(step2Form, 'webType') : null;
    const hostingIncluded = s1.web && getRadio(step2Form, 'hostingIncluded') === 'si';
    const hostingTier = hostingIncluded ? getRadio(step2Form, 'hostingTier') : null;

    return {
      step1: s1,
      needsNetwork,
      router: needsNetwork ? { enabled: true, tier: routerTier } : null,
      firewall: needsNetwork ? { enabled: fwIncluded, tier: fwTier } : null,
      camaras: s1.camaras
        ? { enabled: true, internas: camInternas, externas: camExternas, total: camTotal, tier: camerasTier }
        : null,
      servidor: s1.camaras ? { enabled: true, subType: serverType, tier: serverTier } : null,
      accessPoints: needsNetwork ? { enabled: apIncluded, count: apCount, tier: apTier } : null,
      web: s1.web
        ? {
            enabled: true,
            webType,
            hostingIncluded,
            hostingTier
          }
        : null
    };
  }

  function resolveBackendCatalogPlan(payload) {
    if (!payload.needsNetwork) {
      return {
        ...payload,
        backendSwitch: { needed: false, minPorts: 0, poePortsNeeded: 0, needsPoE: false }
      };
    }

    const routerSpec = ROUTER_CAPACITY[payload.router.tier] || ROUTER_CAPACITY.tecnico;
    const fwSpec = payload.firewall.enabled
      ? FIREWALL_CAPACITY[payload.firewall.tier] || FIREWALL_CAPACITY.tecnico
      : null;

    const camTotal = payload.camaras ? payload.camaras.total : 0;
    const serverPorts = payload.servidor ? 1 : 0;
    const apCount = payload.accessPoints.enabled ? payload.accessPoints.count : 0;

    const wiredDevicesCount = camTotal + serverPorts + apCount;
    const poePortsNeeded = camTotal + apCount;
    const directPortLimit = fwSpec ? fwSpec.maxPorts : routerSpec.maxPorts;
    const switchNeeded = wiredDevicesCount > directPortLimit;

    return {
      ...payload,
      routerMeta: {
        ...payload.router,
        minLanPorts: !switchNeeded && !fwSpec ? Math.max(1, wiredDevicesCount) : 1,
        portsLabel: routerSpec.label
      },
      backendSwitch: {
        needed: switchNeeded,
        wiredDevicesCount,
        directPortLimit,
        minPorts: switchNeeded ? wiredDevicesCount + 1 : 0,
        poePortsNeeded,
        needsPoE: poePortsNeeded > 0
      }
    };
  }

  function updateStep2UI() {
    const q = buildStep2Payload();

    if (firewallTierBox) firewallTierBox.hidden = !(q.firewall && q.firewall.enabled);
    if (apConfigBox) apConfigBox.hidden = !(q.accessPoints && q.accessPoints.enabled);
    if (hostingTierBox) hostingTierBox.hidden = !(q.web && q.web.hostingIncluded);

    if (camerasPortSummary && q.camaras) {
      camerasPortSummary.innerHTML =
        `Total: <strong>${q.camaras.total} ${q.camaras.total === 1 ? 'cámara' : 'cámaras'}</strong> ` +
        `(${q.camaras.internas} internas + ${q.camaras.externas} externas) · ` +
        `<strong>${q.camaras.total + 1} puertos</strong> en total con el servidor`;
    }

    if (step2SummaryText) {
      const resumen = [];
      if (q.needsNetwork) {
        const routerSpec = ROUTER_CAPACITY[q.router.tier] || ROUTER_CAPACITY.tecnico;
        resumen.push(`Router ${TIER_LABELS[q.router.tier]} (${routerSpec.label})`);
        resumen.push(q.firewall.enabled ? `Firewall ${TIER_LABELS[q.firewall.tier]}` : 'Sin Firewall');
        if (q.camaras) {
          resumen.push(`${q.camaras.total} cámaras (${TIER_LABELS[q.camaras.tier]})`);
          resumen.push(`${SERVER_TYPE_LABELS[q.servidor.subType]} (${TIER_LABELS[q.servidor.tier]})`);
        }
        resumen.push(
          q.accessPoints.enabled
            ? `${q.accessPoints.count} AP (${TIER_LABELS[q.accessPoints.tier]})`
            : 'Sin Access Points'
        );
      }
      if (q.web) {
        resumen.push(q.web.webType === 'presencial' ? 'Web Presencial' : 'Web a la Medida');
        resumen.push(
          q.web.hostingIncluded
            ? q.web.hostingTier === 'vps'
              ? 'Hosting VPS'
              : 'Hosting Estándar'
            : 'Sin Hosting'
        );
      }
      step2SummaryText.innerHTML = `<strong>Consulta para Paso 3:</strong> ${resumen.join(' · ')}`;
    }

    syncButtonsVisual(step2Form);
  }

  step2Form.querySelectorAll('.tier-input, .yesno-input, .choice-input').forEach((inp) => {
    inp.addEventListener('change', () => {
      clearFeedback(step2Feedback);
      updateStep2UI();
    });
  });

  step2Form.querySelectorAll('.stepper-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      const min = parseInt(input.min || '0', 10);
      const max = parseInt(input.max || '99', 10);
      const delta = parseInt(btn.dataset.delta, 10);
      input.value = String(Math.min(max, Math.max(min, clampInt(input.value, min, max, min) + delta)));
      clearFeedback(step2Feedback);
      updateStep2UI();
    });
  });

  [camInternasInput, camExternasInput, apCountInput].forEach((input) => {
    if (!input) return;
    input.addEventListener('input', () => {
      clearFeedback(step2Feedback);
      updateStep2UI();
    });
    input.addEventListener('blur', () => {
      const min = parseInt(input.min || '0', 10);
      const max = parseInt(input.max || '99', 10);
      input.value = String(clampInt(input.value, min, max, min));
      updateStep2UI();
    });
  });

  backToStep1Btn.addEventListener('click', () => {
    clearFeedback(step2Feedback);
    goToStep(1);
  });

  step2Form.addEventListener('submit', (e) => {
    e.preventDefault();
    const payload = buildStep2Payload();

    if (payload.camaras && payload.camaras.total < 1) {
      step2Feedback.textContent = 'Agrega al menos 1 cámara interna o externa para continuar.';
      step2Feedback.className = 'step-feedback is-error';
      camInternasInput.focus();
      return;
    }

    currentFilterQuery = resolveBackendCatalogPlan(payload);
    categoryFilterOverrides = {};
    selectedDevices = {};
    lastServerCalculation = null;

    try {
      sessionStorage.setItem('pulsar_quote_step2_payload', JSON.stringify(payload));
    } catch (_) {
      // Ignorar
    }

    clearFeedback(step2Feedback);
    renderStep3();
    goToStep(3);
  });

  // =========================================================================
  // PASO 3: CONSULTA FILTRADA DE DISPOSITIVOS Y ARMADO DE COTIZACIÓN
  // =========================================================================
  function queryCatalogDevices({ category, tier, subType, minLanPorts = 0, minPorts = 0, poePortsNeeded = 0 }) {
    let matches = activeCatalog.filter((item) => {
      if (item.category !== category) return false;
      if (subType && item.subType !== subType) return false;
      if (category === 'router' && minLanPorts > 0 && (item.lanPorts || 0) < minLanPorts) return false;
      if (category === 'switch') {
        if ((item.ports || 0) < minPorts) return false;
        if (poePortsNeeded > 0 && (item.poePorts || 0) < poePortsNeeded) return false;
      }
      if (tier && tier !== 'todos' && item.tier !== tier) return false;
      return true;
    });

    if (matches.length === 0 && category === 'switch') {
      matches = activeCatalog.filter(
        (item) =>
          item.category === 'switch' &&
          (item.ports || 0) >= minPorts &&
          (poePortsNeeded === 0 || (item.poePorts || 0) >= poePortsNeeded)
      );
    }

    return matches;
  }

  function getActiveCategoriesFromPlan(plan) {
    const groups = [];
    if (!plan) return groups;

    if (plan.router && plan.router.enabled) {
      const directNote =
        !plan.backendSwitch.needed && plan.backendSwitch.wiredDevicesCount > 0
          ? `Filtrado con mínimo ${plan.routerMeta.minLanPorts} puertos Ethernet disponibles para conectar directo sin switch.`
          : `Capacidad de referencia: ${plan.routerMeta.portsLabel}.`;
      groups.push({
        key: 'router',
        category: 'router',
        title: 'Router Principal',
        subtitle: directNote,
        quantity: 1,
        defaultTier: plan.router.tier,
        minLanPorts: plan.routerMeta.minLanPorts,
        showTierPills: true
      });
    }

    if (plan.firewall && plan.firewall.enabled) {
      groups.push({
        key: 'firewall',
        category: 'firewall',
        title: 'Firewall Dedicado',
        subtitle: 'Seguridad perimetral adicional e inspección de tráfico.',
        quantity: 1,
        defaultTier: plan.firewall.tier,
        showTierPills: true
      });
    }

    if (plan.camaras && plan.camaras.internas > 0) {
      groups.push({
        key: 'camara_interna',
        category: 'camara_interna',
        title: `Cámaras Internas (${plan.camaras.internas} pzas)`,
        subtitle: 'Equipos para interiores (domo).',
        quantity: plan.camaras.internas,
        defaultTier: plan.camaras.tier,
        showTierPills: true
      });
    }

    if (plan.camaras && plan.camaras.externas > 0) {
      groups.push({
        key: 'camara_externa',
        category: 'camara_externa',
        title: `Cámaras Externas (${plan.camaras.externas} pzas)`,
        subtitle: 'Equipos para intemperie IP67.',
        quantity: plan.camaras.externas,
        defaultTier: plan.camaras.tier,
        showTierPills: true
      });
    }

    if (plan.servidor && plan.servidor.enabled) {
      groups.push({
        key: 'servidor',
        category: 'servidor',
        subType: plan.servidor.subType,
        title: `Servidor / Grabación (${SERVER_TYPE_LABELS[plan.servidor.subType]})`,
        subtitle: 'Almacenamiento y procesamiento para tu sistema.',
        quantity: 1,
        defaultTier: plan.servidor.tier,
        showTierPills: true
      });
    }

    if (plan.accessPoints && plan.accessPoints.enabled) {
      groups.push({
        key: 'access_point',
        category: 'access_point',
        title: `Access Points Wi-Fi (${plan.accessPoints.count} pzas)`,
        subtitle: 'Puntos de acceso inalámbrico empresarial.',
        quantity: plan.accessPoints.count,
        defaultTier: plan.accessPoints.tier,
        showTierPills: true
      });
    }

    if (plan.backendSwitch && plan.backendSwitch.needed) {
      const sw = plan.backendSwitch;
      groups.push({
        key: 'switch',
        category: 'switch',
        title: 'Switch de Red (Requerido por cantidad de puertos)',
        subtitle: `Tus equipos ocupan ${sw.wiredDevicesCount} puertos y superan los ${sw.directPortLimit} disponibles → Mínimo ${sw.minPorts} puertos${sw.needsPoE ? ` (${sw.poePortsNeeded} PoE+)` : ''}.`,
        quantity: 1,
        defaultTier: 'todos',
        minPorts: sw.minPorts,
        poePortsNeeded: sw.poePortsNeeded,
        showTierPills: true
      });
    }

    if (plan.web && plan.web.enabled) {
      groups.push({
        key: 'web',
        category: 'web',
        subType: plan.web.webType,
        title: 'Desarrollo de Página Web',
        subtitle: plan.web.webType === 'presencial' ? 'Sitio presencial corporativo.' : 'Plataforma web a la medida.',
        quantity: 1,
        defaultTier: 'todos',
        showTierPills: false
      });

      if (plan.web.hostingIncluded) {
        groups.push({
          key: 'hosting',
          category: 'hosting',
          subType: plan.web.hostingTier,
          title: 'Hosting y Dominio',
          subtitle: plan.web.hostingTier === 'vps' ? 'Servidor VPS dedicado.' : 'Alojamiento administrado estándar.',
          quantity: 1,
          defaultTier: 'todos',
          showTierPills: false
        });
      }
    }

    return groups;
  }

  function renderStep3FilterChips(groups) {
    if (!step3FilterChips || !currentFilterQuery) return;
    const chips = [];

    groups.forEach((g) => {
      const activeTier = categoryFilterOverrides[g.key] || g.defaultTier;
      const tierText = activeTier === 'todos' ? 'Todos' : TIER_LABELS[activeTier];
      if (g.key === 'switch') {
        chips.push(
          `<span class="filter-chip">Switch (automático): <strong>${tierText} · mín. ${g.minPorts} puertos${g.poePortsNeeded ? ' PoE+' : ''}</strong></span>`
        );
      } else {
        chips.push(`<span class="filter-chip">${g.title}: <strong>${tierText}</strong></span>`);
      }
    });

    if (currentFilterQuery.needsNetwork && currentFilterQuery.backendSwitch && !currentFilterQuery.backendSwitch.needed) {
      chips.push('<span class="filter-chip">Switch: <strong>No requerido (tu router soporta los puertos)</strong></span>');
    }

    step3FilterChips.innerHTML = chips.join('');
  }

  function renderStep3() {
    if (!currentFilterQuery || !step3CatalogGroups) return;
    const groups = getActiveCategoriesFromPlan(currentFilterQuery);
    renderStep3FilterChips(groups);

    step3CatalogGroups.innerHTML = groups
      .map((g) => {
        const activeTier = categoryFilterOverrides[g.key] || g.defaultTier;
        const devices = queryCatalogDevices({
          category: g.category,
          tier: activeTier,
          subType: g.subType,
          minLanPorts: g.minLanPorts || 0,
          minPorts: g.minPorts || 0,
          poePortsNeeded: g.poePortsNeeded || 0
        });

        const currentChosen = selectedDevices[g.key];
        const stillExists = currentChosen && devices.some((d) => d.id_producto === currentChosen.id_producto);
        if (!stillExists && devices.length > 0) {
          selectedDevices[g.key] = { ...devices[0], quantity: g.quantity, groupTitle: g.title };
        } else if (currentChosen && stillExists) {
          selectedDevices[g.key].quantity = g.quantity;
        }

        const tierPillsHtml = g.showTierPills
          ? `<div class="catalog-tier-pills">
              ${[...TIER_KEYS, 'todos']
                .map((t) => {
                  const label = t === 'todos' ? 'Todos' : TIER_LABELS[t];
                  const isActive = activeTier === t ? 'is-active' : '';
                  return `<button type="button" class="tier-filter-pill ${isActive}" data-group="${g.key}" data-tier="${t}">${label}</button>`;
                })
                .join('')}
            </div>`
          : '';

        const devicesHtml =
          devices.length > 0
            ? `<div class="catalog-devices-grid">
                ${devices
                  .map((dev) => {
                    const isSelected = selectedDevices[g.key] && selectedDevices[g.key].id_producto === dev.id_producto;
                    let badgeLabel = TIER_LABELS[dev.tier];
                    if (g.category === 'router') badgeLabel = `${TIER_LABELS[dev.tier]} · ${dev.lanPorts} puertos`;
                    if (g.category === 'switch') badgeLabel = `${TIER_LABELS[dev.tier]} · ${dev.ports} puertos`;

                    const unitTotal = dev.precio * g.quantity;
                    const priceMeta = g.quantity > 1 ? `${g.quantity} pzas = ${formatMXN(unitTotal)}` : `${dev.brand} · ${dev.modelo}`;

                    return `
                      <label class="choice-card ${isSelected ? 'is-selected' : ''}">
                        <input type="radio" class="choice-input catalog-device-radio" name="device_${g.key}" value="${dev.id_producto}" data-group="${g.key}" ${isSelected ? 'checked' : ''}>
                        <div class="choice-card-top">
                          <span class="choice-badge ${dev.tier === 'tecnico' ? 'is-recommended' : ''}">${badgeLabel}</span>
                          <span class="choice-radio-dot" aria-hidden="true"></span>
                        </div>
                        <h4 class="choice-title">${dev.name}</h4>
                        <p class="choice-desc">${dev.specs}</p>
                        <div class="device-price-row">
                          <span>${formatMXN(dev.precio)} c/u</span>
                          <span class="device-price-meta">${priceMeta}</span>
                        </div>
                      </label>
                    `;
                  })
                  .join('')}
              </div>`
            : `<div class="catalog-empty-note">No encontramos un equipo exacto en este nivel para tus puertos; prueba seleccionar <strong>Todos</strong> arriba para ver las opciones compatibles.</div>`;

        return `
          <div class="catalog-category-block">
            <div class="catalog-category-head">
              <div>
                <h3 class="catalog-category-title">${g.title}</h3>
                <p class="catalog-category-sub">${g.subtitle}</p>
              </div>
              ${tierPillsHtml}
            </div>
            ${devicesHtml}
          </div>
        `;
      })
      .join('');

    step3CatalogGroups.querySelectorAll('.tier-filter-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        categoryFilterOverrides[pill.dataset.group] = pill.dataset.tier;
        clearFeedback(step3Feedback);
        renderStep3();
      });
    });

    step3CatalogGroups.querySelectorAll('.catalog-device-radio').forEach((radio) => {
      radio.addEventListener('change', () => {
        const groupKey = radio.dataset.group;
        const dev = activeCatalog.find((d) => d.id_producto === radio.value);
        const groupMeta = groups.find((gr) => gr.key === groupKey);
        if (dev && groupMeta) {
          selectedDevices[groupKey] = { ...dev, quantity: groupMeta.quantity, groupTitle: groupMeta.title };
        }
        syncButtonsVisual(step3Form);
        clearFeedback(step3Feedback);
      });
    });
  }

  function buildSelectedItemsList() {
    return Object.values(selectedDevices).map((dev) => ({
      id_producto: dev.id_producto,
      cantidad: Number(dev.quantity || 1)
    }));
  }

  backToStep2Btn.addEventListener('click', () => {
    clearFeedback(step3Feedback);
    goToStep(2);
  });

  step3Form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const groups = getActiveCategoriesFromPlan(currentFilterQuery);
    const missing = groups.filter((g) => !selectedDevices[g.key]);

    if (missing.length > 0) {
      step3Feedback.textContent = `Selecciona un equipo o cambia el filtro de nivel en: ${missing.map((m) => m.title).join(', ')}.`;
      step3Feedback.className = 'step-feedback is-error';
      return;
    }

    clearFeedback(step3Feedback);

    // Pedir a la API Python que calcule precios unitarios reales desde SQLite
    const itemsPayload = buildSelectedItemsList();
    if (step3ContinueBtn) step3ContinueBtn.disabled = true;

    try {
      const { ok, data } = await fetchApiJson('/api/cotizaciones/calcular', {
        method: 'POST',
        body: JSON.stringify({ items: itemsPayload, paso2: currentFilterQuery })
      });

      if (!ok || !data.ok) {
        throw new Error((data && data.error) || 'No se pudo calcular el total de la cotización.');
      }

      lastServerCalculation = data;
      renderStep4Recap();
      goToStep(4);
    } catch (err) {
      if (step3Feedback) {
        step3Feedback.textContent = err.message || 'Ocurrió un error al calcular la cotización en el servidor.';
        step3Feedback.className = 'step-feedback is-error';
      }
    } finally {
      if (step3ContinueBtn) step3ContinueBtn.disabled = false;
    }
  });

  // =========================================================================
  // PASO 4: RESUMEN VERIFICADO Y ENVÍO A POST /api/cotizaciones
  // =========================================================================
  function renderStep4Recap() {
    if (!step4FinalRecapList || !currentFilterQuery) return;

    if (lastServerCalculation && Array.isArray(lastServerCalculation.detalle)) {
      const rows = lastServerCalculation.detalle.map((it) => {
        const qtyPrefix = it.cantidad > 1 ? `${it.cantidad} × ` : '';
        return `<li><span class="assembled-item-cat">${it.categoria_nombre}</span><span class="assembled-item-val">${qtyPrefix}${it.nombre} · ${formatMXN(it.subtotal)}</span></li>`;
      });

      if (currentFilterQuery.needsNetwork && currentFilterQuery.backendSwitch) {
        if (!currentFilterQuery.backendSwitch.needed) {
          rows.push(
            `<li><span class="assembled-item-cat">Switch</span><span class="assembled-item-val">No requerido (${currentFilterQuery.backendSwitch.wiredDevicesCount} dispositivos caben en el router)</span></li>`
          );
        }
      }

      step4FinalRecapList.innerHTML = rows.join('');

      if (step4TotalAmount) {
        step4TotalAmount.textContent = `${formatMXN(lastServerCalculation.monto_total_estimado)} MXN`;
      }
    }

    if (step4FormWrap) step4FormWrap.hidden = false;
    if (step4SuccessPanel) step4SuccessPanel.hidden = true;
  }

  backToStep3Btn.addEventListener('click', () => {
    clearFeedback(step4Feedback);
    goToStep(3);
  });

  editFromStep4Btn.addEventListener('click', () => {
    clearFeedback(step4Feedback);
    goToStep(3);
  });

  step4Form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFeedback(step4Feedback);

    const clientName = document.getElementById('clientName').value.trim();
    const clientCompany = document.getElementById('clientCompany').value.trim();
    const clientEmail = document.getElementById('clientEmail').value.trim();
    const clientPhone = document.getElementById('clientPhone').value.trim();
    const clientAddress = document.getElementById('clientAddress').value.trim();
    const clientNotes = document.getElementById('clientNotes').value.trim();

    if (!clientName || !clientEmail || !clientPhone) {
      step4Feedback.textContent = 'Por favor completa tu nombre, correo electrónico y teléfono/WhatsApp para poder contactarte.';
      step4Feedback.className = 'step-feedback is-error';
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(clientEmail)) {
      step4Feedback.textContent = 'Por favor ingresa un correo electrónico válido.';
      step4Feedback.className = 'step-feedback is-error';
      document.getElementById('clientEmail').focus();
      return;
    }

    const requestBody = {
      paso1: currentFilterQuery.step1,
      paso2: currentFilterQuery,
      items: buildSelectedItemsList(),
      cliente: {
        nombre: clientName,
        empresa: clientCompany,
        correo: clientEmail,
        telefono: clientPhone,
        direccion: clientAddress,
        comentarios: clientNotes
      }
    };

    if (step4SubmitBtn) step4SubmitBtn.disabled = true;

    try {
      const { ok, data } = await fetchApiJson('/api/cotizaciones', {
        method: 'POST',
        body: JSON.stringify(requestBody)
      });

      if (!ok || !data.ok) {
        throw new Error((data && data.error) || 'No se pudo registrar la cotización.');
      }

      if (successFolioBadge) {
        successFolioBadge.textContent = `Folio: ${data.folio}`;
      }
      if (successMessageText) {
        successMessageText.textContent =
          `Gracias ${clientName}. Registramos tu cotización con un total estimado de ${formatMXN(data.monto_total_estimado)} MXN. Nos pondremos en contacto contigo al ${clientEmail} o ${clientPhone}.`;
      }

      if (step4FormWrap) step4FormWrap.hidden = true;
      if (step4SuccessPanel) step4SuccessPanel.hidden = false;
    } catch (err) {
      step4Feedback.textContent = err.message || 'Ocurrió un error al enviar la cotización al servidor.';
      step4Feedback.className = 'step-feedback is-error';
    } finally {
      if (step4SubmitBtn) step4SubmitBtn.disabled = false;
    }
  });

  startNewQuoteBtn.addEventListener('click', () => {
    step4Form.reset();
    clearFeedback(step4Feedback);
    maxUnlockedStep = 1;
    currentFilterQuery = null;
    categoryFilterOverrides = {};
    selectedDevices = {};
    lastServerCalculation = null;
    goToStep(1);
  });

  syncStep1UI();
  syncButtonsVisual(step2Form);
}
