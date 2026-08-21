/* Kristina M. McGahan: behaviour.

   Two rules hold throughout:
   1. Every element's resting state is visible. Start states live behind
      .js-motion, which only this file adds. A script that fails to parse
      costs an animation, never content.
   2. .js-motion is armed only while the tab is visible. CSS transitions and
      requestAnimationFrame are both suspended in a hidden tab, so arming
      early would leave a crawler or a background tab looking at a clipped,
      transparent page. */
(function () {
  'use strict';

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var root = document.documentElement;

  /* ---------- arm motion ---------- */
  var arm = function () {
    if (reduce || root.classList.contains('js-motion')) { return; }
    root.classList.add('js-motion');
  };
  if (document.visibilityState === 'visible') {
    arm();
  } else {
    document.addEventListener('visibilitychange', function once () {
      if (document.visibilityState !== 'visible') { return; }
      document.removeEventListener('visibilitychange', once);
      arm();
    });
  }

  /* ---------- hero entrance ----------
     Timers, not rAF: rAF is throttled to zero in a background tab and the
     hero would never uncover. */
  var art = document.querySelector('.hero-art');
  var text = document.querySelector('.hero-text');
  var showHero = function () {
    if (art) { art.classList.add('in'); }
    window.setTimeout(function () { if (text) { text.classList.add('in'); } }, 110);
  };
  window.setTimeout(showHero, 40);
  window.addEventListener('load', showHero);
  window.setTimeout(showHero, 2500);

  if (!('IntersectionObserver' in window)) { return; }

  /* ---------- one observer for everything scroll-driven ---------- */
  var targets = [].slice.call(document.querySelectorAll(
    '.rv, .spread, .ledger, [data-strip], [data-recovery]'
  ));
  if (targets.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) { return; }
        e.target.classList.add('in', 'in-view');
        io.unobserve(e.target);
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -6% 0px' });
    targets.forEach(function (t) { io.observe(t); });
    /* Anything already on screen at load, or missed, is shown outright. */
    window.setTimeout(function () {
      targets.forEach(function (t) { t.classList.add('in', 'in-view'); });
    }, 5000);
  }

  /* ---------- rail active state ---------- */
  var links = [].slice.call(document.querySelectorAll('.rail nav a[href^="#"]'));
  var sections = links.map(function (a) { return document.querySelector(a.getAttribute('href')); });
  if (links.length) {
    var sio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) { return; }
        var i = sections.indexOf(e.target);
        if (i < 0) { return; }
        links.forEach(function (a) { a.classList.remove('on'); });
        links[i].classList.add('on');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach(function (s) { if (s) { sio.observe(s); } });
  }


  /* ---------- rail scroll trace ----------
     A passive listener writing one style property. With no JS the track just
     sits empty, which is why it is drawn as a track and not as a bar. */
  var prog = document.querySelector('[data-prog]');
  if (prog) {
    var ticking = false;
    var paint = function () {
      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      var pct = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      prog.style.height = (pct * 100).toFixed(2) + '%';
      ticking = false;
    };
    var onScroll = function () {
      if (ticking) { return; }
      ticking = true;
      window.setTimeout(paint, 60);        /* timers, not rAF: rAF is dead in a hidden tab */
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    paint();
  }

  /* ---------- mobile drawer ----------
     aria-expanded is mirrored, Escape closes and returns focus, and Tab is
     trapped while the drawer is the only thing on screen. */
  var btn = document.getElementById('menuBtn');
  var drawer = document.getElementById('drawer');
  if (btn && drawer) {
    var isOpen = function () { return drawer.classList.contains('open'); };
    var setOpen = function (open) {
      drawer.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.body.style.overflow = open ? 'hidden' : '';
      if (open) {
        var first = drawer.querySelector('a');
        if (first) { first.focus(); }
      }
    };
    btn.addEventListener('click', function () { setOpen(!isOpen()); });
    drawer.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') { setOpen(false); }
    });
    document.addEventListener('keydown', function (e) {
      if (!isOpen()) { return; }
      if (e.key === 'Escape' || e.key === 'Esc') { setOpen(false); btn.focus(); return; }
      if (e.key !== 'Tab') { return; }
      var items = [].slice.call(drawer.querySelectorAll('a'));
      if (!items.length) { return; }
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }


  /* ---------- enquiry form ----------
     A mailto: form action is unreliable across browsers, so the submit is
     intercepted and a real mailto: URL is composed instead. The plain form
     action stays in the markup as the no-JS fallback. */
  var form = document.getElementById('enquiry');
  if (form) {
    form.addEventListener('submit', function (e) {
      var name = (form.querySelector('#f-name') || {}).value || '';
      var mail = (form.querySelector('#f-email') || {}).value || '';
      var msg  = (form.querySelector('#f-msg')  || {}).value || '';
      if (!name || !mail || !msg) { return; }        /* let validation speak */
      e.preventDefault();
      var body = msg + '\n\n' + name + '\n' + mail;
      window.location.href = 'mailto:info@whateverynursemustknow.com'
        + '?subject=' + encodeURIComponent('Website enquiry from ' + name)
        + '&body=' + encodeURIComponent(body);
    });
  }

  /* ---------- lazy images that download but never paint ----------
     Native loading="lazy" has left images unpainted on three sites in this
     portfolio: the file returns 200 and naturalWidth stays 0. Wake each one
     as it approaches, with a timed sweep behind it. */
  var lazies = [].slice.call(document.querySelectorAll('img[loading="lazy"]'));
  if (lazies.length) {
    var wake = function (img) {
      if (img.dataset.woke) { return; }
      img.dataset.woke = '1';
      img.removeAttribute('loading');
      var src = img.getAttribute('src');
      if (src && !img.complete) { img.src = src; }
    };
    var lio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { wake(e.target); lio.unobserve(e.target); } });
    }, { rootMargin: '700px 0px' });
    lazies.forEach(function (i) { lio.observe(i); });
    window.setTimeout(function () {
      lazies.forEach(function (i) { if (!i.complete || !i.naturalWidth) { wake(i); } });
    }, 3500);
  }
}());
