/**
 * DOM surgery for the Actor Directory button.
 *
 * No Foundry globals — everything comes from the root element that is passed in
 * — so this can be exercised against a mock header in a browser fixture
 * (test/fixtures/directory-button.html) without launching Foundry.
 *
 * This is the *third* ACKS II wizard to want a place in that header, and the
 * system only offers two buttons worth pairing with. See the comment on
 * `firstUnpairedSystemButton` for what that means.
 */

/**
 * Buttons another module has already claimed, which we must not steal.
 *
 * The data attribute is the forward-looking convention, but the magic research
 * wizard predates it and only marks itself by class, so both siblings are named
 * explicitly. Removing either class would let this module steal their button.
 */
const FOREIGN_MODULE_BUTTONS = [
  ".dw-directory-button",
  ".cw-directory-button",
  ".mrw-directory-button",
  "[data-acks2-module-button]"
].join(", ");

/**
 * The system's own extra buttons sit after `.header-actions` and carry no class.
 *
 * Once a button has been paired it lives inside a wrapper `div`, so it is no
 * longer a `BUTTON` sibling and this walk steps straight past it. That is what
 * lets several modules each claim a different system button without agreeing on
 * an order.
 *
 * With both siblings installed there is nothing left to claim, and this returns
 * null. That is the ordinary case for this module rather than an edge case, so
 * the unpaired branch below is the one to keep working.
 */
function firstUnpairedSystemButton(anchor) {
  for (let node = anchor.nextElementSibling; node; node = node.nextElementSibling) {
    if (node.tagName !== "BUTTON") continue;
    if (node.matches(FOREIGN_MODULE_BUTTONS)) continue;
    return node;
  }
  return null;
}

/**
 * Add the Downtime button to a directory header.
 *
 * Pairs with the first system button nobody else has taken so the two share a
 * row, mirroring the Create Actor / Create Folder row above. With no system
 * button free — which is what happens when both sibling wizards are installed —
 * ours takes its own row at the width the system would have used.
 *
 * Safe to call on every render: it returns null if the button is already there.
 *
 * @param {Element} root  the directory element
 * @param {{label?: string, onClick?: Function}} options
 * @returns {HTMLElement|null} the button, or null if it was already present
 */
export function injectDirectoryButton(root, { label, onClick } = {}) {
  const anchor = root?.querySelector?.(".header-actions");
  if (!anchor || root.querySelector(".dw-directory-button")) return null;

  const doc = root.ownerDocument;
  const button = doc.createElement("button");
  button.type = "button";
  button.classList.add("dw-directory-button");
  // Lets any future sibling module recognise this as already spoken for.
  button.dataset.acks2ModuleButton = "downtime";
  button.textContent = label ?? "Downtime";
  if (onClick) button.addEventListener("click", onClick);

  const partner = firstUnpairedSystemButton(anchor);
  if (partner) {
    const row = doc.createElement("div");
    row.classList.add("dw-button-row", "flexrow");
    partner.replaceWith(row);
    // The system sets an inline width:45%; clear it so the pair splits the row.
    partner.style.width = "";
    row.append(partner, button);
  } else {
    button.style.width = "45%";
    // After the last module button if there is one, so the three stack in load
    // order instead of this one jumping to the top of the pile.
    const tail = [...root.querySelectorAll(FOREIGN_MODULE_BUTTONS)]
      .filter((el) => el.parentElement === anchor.parentElement)
      .pop();
    (tail ?? anchor).after(button);
  }

  return button;
}
