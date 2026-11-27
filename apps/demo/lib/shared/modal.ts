/**
 * Keeps a modal dialog modal for the keyboard too: everything on the page outside the dialog is made
 * `inert` (not focusable, not clickable, hidden from assistive technology) while it is open. A
 * backdrop alone blocks the pointer only; Tab could still reach the page behind it.
 * Written against a small part of the DOM, so it can be tested without a browser.
 */

/** The part of a DOM element this module walks. */
export interface InertNode {
  readonly parentElement: InertNode | null;
  readonly children: ArrayLike<object>;
}

/** An element that can be made inert (an HTML element). */
interface Inertable {
  inert: boolean;
}

const isInertable = (value: object): value is Inertable =>
  'inert' in value && typeof value.inert === 'boolean';

/**
 * Makes every element outside `dialog` inert: the siblings of the dialog and of each of its
 * ancestors, up to the root. Elements that were inert already are left as they are.
 * @param dialog The element that stays usable (the dialog or its backdrop).
 * @returns Undoes exactly what it changed.
 */
export function makeOthersInert(dialog: InertNode): () => void {
  const changed: Inertable[] = [];
  let node: object = dialog;
  for (let parent = dialog.parentElement; parent !== null; parent = parent.parentElement) {
    for (const sibling of Array.from(parent.children)) {
      if (sibling === node || !isInertable(sibling) || sibling.inert) continue;
      sibling.inert = true;
      changed.push(sibling);
    }
    node = parent;
  }
  return () => {
    for (const element of changed) element.inert = false;
  };
}
