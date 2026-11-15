"use client";

import { useEffect } from "react";
import { useLang } from "@/i18n";
import { toCyrillic } from "@/lib/translit";

const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "CODE", "PRE", "NOSCRIPT"]);
const ATTRS = ["placeholder", "aria-label", "title"];

/**
 * B4: when "Ўзбекча (кирилл)" is chosen, every Uzbek text on screen (dictionary and server explanations)
 * is shown in Cyrillic. Runs after hydration; React keeps owning the nodes, we only rewrite their text.
 * Opt out with data-no-translit.
 */
export function CyrillicLayer() {
  const on = useLang((s) => s.lang === "uz" && s.script === "cyrl");
  useEffect(() => {
    document.documentElement.lang = on ? "uz-Cyrl" : useLang.getState().lang;
    if (!on) return;
    const skip = (el: Element | null) => {
      for (let e = el; e; e = e.parentElement) if (SKIP.has(e.tagName) || e.hasAttribute("data-no-translit")) return true;
      return false;
    };
    const fixText = (n: Text) => {
      const v = n.nodeValue;
      if (!v || !/[A-Za-z]/.test(v) || skip(n.parentElement)) return;
      const c = toCyrillic(v);
      if (c !== v) n.nodeValue = c;
    };
    const fixEl = (el: Element) => {
      if (skip(el)) return;
      for (const a of ATTRS) {
        const v = el.getAttribute(a);
        if (v && /[A-Za-z]/.test(v)) {
          const c = toCyrillic(v);
          if (c !== v) el.setAttribute(a, c);
        }
      }
    };
    const walk = (root: Node) => {
      if (root.nodeType === 3) return fixText(root as Text);
      if (root.nodeType !== 1) return;
      fixEl(root as Element);
      const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      for (let n = tw.nextNode(); n; n = tw.nextNode()) n.nodeType === 3 ? fixText(n as Text) : fixEl(n as Element);
    };
    walk(document.body);
    document.title = toCyrillic(document.title);
    const mo = new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === "characterData") fixText(m.target as Text);
        else if (m.type === "attributes") fixEl(m.target as Element);
        else m.addedNodes.forEach(walk);
      }
    });
    mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    return () => mo.disconnect();
  }, [on]);
  return null;
}
