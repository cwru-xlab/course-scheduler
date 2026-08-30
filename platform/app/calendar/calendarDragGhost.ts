/** Set a full-card HTML5 drag image from an element or synthetic node. */
export function setCalendarDragImage(
  event: DragEvent,
  source: HTMLElement,
  options?: { width?: number; offsetX?: number; offsetY?: number },
): void {
  const width = options?.width ?? Math.min(source.offsetWidth || 180, 220);
  const ghost = source.cloneNode(true) as HTMLElement;
  ghost.style.position = "fixed";
  ghost.style.top = "-1000px";
  ghost.style.left = "-1000px";
  ghost.style.width = `${width}px`;
  ghost.style.pointerEvents = "none";
  ghost.style.opacity = "0.92";
  ghost.style.boxShadow = "0 8px 24px rgba(15,23,42,0.25)";
  ghost.style.zIndex = "99999";
  document.body.appendChild(ghost);
  const offsetX = options?.offsetX ?? width / 2;
  const offsetY = options?.offsetY ?? 24;
  if (event.dataTransfer) {
    event.dataTransfer.setDragImage(ghost, offsetX, offsetY);
  }
  window.setTimeout(() => ghost.remove(), 0);
}
