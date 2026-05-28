// ===== NAVBAR ON SCROLL =====
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 60);
}, { passive: true });

// ===== HERO PARALLAX + LOAD ANIMATION =====
window.addEventListener('load', () => {
  document.getElementById('hero').classList.add('loaded');
});

// ===== MOBILE MENU =====
const burger = document.getElementById('burger');
const mobileMenu = document.getElementById('mobileMenu');

burger.addEventListener('click', () => {
  const isOpen = mobileMenu.classList.toggle('open');
  document.body.style.overflow = isOpen ? 'hidden' : '';
  burger.setAttribute('aria-expanded', isOpen);
});

document.querySelectorAll('.mobile-link').forEach(link => {
  link.addEventListener('click', () => {
    mobileMenu.classList.remove('open');
    document.body.style.overflow = '';
    burger.setAttribute('aria-expanded', 'false');
  });
});

// ===== SCROLL FADE-IN =====
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.08 });

document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));

// ===== LIGHTBOX =====
const galleries = {};

document.querySelectorAll('.gallery-item[data-gallery]').forEach(item => {
  const id = item.dataset.gallery;
  const idx = parseInt(item.dataset.index, 10);
  if (!galleries[id]) galleries[id] = [];
  galleries[id][idx] = {
    src: item.querySelector('img').getAttribute('src'),
    alt: item.querySelector('img').getAttribute('alt'),
  };
  item.addEventListener('click', () => openLightbox(id, idx));
});

const lightbox    = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightboxImg');
const lightboxCap = document.getElementById('lightboxCaption');
let currentGallery = null;
let currentIndex   = 0;

function openLightbox(galleryId, index) {
  currentGallery = galleryId;
  currentIndex   = index;
  setLightboxImage();
  lightbox.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  lightbox.classList.remove('active');
  document.body.style.overflow = '';
}

function setLightboxImage() {
  const item = galleries[currentGallery][currentIndex];
  lightboxImg.src = item.src;
  lightboxImg.alt = item.alt;
  lightboxCap.textContent = item.alt;
}

function prevImage() {
  const len = galleries[currentGallery].length;
  currentIndex = (currentIndex - 1 + len) % len;
  setLightboxImage();
}

function nextImage() {
  currentIndex = (currentIndex + 1) % galleries[currentGallery].length;
  setLightboxImage();
}

document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
document.getElementById('lightboxOverlay').addEventListener('click', closeLightbox);
document.getElementById('lightboxPrev').addEventListener('click', prevImage);
document.getElementById('lightboxNext').addEventListener('click', nextImage);

document.addEventListener('keydown', e => {
  if (!lightbox.classList.contains('active')) return;
  if (e.key === 'Escape')      closeLightbox();
  if (e.key === 'ArrowLeft')   prevImage();
  if (e.key === 'ArrowRight')  nextImage();
});

// Touch swipe support for lightbox
let touchStartX = 0;
lightbox.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
lightbox.addEventListener('touchend', e => {
  const delta = e.changedTouches[0].clientX - touchStartX;
  if (Math.abs(delta) > 50) delta < 0 ? nextImage() : prevImage();
});

// ===== CONTACT FORM (feedback visuel) =====
document.getElementById('contactForm').addEventListener('submit', e => {
  e.preventDefault();
  const btn = e.target.querySelector('.btn-submit');
  const original = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-check"></i> Message envoyé !';
  btn.style.background = '#2E7D32';
  btn.disabled = true;
  setTimeout(() => {
    btn.innerHTML = original;
    btn.style.background = '';
    btn.disabled = false;
    e.target.reset();
  }, 3500);
});

// ===== DATE VALIDATION (départ >= arrivée) =====
const checkin  = document.getElementById('checkin');
const checkout = document.getElementById('checkout');
checkin.addEventListener('change', () => {
  if (checkout.value && checkout.value < checkin.value) checkout.value = '';
  checkout.min = checkin.value;
});
