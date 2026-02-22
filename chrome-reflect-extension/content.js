(() => {
  // --- Rule sets for lightweight local text analysis ---
  const CERTAINTY_WORDS = [
    'always', 'never', 'definitely', 'obviously', 'undeniably', 'clearly', 'must'
  ];
  const EMOTIONAL_WORDS = [
    'angry', 'furious', 'upset', 'frustrated', 'disappointed', 'hate', 'ridiculous'
  ];
  const DECISION_KEYWORDS = [
    'decide', 'decision', 'approve', 'reject', 'final', 'deadline', 'ship', 'launch'
  ];

  // --- Internal state ---
  let activeInput = null;
  let allowNextSend = false;
  let modalEl = null;

  // --- Helpers: target detection ---
  function isTextEntryElement(el) {
    if (!el) return false;

    const tag = el.tagName?.toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();

    // Textareas and contenteditable areas are common for email/chat compose.
    if (tag === 'textarea' || el.isContentEditable) return true;

    // Input types that may contain user-generated message text.
    if (tag === 'input') {
      return ['text', 'search', 'email', 'url'].includes(type) || type === '';
    }

    return false;
  }

  function getTextFromElement(el) {
    if (!el) return '';
    if (el.isContentEditable) return (el.innerText || '').trim();
    return (el.value || '').trim();
  }

  // --- Helpers: send action detection ---
  function looksLikeSendButton(el) {
    if (!el) return false;

    const clickable = el.closest('button, [role="button"], input[type="submit"], input[type="button"]');
    if (!clickable) return false;

    const label = (
      clickable.getAttribute('aria-label') ||
      clickable.innerText ||
      clickable.value ||
      clickable.getAttribute('title') ||
      ''
    ).toLowerCase();

    return /\b(send|submit|reply|post|publish|share)\b/.test(label);
  }

  function isSendKeyCombo(event) {
    // Common send shortcuts in compose UIs.
    return event.key === 'Enter' && (event.ctrlKey || event.metaKey);
  }

  // --- Rule-based analysis ---
  function analyzeText(text) {
    const lower = text.toLowerCase();

    const certaintyHits = CERTAINTY_WORDS.filter((w) => lower.includes(w));
    const emotionalHits = EMOTIONAL_WORDS.filter((w) => lower.includes(w));
    const decisionHits = DECISION_KEYWORDS.filter((w) => lower.includes(w));

    // Simple scoring approach.
    const score = certaintyHits.length + emotionalHits.length + decisionHits.length;

    return {
      score,
      shouldPrompt: score >= 2,
      hits: {
        certaintyHits,
        emotionalHits,
        decisionHits
      }
    };
  }

  // --- Modal UI ---
  function closeModal() {
    if (modalEl) {
      modalEl.remove();
      modalEl = null;
    }
  }

  function openReflectionModal(onEdit, onProceed) {
    closeModal();

    modalEl = document.createElement('div');
    modalEl.className = 'rbs-modal-backdrop';
    modalEl.innerHTML = `
      <div class="rbs-modal" role="dialog" aria-modal="true" aria-label="Reflect before sending">
        <h3>Pause for Reflection</h3>
        <ul>
          <li>What assumption are you making?</li>
          <li>Is there evidence for this decision?</li>
          <li>Consider adding a counterpoint.</li>
        </ul>
        <div class="rbs-modal-actions">
          <button class="rbs-btn rbs-btn-secondary" data-action="edit">Edit</button>
          <button class="rbs-btn rbs-btn-primary" data-action="proceed">Proceed</button>
        </div>
      </div>
    `;

    modalEl.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      if (target.dataset.action === 'edit') {
        closeModal();
        onEdit();
      }

      if (target.dataset.action === 'proceed') {
        closeModal();
        onProceed();
      }
    });

    document.body.appendChild(modalEl);
  }

  // --- Send interception logic ---
  function maybeBlockAndPrompt(event, attemptedVia) {
    if (allowNextSend) {
      // Allow one send action after user explicitly chooses Proceed.
      allowNextSend = false;
      return;
    }

    const text = getTextFromElement(activeInput);
    if (!text) return;

    const analysis = analyzeText(text);
    if (!analysis.shouldPrompt) return;

    // Pause current send action and show reflection modal.
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    openReflectionModal(
      () => {
        // Edit: focus the message input so user can revise.
        if (activeInput && typeof activeInput.focus === 'function') {
          activeInput.focus();
        }
      },
      () => {
        // Proceed: allow next send and replay the same kind of action.
        allowNextSend = true;

        if (attemptedVia === 'button') {
          const clicked = event.target;
          if (clicked instanceof HTMLElement) clicked.click();
        } else if (attemptedVia === 'keys') {
          if (activeInput && typeof activeInput.dispatchEvent === 'function') {
            const newEvent = new KeyboardEvent('keydown', {
              key: 'Enter',
              ctrlKey: event.ctrlKey,
              metaKey: event.metaKey,
              bubbles: true,
              cancelable: true
            });
            activeInput.dispatchEvent(newEvent);
          }
        }
      }
    );
  }

  // Track last-focused text entry so we know which content to analyze.
  document.addEventListener('focusin', (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && isTextEntryElement(target)) {
      activeInput = target;
    }
  });

  // Intercept send-like button clicks before page handlers fire.
  document.addEventListener(
    'click',
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!looksLikeSendButton(target)) return;
      if (!activeInput) return;

      maybeBlockAndPrompt(event, 'button');
    },
    true
  );

  // Intercept send keyboard shortcut in active compose field.
  document.addEventListener(
    'keydown',
    (event) => {
      if (!isSendKeyCombo(event)) return;

      const target = event.target;
      if (!(target instanceof HTMLElement) || !isTextEntryElement(target)) return;

      activeInput = target;
      maybeBlockAndPrompt(event, 'keys');
    },
    true
  );
})();
