function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeUrl(url: string): string {
  const t = url.trim();
  if (/^https?:\/\//i.test(t)) return t;
  if (/^mailto:/i.test(t)) return t;
  if (/^tel:/i.test(t)) return t;
  return "#";
}

export function hasMarkdown(input: string): boolean {
  if (!input) return false;
  return /(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`|~~[^~\n]+~~|\[[^\]]+\]\([^)]+\)|https?:\/\/\S+|^#{1,6} |^[-*+] |^\d+\. |^> |^---$)/m.test(
    input,
  );
}

type RenderMode = "message" | "composer";

export function renderMarkdown(input: string): string {
  return renderInternal(input, "message");
}

export function renderMarkdownInline(input: string): string {
  return renderInternal(input, "composer");
}

function renderBlocks(text: string): string {
  text = text.replace(
    /^###### (.*)$/gm,
    '<h6 class="my-1 text-[12px] font-semibold uppercase tracking-wider text-ink-mute">$1</h6>',
  );
  text = text.replace(
    /^##### (.*)$/gm,
    '<h5 class="my-1 text-[12.5px] font-semibold text-ink-mute">$1</h5>',
  );
  text = text.replace(
    /^#### (.*)$/gm,
    '<h4 class="my-1 text-[13px] font-semibold text-ink">$1</h4>',
  );
  text = text.replace(
    /^### (.*)$/gm,
    '<h3 class="my-1 text-[14px] font-semibold text-ink">$1</h3>',
  );
  text = text.replace(
    /^## (.*)$/gm,
    '<h2 class="my-1 text-[15px] font-semibold text-ink">$1</h2>',
  );
  text = text.replace(
    /^# (.*)$/gm,
    '<h1 class="my-1 text-[16px] font-bold text-ink">$1</h1>',
  );

  text = text.replace(
    /^(?:---|\*\*\*|___)\s*$/gm,
    '<hr class="my-2 border-t border-line" />',
  );

  text = text.replace(
    /^&gt; ?(.*)$/gm,
    '<span class="my-0.5 block border-l-2 border-ink/30 pl-2 italic text-ink-soft">$1</span>',
  );

  text = text.replace(
    /^[-*+] \[ \] (.*)$/gm,
    '<span class="my-0.5 block pl-4 relative"><span class="absolute left-0">☐</span>$1</span>',
  );
  text = text.replace(
    /^[-*+] \[[xX]\] (.*)$/gm,
    '<span class="my-0.5 block pl-4 relative"><span class="absolute left-0">☑</span>$1</span>',
  );

  text = text.replace(
    /^[-*+] (?!\[[ xX]\] )(.*)$/gm,
    '<span class="my-0.5 block pl-3 relative"><span class="absolute left-0">•</span>$1</span>',
  );

  text = text.replace(
    /^(\d+)\. (.*)$/gm,
    '<span class="my-0.5 block pl-5 relative"><span class="absolute left-0 text-ink-mute tabular-nums">$1.</span>$2</span>',
  );

  return text;
}

function renderInternal(input: string, mode: RenderMode): string {
  if (!input) return "";
  const keepMarkers = mode === "composer";
  const ph: string[] = [];
  const stash = (html: string): string => {
    ph.push(html);
    return `\u0001PH${ph.length - 1}\u0001`;
  };

  let text = escapeHtml(input);

  if (mode === "message") {
    text = text.replace(/```([\w-]*)\n?([\s\S]*?)```/g, (_m, _lang, code) => {
      const clean = code.replace(/\n$/, "");
      return stash(
        `<pre class="my-1 block overflow-x-auto rounded-lg bg-black/10 px-2 py-1.5 font-mono text-[12.5px] leading-[1.5]"><code>${clean}</code></pre>`,
      );
    });
  }

  text = text.replace(/`([^`\n]+)`/g, (_m, code) => {
    if (mode === "composer") return stash(`<span>${code}</span>`);
    return stash(
      `<code class="rounded bg-black/10 px-1 py-0.5 font-mono text-[12.5px]">${code}</code>`,
    );
  });

  if (mode === "message") {
    text = text.replace(
      /!\[([^\]]*)\]\(([^)\s]+)\)/g,
      (_m, alt, url) =>
        stash(
          `<img src="${sanitizeUrl(url)}" alt="${alt}" class="my-1 block max-w-full rounded-lg" />`,
        ),
    );
  }

  text = text.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_m, label, url) => {
      if (mode === "composer") return stash(`<span>${label}</span>`);
      return stash(
        `<a href="${sanitizeUrl(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`,
      );
    },
  );

  text = text.replace(/\b(https?:\/\/[^\s<>"']+)/g, (url) => {
    if (mode === "composer") return stash(`<span>${url}</span>`);
    return stash(
      `<a href="${sanitizeUrl(url)}" target="_blank" rel="noopener noreferrer">${url}</a>`,
    );
  });

  text = text.replace(
    /(^|[^\w*_])(\*\*|__)(?=\S)([^\n]*?\S)\2(?!\w)/g,
    (_m, prefix, marker, content) => {
      const inner = stash(
        marker === "__" ? `<u>${content}</u>` : `<strong>${content}</strong>`,
      );
      if (keepMarkers) return `${prefix}${marker}${inner}${marker}`;
      return `${prefix}${inner}`;
    },
  );

  text = text.replace(
    /(^|[^\w*_])(\*|_)(?=\S)([^*_\n]*?\S)\2(?!\w)/g,
    (_m, prefix, marker, content) => {
      const inner = stash(`<em>${content}</em>`);
      if (keepMarkers) return `${prefix}${marker}${inner}${marker}`;
      return `${prefix}${inner}`;
    },
  );

  text = text.replace(
    /(^|[^\w~])(~~)(?=\S)([^\n]*?\S)\2(?!\w)/g,
    (_m, prefix, marker, content) => {
      const inner = stash(`<s>${content}</s>`);
      if (keepMarkers) return `${prefix}${marker}${inner}${marker}`;
      return `${prefix}${inner}`;
    },
  );

  if (mode === "message") {
    text = renderBlocks(text);
    text = text.replace(/\n/g, "<br>");
  }

  text = text.replace(/\u0001PH(\d+)\u0001/g, (_m, i) => ph[Number(i)] ?? "");

  return text;
}