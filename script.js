/* Seat ring: eight phones set down around a table, filling in tap order.
   Stays upright rather than pinwheeling, and holds still if the visitor
   has asked for reduced motion. */
(function () {
  'use strict';

  var ring = document.getElementById('ring');
  var count = document.getElementById('count');
  if (!ring || !count) { return; }

  var SEATS = 8;
  var seats = [];

  for (var i = 0; i < SEATS; i++) {
    var seat = document.createElement('div');
    seat.className = 'seat';
    ring.appendChild(seat);
    seats.push(seat);
  }

  // Positioned off the ring's rendered size so it scales with the viewport.
  function place() {
    var radius = ring.getBoundingClientRect().width * 0.36;
    seats.forEach(function (seat, index) {
      var angle = (index / SEATS) * Math.PI * 2 - Math.PI / 2;
      seat.style.transform =
        'translate(' + (Math.cos(angle) * radius).toFixed(2) + 'px, ' +
        (Math.sin(angle) * radius).toFixed(2) + 'px)';
    });
  }

  place();

  var resizeTimer;
  window.addEventListener('resize', function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(place, 120);
  });

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    seats.forEach(function (seat) { seat.classList.add('on'); });
    count.textContent = String(SEATS);
    return;
  }

  var filled = 0;
  window.setInterval(function () {
    if (filled < SEATS) {
      seats[filled].classList.add('on');
      filled++;
    } else {
      seats.forEach(function (seat) { seat.classList.remove('on'); });
      filled = 0;
    }
    count.textContent = String(filled);
  }, 750);
})();
