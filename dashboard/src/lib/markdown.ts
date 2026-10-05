import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("c", c);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("csharp", csharp);
hljs.registerLanguage("css", css);
hljs.registerLanguage("go", go);
hljs.registerLanguage("java", java);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("python", python);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("yaml", yaml);

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

const KEYWORDS: Record<string, Set<string>> = {
  javascript: new Set("async await break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new of return static super switch this throw try typeof var void while yield".split(" ")),
  typescript: new Set("abstract any as asserts async await bigint boolean break case catch class const constructor continue declare default delete do else enum export extends finally for from function if implements import infer instanceof interface is keyof let namespace never new null number object of package private protected public readonly require return static string super switch symbol this throw try type typeof undefined unique unknown var void while yield".split(" ")),
  python: new Set("and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield".split(" ")),
  json: new Set(["true", "false", "null"]),
  bash: new Set("case coproc do done elif else esac fi for function if in select then time until while".split(" ")),
  c: new Set("auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while".split(" ")),
  cpp: new Set("alignas auto bool break case catch char class const constexpr continue decltype default delete do double else enum explicit export extern false float for friend goto if inline int long namespace new nullptr private protected public register return short signed sizeof static struct switch template this throw true try typedef typename union unsigned using virtual void volatile while".split(" ")),
  csharp: new Set("abstract as async await base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using var virtual void volatile while".split(" ")),
  go: new Set("break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var".split(" ")),
  rust: new Set("as async await bool break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while".split(" ")),
  sql: new Set("add all alter as asc begin between by case commit create cross current_date current_time database default delete desc distinct drop else end exists false from full group having in index inner insert into is join key left like limit not null offset on or order outer primary references right rollback select set table then true union unique update values view when where".split(" ")),
};

function normalizedLanguage(language: string): string {
  const normalized = language.toLowerCase();
  if (["js", "jsx", "mjs", "cjs"].includes(normalized)) return "javascript";
  if (["ts", "tsx"].includes(normalized)) return "typescript";
  if (["py", "pyw"].includes(normalized)) return "python";
  if (["sh", "shell", "zsh", "console"].includes(normalized)) return "bash";
  if (["html", "svg"].includes(normalized)) return "xml";
  if (normalized === "cs") return "csharp";
  if (normalized === "golang") return "go";
  if (normalized === "yml") return "yaml";
  return normalized;
}

export function highlightCode(code: string, language: string): string {
  const lang = normalizedLanguage(language);
  const source = code.replace(
    /&(?:amp|lt|gt|quot|#39|#x27);/gi,
    (entity) => {
      switch (entity.toLowerCase()) {
        case "&amp;":
          return "&";
        case "&lt;":
          return "<";
        case "&gt;":
          return ">";
        case "&quot;":
          return '"';
        default:
          return "'";
      }
    },
  );
  if (hljs.getLanguage(lang)) {
    return hljs.highlight(source, { language: lang, ignoreIllegals: true }).value;
  }
  const fallbackKeywords = KEYWORDS[lang];
  if (!fallbackKeywords) return escapeHtml(source);
  return source.replace(/[A-Za-z_$][\w$]*/g, (word) =>
    fallbackKeywords.has(word)
      ? `<span class="chat-token-keyword">${escapeHtml(word)}</span>`
      : escapeHtml(word),
  );
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
    '<hr class="chat-markdown-rule m-0 border-t border-line" />',
  );

  text = text.replace(
    /^&gt; ?(.*)$/gm,
    '<span class="chat-note block border-l-2 border-ink/30 pl-2 italic text-ink-soft">$1</span>',
  );

  text = text.replace(
    /^[-*+] \[ \] (.*)$/gm,
    '<span class="chat-markdown-list-item"><span class="chat-markdown-list-marker">☐</span>&nbsp;$1</span>',
  );
  text = text.replace(
    /^[-*+] \[[xX]\] (.*)$/gm,
    '<span class="chat-markdown-list-item"><span class="chat-markdown-list-marker">☑</span>&nbsp;$1</span>',
  );

  text = text.replace(
    /^[-*+] (?!\[[ xX]\] )(.*)$/gm,
    '<span class="chat-markdown-list-item"><span class="chat-markdown-list-marker">•</span>&nbsp;$1</span>',
  );

  text = text.replace(
    /^(\d+)\. (.*)$/gm,
    '<span class="chat-markdown-list-item"><span class="chat-markdown-list-marker text-ink-mute tabular-nums">$1.</span>&nbsp;$2</span>',
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

  let text = escapeHtml(input.replace(/&nbsp;/gi, "\u00a0"));

  if (mode === "message") {
    text = text.replace(/```([\w+-]*)[ \t]*\n([\s\S]*?)```/g, (_m, lang, code) => {
      const clean = code.replace(/\n$/, "");
      const safeLanguage = /^[A-Za-z0-9_+-]+$/.test(lang) ? lang : "";
      const header = `<div class="chat-code-header"><span class="chat-code-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="chat-code-language">${safeLanguage}</span></div>`;
      return stash(
        `<div class="chat-code-block">${header}<pre class="my-0 block overflow-x-auto font-mono"><code>${highlightCode(clean, safeLanguage)}</code></pre></div>`,
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
          `<img src="${sanitizeUrl(url)}" alt="${alt}" class="inline-block max-w-full rounded-lg align-middle" />`,
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

  if (mode === "message") {
    const removeStructuralBreak = (breaks: string) =>
      "<br>".repeat(Math.max(0, breaks.length / 4 - 1));
    text = text.replace(
      /((?:<br>)*)<div class="chat-code-block">([\s\S]*?<\/pre><\/div>)((?:<br>)*)/g,
      (_match, before: string, block: string, after: string) =>
        `${removeStructuralBreak(before)}<div class="chat-code-block">${block}${removeStructuralBreak(after)}`,
    );
    text = text.replace(
      /((?:<br>)*)<hr class="chat-markdown-rule m-0 border-t border-line" \/>((?:<br>)*)/g,
      (_match, before: string, after: string) =>
        `${removeStructuralBreak(before)}<hr class="chat-markdown-rule m-0 border-t border-line" />${removeStructuralBreak(after)}`,
    );
  }

  return text;
}
