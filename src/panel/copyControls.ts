type StatusWriter = (message: string, isError?: boolean) => void;

interface CopyControlOptions {
  label?: string;
  name: string;
  value: string;
  status: StatusWriter;
  icon?: boolean;
}

export function copyControl(options: CopyControlOptions): HTMLElement {
  const wrapper = document.createElement("span");
  wrapper.className = "copy-control";

  const button = document.createElement("button");
  button.className = options.icon ? "copy-chip copy-icon-chip" : "copy-chip";
  button.type = "button";
  button.setAttribute("aria-label", `Copy ${options.name.toLowerCase()}`);
  if (options.icon === true) {
    button.append(copyIconSvg());
  } else {
    button.textContent = options.label ?? options.name;
  }

  const popover = copyPopover(options.name, options.icon === true ? `Copy full ${options.name.toLowerCase()}` : options.value, true);
  wrapper.append(button, popover);

  button.addEventListener("mouseenter", () => showCopyPopover(button, popover, options.name));
  button.addEventListener("mouseleave", () => hideCopyPopover(popover));
  button.addEventListener("focus", () => showCopyPopover(button, popover, options.name));
  button.addEventListener("blur", () => hideCopyPopover(popover));
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void copyToClipboard(options.value, options.name, options.status);
  });

  return wrapper;
}

export function tooltipControl(anchor: HTMLElement, label: string, value: string): void {
  const popover = copyPopover(label, value, false);
  anchor.insertAdjacentElement("afterend", popover);
  anchor.addEventListener("mouseenter", () => showCopyPopover(anchor, popover, label));
  anchor.addEventListener("mouseleave", () => hideCopyPopover(popover));
  anchor.addEventListener("focus", () => showCopyPopover(anchor, popover, label));
  anchor.addEventListener("blur", () => hideCopyPopover(popover));
}

function copyPopover(label: string, value: string, includeHint: boolean): HTMLElement {
  const popover = document.createElement("div");
  const content = document.createElement("span");

  popover.className = "copy-popover";
  popover.popover = "manual";
  popover.dataset["label"] = label;
  content.className = "copy-popover-value";
  content.textContent = value;
  popover.append(content);
  if (includeHint) {
    const hint = document.createElement("span");
    hint.className = "copy-popover-hint";
    hint.textContent = "Click to copy";
    popover.append(hint);
  }
  return popover;
}

function showCopyPopover(anchor: HTMLElement, popover: HTMLElement, name: string): void {
  const rect = anchor.getBoundingClientRect();
  popover.dataset["label"] = name;
  popover.style.left = `${Math.min(rect.left, window.innerWidth - 280)}px`;
  popover.style.top = `${rect.bottom + 6}px`;
  if (!popover.matches(":popover-open")) {
    popover.showPopover();
  }
}

function hideCopyPopover(popover: HTMLElement): void {
  if (popover.matches(":popover-open")) {
    popover.hidePopover();
  }
}

async function copyToClipboard(value: string, name: string, status: StatusWriter): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    status(`Copied ${name.toLowerCase()} to clipboard.`);
  } catch {
    status(`Could not copy ${name.toLowerCase()} to clipboard.`, true);
  }
}

function copyIconSvg(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  const back = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  back.setAttribute("x", "5");
  back.setAttribute("y", "3");
  back.setAttribute("width", "8");
  back.setAttribute("height", "9");
  back.setAttribute("rx", "1.5");
  const front = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  front.setAttribute("x", "3");
  front.setAttribute("y", "5");
  front.setAttribute("width", "8");
  front.setAttribute("height", "9");
  front.setAttribute("rx", "1.5");
  svg.append(back, front);
  return svg;
}
