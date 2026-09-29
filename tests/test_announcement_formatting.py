import ast
import html
import re
import unittest
from types import SimpleNamespace
from pathlib import Path


SOURCE = Path(__file__).resolve().parents[1] / "handlers" / "announcement.py"
TREE = ast.parse(SOURCE.read_text(encoding="utf-8"))
FUNCTIONS = [
    node
    for node in TREE.body
    if isinstance(node, ast.FunctionDef)
    and node.name
    in {
        "_announcement_body",
        "_announcement_plain_text",
        "_render_markdown_inline",
        "_render_markdown",
    }
]
NAMESPACE = {"html": html, "re": re, "Message": object}
exec(compile(ast.Module(body=FUNCTIONS, type_ignores=[]), str(SOURCE), "exec"), NAMESPACE)
render_markdown = NAMESPACE["_render_markdown"]
announcement_body = NAMESPACE["_announcement_body"]
announcement_plain_text = NAMESPACE["_announcement_plain_text"]


class AnnouncementFormattingTests(unittest.TestCase):
    def test_preserves_bold_and_italic_without_formatting_underline_or_inline_code(self):
        rendered = render_markdown(
            "**bold** *also bold* _italic_ __not underline__ `not code`"
        )

        self.assertEqual(
            rendered,
            "<b>bold</b> <b>also bold</b> <i>italic</i> "
            "__not underline__ `not code`",
        )

    def test_renders_escaped_fenced_code_for_telegram_and_web(self):
        rendered = render_markdown("```python\nif a < b:\n    print('&')\n```")

        self.assertEqual(
            rendered,
            '<pre><code class="language-python">if a &lt; b:\n'
            "    print('&amp;')"
            "</code></pre>",
        )
        self.assertNotIn("<b>python</b>", rendered)

    def test_preserves_line_breaks_and_blank_lines_around_lists(self):
        source = "Before\n\n- **one**\n- _two_\n\n\nAfter\n"

        self.assertEqual(
            render_markdown(source),
            "Before\n\n• <b>one</b>\n• <i>two</i>\n\n\nAfter\n",
        )

    def test_keeps_blank_lines_within_and_after_code_blocks(self):
        source = "```text\nfirst\n\nlast\n```\n\n- item\n\n"

        self.assertEqual(
            render_markdown(source),
            '<pre><code class="language-text">first\n\nlast'
            "</code></pre>\n\n• item\n\n",
        )

    def test_renders_unlabelled_fenced_code_and_escapes_html(self):
        rendered = render_markdown("```\n<script>&\n```")

        self.assertEqual(
            rendered,
            "<pre><code>&lt;script&gt;&amp;</code></pre>",
        )
        self.assertNotIn("<br>", rendered)

    def test_preserves_safe_bold_html_and_escapes_other_html(self):
        rendered = render_markdown("<b>bold</b> <script>alert(1)</script>")

        self.assertEqual(
            rendered,
            "<b>bold</b> &lt;script&gt;alert(1)&lt;/script&gt;",
        )

    def test_formats_telegram_bold_entities_in_command_body(self):
        source = "/pesan 😀 bold"
        start = len(source[: source.index("bold")].encode("utf-16-le")) // 2
        entity = SimpleNamespace(type="bold", offset=start, length=4)
        message = SimpleNamespace(
            caption=None,
            text=source,
            entities=[entity],
            caption_entities=[],
        )

        self.assertEqual(
            render_markdown(announcement_body(message, "😀 bold")),
            "😀 <b>bold</b>",
        )

    def test_formats_telegram_pre_entity_as_a_language_code_block(self):
        source = "/pesan print('<')"
        start = len(source[: source.index("print")].encode("utf-16-le")) // 2
        entity = SimpleNamespace(
            type="pre",
            offset=start,
            length=len("print('<')"),
            language="python",
        )
        message = SimpleNamespace(
            caption=None,
            text=source,
            entities=[entity],
            caption_entities=[],
        )

        self.assertEqual(
            render_markdown(announcement_body(message, "print('<')")),
            '<pre><code class="language-python">'
            "print('&lt;')</code></pre>",
        )

    def test_plain_text_removes_formatting_tags_for_notifications(self):
        self.assertEqual(
            announcement_plain_text(
                "<b>Bold</b> <i>italic</i>\n"
                '<pre><code class="language-python">print(1)</code></pre>'
            ),
            "Bold italic\nprint(1)",
        )


if __name__ == "__main__":
    unittest.main()
