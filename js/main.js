/* ============================================================
   Nonovation — comportement du site
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  /* ---- année dans le footer ---- */
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---- header : fond au scroll ---- */
  const header = document.getElementById('siteHeader');
  const onScroll = () => {
    header.classList.toggle('is-scrolled', window.scrollY > 12);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---- menu mobile ---- */
  const navToggle = document.getElementById('navToggle');
  const nav = document.getElementById('siteNav');
  const headerCta = document.querySelector('.header-cta');

  navToggle.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('is-open');
    headerCta.classList.toggle('is-open', isOpen);
    navToggle.setAttribute('aria-expanded', String(isOpen));
    navToggle.classList.toggle('is-active', isOpen);
  });

  nav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      nav.classList.remove('is-open');
      headerCta.classList.remove('is-open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });

  /* ---- reveal au scroll ---- */
  const revealEls = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('in-view'));
  }

  const CLIENT_CODES = {
    DEMO: 'clients/demo/',
    LAURA: 'clients/pavillon_alpn_leman'
  };

  const demoForm = document.getElementById('demoForm');
  const demoInput = document.getElementById('demoCode');
  const demoMessage = document.getElementById('demoMessage');

  demoForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = demoInput.value.trim().toUpperCase();

    if (!code) {
      demoMessage.textContent = 'Merci de saisir un code.';
      demoMessage.className = 'demo-message is-error';
      return;
    }

    const destination = CLIENT_CODES[code];
    if (destination) {
      demoMessage.textContent = 'Redirection en cours…';
      demoMessage.className = 'demo-message is-ok';
      window.location.href = destination;
    } else {
      demoMessage.textContent = 'Code introuvable. Vérifiez le code reçu ou contactez-nous.';
      demoMessage.className = 'demo-message is-error';
    }
  });

  /* ---- formulaire de contact (Formspree) ---- */
  const contactForm = document.querySelector('.contact-form');
  if (contactForm) {
    let statusEl = contactForm.querySelector('.form-status');
    if (!statusEl) {
      statusEl = document.createElement('p');
      statusEl.className = 'form-status';
      statusEl.setAttribute('role', 'status');
      statusEl.setAttribute('aria-live', 'polite');
      contactForm.appendChild(statusEl);
    }

    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = contactForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      statusEl.textContent = 'Envoi en cours…';
      statusEl.className = 'form-status';

      try {
        const response = await fetch(contactForm.action, {
          method: 'POST',
          body: new FormData(contactForm),
          headers: { Accept: 'application/json' },
        });

        if (response.ok) {
          statusEl.textContent = 'Message envoyé, merci ! On revient vers vous rapidement.';
          statusEl.className = 'form-status is-ok';
          contactForm.reset();
        } else {
          throw new Error('Formspree error');
        }
      } catch (err) {
        statusEl.textContent = "Une erreur est survenue. Écrivez-nous directement à l'adresse ci-dessous.";
        statusEl.className = 'form-status is-error';
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

});
