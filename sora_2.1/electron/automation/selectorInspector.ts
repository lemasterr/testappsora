
import type { Page } from 'puppeteer-core';
import { logInfo } from '../logging/logger';

const sessionPages = new Map<string, Page>();

export function registerSessionPage(sessionId: string, page: Page): void {
  sessionPages.set(sessionId, page);
}

export function unregisterSessionPage(sessionId: string, page?: Page | null): void {
  const existing = sessionPages.get(sessionId);
  if (!existing) return;
  if (!page || existing === page) {
    sessionPages.delete(sessionId);
  }
}

export function getSessionPage(sessionId: string): Page | null {
  const page = sessionPages.get(sessionId) ?? null;
  if (page && typeof (page as Page).isClosed === 'function' && page.isClosed()) {
    sessionPages.delete(sessionId);
    return null;
  }
  return page ?? null;
}

export async function startSelectorInspect(page: Page): Promise<void> {
  logInfo('Inspector', 'Injecting selector picker...');
  
  await page.evaluate(() => {
    const w = window as typeof window & {
      __selectorInspectorCleanup?: () => void;
      __lastSelector?: string | null;
    };

    if (w.__selectorInspectorCleanup) {
      w.__selectorInspectorCleanup();
    }

    // CSS for the highlighter
    const styleId = 'sora-inspector-style';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
            .sora-inspector-hover {
                outline: 2px solid #ef4444 !important;
                outline-offset: -2px !important;
                cursor: crosshair !important;
                background-color: rgba(239, 68, 68, 0.1) !important;
            }
            .sora-inspector-overlay {
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: #09090b;
                color: #fff;
                padding: 10px 20px;
                border-radius: 8px;
                font-family: monospace;
                font-size: 14px;
                z-index: 2147483647;
                border: 1px solid #333;
                box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                pointer-events: none;
            }
        `;
        document.head.appendChild(style);
    }

    // Status overlay
    const overlay = document.createElement('div');
    overlay.className = 'sora-inspector-overlay';
    overlay.innerText = 'Picker Mode Active. Click an element.';
    document.body.appendChild(overlay);

    const compute = (el: Element | null): string | null => {
      if (!el) return null;
      
      // 1. Try ID
      if (el.id) return `#${el.id}`;

      // 2. Try specific data attributes
      const testId = el.getAttribute('data-testid');
      if (testId) return `[data-testid="${testId}"]`;
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel) return `[aria-label="${ariaLabel}"]`;

      // 3. Path generation
      const path: string[] = [];
      let current: Element | null = el;
      
      while (current && current.nodeType === Node.ELEMENT_NODE) {
          let selector = current.tagName.toLowerCase();
          
          if (current.id) {
              selector += `#${current.id}`;
              path.unshift(selector);
              break;
          } else {
              let siblingIndex = 1;
              let sibling = current.previousElementSibling;
              while (sibling) {
                  if (sibling.tagName === current.tagName) siblingIndex++;
                  sibling = sibling.previousElementSibling;
              }
              if (siblingIndex > 1) selector += `:nth-of-type(${siblingIndex})`;
          }
          
          path.unshift(selector);
          current = current.parentElement;
      }
      return path.join(' > ');
    };

    let hoveredEl: Element | null = null;

    const mouseOverHandler = (e: MouseEvent) => {
        if (hoveredEl) hoveredEl.classList.remove('sora-inspector-hover');
        hoveredEl = e.target as Element;
        if (hoveredEl) {
            hoveredEl.classList.add('sora-inspector-hover');
            const sel = compute(hoveredEl);
            overlay.innerText = sel || 'Unknown';
        }
    };

    const clickHandler = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const el = event.target as Element;
      const selector = compute(el);
      w.__lastSelector = selector;
      
      // Visual feedback
      overlay.innerText = `Picked: ${selector}`;
      overlay.style.borderColor = '#10b981';
      overlay.style.color = '#10b981';
      
      if (hoveredEl) hoveredEl.classList.remove('sora-inspector-hover');
      
      // Auto-cleanup after pick? Or keep open? Let's cleanup to prevent stuck state.
      // But we need to wait for main process to poll this value.
    };

    const cleanup = () => {
      document.removeEventListener('mouseover', mouseOverHandler, true);
      document.removeEventListener('click', clickHandler, true);
      if (hoveredEl) hoveredEl.classList.remove('sora-inspector-hover');
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      const style = document.getElementById(styleId);
      if (style && style.parentNode) style.parentNode.removeChild(style);
    };

    w.__selectorInspectorCleanup = cleanup;
    w.__lastSelector = null;

    document.addEventListener('mouseover', mouseOverHandler, true);
    document.addEventListener('click', clickHandler, true);
  });
}

export async function getLastSelector(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const w = window as typeof window & { __lastSelector?: string | null, __selectorInspectorCleanup?: () => void };
    const sel = w.__lastSelector;
    if (sel) {
        // Cleanup if we retrieved a value
        if (w.__selectorInspectorCleanup) w.__selectorInspectorCleanup();
        w.__lastSelector = null;
    }
    return sel ?? null;
  });
}

export async function startInspectorForSession(
  sessionId: string
): Promise<{ ok: boolean; error?: string }> {
  const page = getSessionPage(sessionId);
  if (!page) {
    return { ok: false, error: 'No active page for session. Launch Chrome first.' };
  }

  try {
    await startSelectorInspect(page);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export async function getLastSelectorForSession(
  sessionId: string
): Promise<{ ok: boolean; selector?: string | null; error?: string }> {
  const page = getSessionPage(sessionId);
  if (!page) {
    return { ok: false, error: 'No active page for session' };
  }

  try {
    const selector = await getLastSelector(page);
    return { ok: true, selector };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}
