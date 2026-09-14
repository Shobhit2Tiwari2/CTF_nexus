// ═══════════════════════════════════════════════════════
// NEXUS CTF — Client-Side JavaScript
// Matrix rain, XSS detection, animations
// ═══════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  initMatrixRain();
  initTerminalEffects();
  initXSSDetector();
  initFadeAnimations();
});

// ─── Matrix Rain Background ───
function initMatrixRain() {
  const canvas = document.getElementById('matrix-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*(){}[]|;:<>?/~アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
  const fontSize = 14;
  const columns = Math.floor(canvas.width / fontSize);
  const drops = new Array(columns).fill(1);

  function draw() {
    ctx.fillStyle = 'rgba(10, 10, 15, 0.05)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#00f0ff';
    ctx.font = `${fontSize}px 'Share Tech Mono', monospace`;

    for (let i = 0; i < drops.length; i++) {
      const char = chars[Math.floor(Math.random() * chars.length)];
      const x = i * fontSize;
      const y = drops[i] * fontSize;

      // Randomly vary color between cyan and green
      if (Math.random() > 0.5) {
        ctx.fillStyle = `rgba(0, 240, 255, ${Math.random() * 0.5 + 0.1})`;
      } else {
        ctx.fillStyle = `rgba(57, 255, 20, ${Math.random() * 0.5 + 0.1})`;
      }

      ctx.fillText(char, x, y);

      if (y > canvas.height && Math.random() > 0.975) {
        drops[i] = 0;
      }
      drops[i]++;
    }

    requestAnimationFrame(draw);
  }

  draw();
}

// ─── Terminal Effects ───
function initTerminalEffects() {
  const cmdInput = document.getElementById('cmd-input');
  if (!cmdInput) return;

  // Auto-focus the terminal input
  cmdInput.focus();

  // Handle Enter key
  cmdInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const form = cmdInput.closest('form');
      if (form) form.submit();
    }
  });

  // Add typing sound effect simulation (visual flash)
  cmdInput.addEventListener('input', () => {
    cmdInput.style.textShadow = '0 0 10px rgba(57, 255, 20, 0.8)';
    setTimeout(() => {
      cmdInput.style.textShadow = 'none';
    }, 50);
  });
}

// ─── XSS Detection System ───
// This is the core CTF mechanic: when a participant successfully injects
// and executes a script via XSS, this detector catches it and reveals the flag
function initXSSDetector() {
  const terminalOutput = document.querySelector('.terminal-output');
  if (!terminalOutput) return;

  // Method 1: MutationObserver — detect injected script elements
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Check if a script tag was injected
          if (node.tagName === 'SCRIPT' || node.querySelector?.('script')) {
            triggerFlagReveal();
            return;
          }
          // Check for event handlers that might execute
          const allElements = [node, ...(node.querySelectorAll?.('*') || [])];
          for (const el of allElements) {
            if (el.attributes) {
              for (const attr of el.attributes) {
                if (attr.name.startsWith('on')) {
                  triggerFlagReveal();
                  return;
                }
              }
            }
          }
        }
      }
    }
  });

  observer.observe(terminalOutput, {
    childList: true,
    subtree: true,
    attributes: true
  });

  // Method 2: Override alert/prompt/confirm to catch XSS payloads
  const originalAlert = window.alert;
  const originalPrompt = window.prompt;
  const originalConfirm = window.confirm;

  window.alert = function(msg) {
    triggerFlagReveal();
    originalAlert.call(window, msg);
  };

  window.prompt = function(msg) {
    triggerFlagReveal();
    return originalPrompt.call(window, msg);
  };

  window.confirm = function(msg) {
    triggerFlagReveal();
    return originalConfirm.call(window, msg);
  };

  // Method 3: Detect console usage from injected scripts
  const originalLog = console.log;
  console.log = function(...args) {
    const stack = new Error().stack || '';
    if (stack.includes('eval') || stack.includes('Function')) {
      triggerFlagReveal();
    }
    originalLog.apply(console, args);
  };
}

// ─── Flag Reveal ───
let flagRevealed = false;

async function triggerFlagReveal() {
  if (flagRevealed) return;
  flagRevealed = true;

  try {
    const response = await fetch('/api/flag');
    const data = await response.json();

    showFlagModal(data.flag_content, data.message);
  } catch (err) {
    console.error('[NEXUS] Flag retrieval failed:', err);
  }
}

function showFlagModal(content, message) {
  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'flag-overlay active';
  overlay.innerHTML = `
    <div class="flag-modal">
      <div class="flag-modal-header">
        <h2>🏴 FLAG CAPTURED 🏴</h2>
        <p>${message || 'XSS vulnerability exploited successfully!'}</p>
      </div>
      <div class="flag-content">${escapeHtml(content)}</div>
      <button class="flag-close-btn" onclick="this.closest('.flag-overlay').remove()">
        DISMISS
      </button>
    </div>
  `;

  document.body.appendChild(overlay);

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  });

  // Close on Escape
  document.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('keydown', escHandler);
    }
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ─── Fade-in Animations on Scroll ───
function initFadeAnimations() {
  const elements = document.querySelectorAll('.stat-card, .section-card, .terminal-tips');

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('fade-in-up');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    elements.forEach(el => observer.observe(el));
  } else {
    elements.forEach(el => el.classList.add('fade-in-up'));
  }
}

// ─── Utility: Format uptime ───
function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

// ─── Live clock in footer ───
(function updateClock() {
  const clockEl = document.getElementById('live-clock');
  if (clockEl) {
    const now = new Date();
    clockEl.textContent = now.toISOString().replace('T', ' ').split('.')[0] + ' UTC';
  }
  setTimeout(updateClock, 1000);
})();
