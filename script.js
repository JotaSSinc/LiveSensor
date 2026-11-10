(function () {
  'use strict';

  const toggle = document.querySelector('.menu-toggle');
  const navigation = document.querySelector('.main-nav');
  const header = document.querySelector('.site-header');
  const progress = document.querySelector('.scroll-progress');
  const backToTop = document.querySelector('.back-to-top');
  const year = document.getElementById('current-year');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  if (year) year.textContent = new Date().getFullYear();

  function closeMenu() {
    if (!toggle || !navigation) return;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Abrir menu');
    navigation.classList.remove('is-open');
  }

  if (toggle && navigation) {
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
      navigation.classList.toggle('is-open', open);
    });
    navigation.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeMenu();
    });
    document.addEventListener('click', event => {
      if (!navigation.contains(event.target) && !toggle.contains(event.target)) closeMenu();
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth > 700) closeMenu();
    });
  }

  // Barra fina que informa quanto da página já foi percorrido.
  let scrolling = false;
  function onScroll() {
    if (scrolling) return;
    scrolling = true;
    requestAnimationFrame(() => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = maxScroll > 0 ? Math.min(1, Math.max(0, window.scrollY / maxScroll)) : 0;
      if (progress) progress.style.transform = 'scaleX(' + ratio + ')';
      if (header) header.classList.toggle('is-scrolled', window.scrollY > 12);
      if (backToTop) backToTop.classList.toggle('is-visible', window.scrollY > 600);
      scrolling = false;
    });
  }
  window.addEventListener('scroll', onScroll, {passive: true});
  window.addEventListener('resize', onScroll);
  onScroll();

  // Portfólio em carrossel: setas, seleção direta pelas categorias e gesto de arrastar.
  const track = document.getElementById('project-track');
  const cards = [...document.querySelectorAll('.project-card[data-category]')];
  const filters = [...document.querySelectorAll('.filter-button[data-filter]')];
  const count = document.getElementById('carousel-count');
  const feedback = document.getElementById('filter-feedback');
  const previous = document.querySelector('[data-carousel-prev]');
  const next = document.querySelector('[data-carousel-next]');
  let currentIndex = 0;
  let navigationOrigin = 'overview';

  function updateCarousel(index, source) {
    if (!cards.length) return;
    currentIndex = ((index % cards.length) + cards.length) % cards.length;
    if (source === 'arrow' || source === 'swipe') navigationOrigin = 'overview';
    if (count) count.textContent = String(currentIndex + 1).padStart(2, '0') + ' / ' + String(cards.length).padStart(2, '0');
    filters.forEach(button => {
      const selected = navigationOrigin === 'overview'
        ? button.dataset.filter === 'todos'
        : button.dataset.filter === cards[currentIndex].dataset.category;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    if (feedback) feedback.textContent = 'Projeto ' + (currentIndex + 1) + ' de ' + cards.length + ': ' + cards[currentIndex].querySelector('h3').textContent.trim();
  }

  function goToCard(index, source) {
    if (!track || !cards.length) return;
    const resolved = ((index % cards.length) + cards.length) % cards.length;
    updateCarousel(resolved, source);
    track.scrollTo({left: cards[resolved].offsetLeft - cards[0].offsetLeft, behavior: reduceMotion.matches ? 'instant' : 'smooth'});
  }

  if (track && cards.length) {
    if (previous) previous.addEventListener('click', () => goToCard(currentIndex - 1, 'arrow'));
    if (next) next.addEventListener('click', () => goToCard(currentIndex + 1, 'arrow'));
    filters.forEach(button => button.addEventListener('click', () => {
      const selected = button.dataset.filter;
      navigationOrigin = selected === 'todos' ? 'overview' : 'category';
      const target = selected === 'todos' ? 0 : cards.findIndex(card => card.dataset.category === selected);
      if (target !== -1) goToCard(target, 'button');
    }));
    let queued = false;
    track.addEventListener('scroll', () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        const w = track.clientWidth || 1;
        const index = Math.max(0, Math.min(cards.length - 1, Math.round(track.scrollLeft / w)));
        if (index !== currentIndex) updateCarousel(index, 'swipe');
        queued = false;
      });
    }, {passive: true});
    track.addEventListener('keydown', event => {
      if (event.key === 'ArrowRight') { event.preventDefault(); goToCard(currentIndex + 1, 'arrow'); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); goToCard(currentIndex - 1, 'arrow'); }
      if (event.key === 'Home') { event.preventDefault(); goToCard(0, 'arrow'); }
      if (event.key === 'End') { event.preventDefault(); goToCard(cards.length - 1, 'arrow'); }
    });
    updateCarousel(0, 'overview');
  }

  // Efeito de entrada sutil; respeita pessoas que preferem movimento reduzido.
  if ('IntersectionObserver' in window && !reduceMotion.matches) {
    const elements = document.querySelectorAll('.section-heading, .partners-image, .footer-top');
    elements.forEach(element => element.classList.add('reveal'));
    document.documentElement.classList.add('js-enhanced');
    const reveals = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: .08, rootMargin: '0px 0px 25px 0px' });
    elements.forEach(element => reveals.observe(element));
  }

  // Luz segue o cursor apenas em telas com mouse, não em dispositivos touch.
  const hero = document.querySelector('.hero');
  if (hero && window.matchMedia('(pointer: fine)').matches && !reduceMotion.matches) {
    let queued = false;
    let point = null;
    hero.addEventListener('pointermove', event => {
      point = {x: event.clientX, y: event.clientY};
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        const bounds = hero.getBoundingClientRect();
        hero.style.setProperty('--pointer-x', (point.x - bounds.left) + 'px');
        hero.style.setProperty('--pointer-y', (point.y - bounds.top) + 'px');
        queued = false;
      });
    }, {passive: true});
  }

  // Destaca o item da navegação correspondente ao trecho atual.
  const navLinks = [...document.querySelectorAll('.main-nav .nav-link[href^="#"]')];
  if ('IntersectionObserver' in window && navLinks.length) {
    const sections = navLinks.map(link => document.querySelector(link.getAttribute('href'))).filter(Boolean);
    const sectionObserver = new IntersectionObserver(entries => {
      const candidates = entries.filter(entry => entry.isIntersecting);
      if (!candidates.length) return;
      candidates.sort((a,b) => b.intersectionRatio - a.intersectionRatio);
      const id = '#' + candidates[0].target.id;
      navLinks.forEach(link => {
        const active = link.getAttribute('href') === id;
        link.classList.toggle('is-active', active);
        if (active) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }, { rootMargin: '-20% 0px -35% 0px', threshold: [0, .1, .25, .5] });
    sections.forEach(section => sectionObserver.observe(section));
  }
})();
