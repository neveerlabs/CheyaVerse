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
    '<h6 class="text-[12px] font-semibold uppercase tracking-wider text-ink-mute">$1</h6>',
  );
  text = text.replace(
    /^##### (.*)$/gm,
    '<h5 class="text-[12.5px] font-semibold text-ink-mute">$1</h5>',
  );
  text = text.replace(
    /^#### (.*)$/gm,
    '<h4 class="text-[13px] font-semibold text-ink">$1</h4>',
  );
  text = text.replace(
    /^### (.*)$/gm,
    '<h3 class="text-[14px] font-semibold text-ink">$1</h3>',
  );
  text = text.replace(
    /^## (.*)$/gm,
    '<h2 class="text-[15px] font-semibold text-ink">$1</h2>',
  );
  text = text.replace(
    /^# (.*)$/gm,
    '<h1 class="text-[16px] font-bold text-ink">$1</h1>',
  );

  text = text.replace(
    /^(?:---|\*\*\*|___)\s*$/gm,
    '<hr class="my-2 border-t border-line" />',
  );

  text = text.replace(
    /^&gt; ?(.*)$/gm,
    '<span class="chat-note block border-l-2 border-ink/30 pl-2 italic text-ink-soft">$1</span>',
  );

  text = text.replace(
    /^[-*+] \[ \] (.*)$/gm,
    '<span class="block pl-4 relative"><span class="absolute left-0">☐</span>$1</span>',
  );
  text = text.replace(
    /^[-*+] \[[xX]\] (.*)$/gm,
    '<span class="block pl-4 relative"><span class="absolute left-0">☑</span>$1</span>',
  );

  text = text.replace(
    /^[-*+] (?!\[[ xX]\] )(.*)$/gm,
    '<span class="chat-markdown-list-item block pl-3 relative"><span class="absolute left-0">•</span>$1</span>',
  );

  text = text.replace(
    /^(\d+)\. (.*)$/gm,
    '<span class="chat-markdown-list-item block pl-5 relative"><span class="absolute left-0 text-ink-mute tabular-nums">$1.</span>$2</span>',
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
    text = text.replace(/```([\w+-]*)[ \t]*\n([\s\S]*?)```/g, (_m, lang, code) => {
      const clean = code.replace(/\n$/, "");
      const safeLanguage = /^[A-Za-z0-9_+-]+$/.test(lang) ? lang : "";
      const header = `<div class="chat-code-header">${safeLanguage ? `<span class="chat-code-language">${safeLanguage}</span>` : "<span></span>"}<button type="button" class="chat-code-copy" aria-label="Salin kode" title="Salin kode" data-code-copy><svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg><svg class="chat-code-check" aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="m5 12 4 4L19 6"/></svg><svg class="chat-code-error" aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>`;
      return stash(
        `<div class="chat-code-block">${header}<pre class="my-0 block overflow-x-auto font-mono"><code>${clean}</code></pre></div>`,
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
    text = text.replace(
      /^([ \t]*[-*+] (?:\[[ xX]\] )?[^\n]+)\n(?:[ \t]*\n)+(?=[ \t]*[-*+] )/gm,
      "$1\n",
    );
    text = renderBlocks(text);
    text = text.replace(/\n/g, "<br>");
    text = text.replace(
      /(<span class="chat-markdown-list-item[^"]*">[\s\S]*?<\/span>)(?:<br>)+(?=<span class="chat-markdown-list-item)/g,
      "$1",
    );
  }

  text = text.replace(/\u0001PH(\d+)\u0001/g, (_m, i) => ph[Number(i)] ?? "");

  return text;
}