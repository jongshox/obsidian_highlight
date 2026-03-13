const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");

const { createPlugin, highlightSnippet } = require("./plugin-harness");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function lineStart(source, lineText) {
  const start = source.indexOf(lineText);
  assert.notEqual(start, -1, `Missing line: ${lineText.slice(0, 60)}`);
  return start;
}

function buildDeepTextNode(sourcePos, depth = 10) {
  let current = {
    nodeType: 1,
    parentElement: null,
    getAttribute(name) {
      return name === "data-sourcepos" ? sourcePos : null;
    },
  };

  for (let i = 0; i < depth; i++) {
    current = {
      nodeType: 1,
      parentElement: current,
      getAttribute() {
        return null;
      },
    };
  }

  return {
    nodeType: 3,
    parentElement: current,
  };
}

test("keeps inline markdown valid for synthetic selections", () => {
  const plugin = createPlugin();

  assert.equal(
    highlightSnippet(plugin, "This is **bold** text", "bold"),
    "This is **==bold==** text"
  );

  assert.equal(
    highlightSnippet(plugin, "This is **bold** text", "bold text"),
    "This is ==**bold** text=="
  );

  assert.equal(
    highlightSnippet(plugin, "Use `code` sample", "code"),
    "Use ==`code`== sample"
  );

  assert.equal(
    highlightSnippet(plugin, "Try [[create a link]] now", "create a link"),
    "Try ==[[create a link]]== now"
  );

  assert.equal(
    highlightSnippet(plugin, "Try [the Importer](https://help.obsidian.md/Plugins/Importer) now", "the Importer"),
    "Try ==[the Importer](https://help.obsidian.md/Plugins/Importer)== now"
  );
});

test("handles real welcome note link selections from C drive vault", () => {
  const plugin = createPlugin();
  const filePath = "/mnt/c/obsidian/PSY Books/Welcome.md";
  const source = read(filePath);
  const targetLine =
    "Make a note of something, [[create a link]], or try [the Importer](https://help.obsidian.md/Plugins/Importer)!";
  const roughStart = lineStart(source, targetLine);

  assert.equal(
    highlightSnippet(plugin, source, "create a link", roughStart, roughStart),
    source.replace("[[create a link]]", "==[[create a link]]==")
  );

  assert.equal(
    highlightSnippet(plugin, source, "the Importer", roughStart, roughStart),
    source.replace(
      "[the Importer](https://help.obsidian.md/Plugins/Importer)",
      "==[the Importer](https://help.obsidian.md/Plugins/Importer)=="
    )
  );
});

test("handles real mixed anchor and markdown-link selections from C drive vault", () => {
  const plugin = createPlugin();
  const filePath =
    "/mnt/c/obsidian/PSY Books/094_Symptoms_and_Circuits_ADHD_as_a_Disorder_of_the_Prefrontal_Cortex_ko.md";
  const source = read(filePath);
  const rawSegment =
    '[Figures 11-2](#FIGm-fig-486)부터 <a id="FIGm-fig-492-back"></a>[11-8](#FIGm-fig-492)까지';
  const roughStart = lineStart(source, rawSegment);

  assert.equal(
    highlightSnippet(plugin, source, "Figures 11-2부터 11-8까지", roughStart, roughStart),
    source.replace(rawSegment, `==${rawSegment}==`)
  );
});

test("uses sourcepos-scoped block ranges when duplicate text appears in the file", () => {
  const plugin = createPlugin();
  const filePath =
    "/mnt/c/obsidian/PSY Books/books/the-neuroscience-of-clinical-psychiatry/chapters_ko/ch339__23-anxiety.md";
  const source = read(filePath);
  const line60 = source.split("\n")[59];
  const line60Start = lineStart(source, line60);
  const snippet = "PTSD에 어느 정도 영향력이 있지만, 세부 사항은 여전히 불명확하다는 것이다";
  const expectedStart = source.indexOf(snippet, line60Start);
  const expectedEnd = expectedStart + snippet.length;
  const sourcePos = `60:1-60:${line60.length}`;
  const anchorNode = buildDeepTextNode(sourcePos, 10);
  const focusNode = buildDeepTextNode(sourcePos, 12);
  const range = plugin.resolveSelectionRange(source, snippet, anchorNode, focusNode, null, null);

  assert.ok(range);
  assert.equal(range[0], expectedStart);
  assert.equal(range[1], expectedEnd);
});

test("handles real emphasis boundary crossings from C drive vault", () => {
  const plugin = createPlugin();
  const filePath =
    "/mnt/c/obsidian/PSY Books/books/kaplan-sadock-s-synopsis-of-psychiatry/chapters/ch597__functional-neuroanatomy.md";
  const source = read(filePath);
  const rawLine =
    "**Somatosensory System.** The *somatosensory system,* an intricate array of parallel point-to-point connections from the body surface to the brain, was the first sensory system to be understood in anatomical detail. The six somatosensory modalities are light touch, pressure, pain, temperature, vibration, and proprioception (position sense). The organization of nerve bundles and synaptic connections in the somatosensory system encodes spatial relationships at all levels so that the organization is strictly *somatotopic* ([Fig. 33-1](#ff33-1)).";
  const roughStart = lineStart(source, rawLine);

  assert.equal(
    highlightSnippet(plugin, source, "Somatosensory System.", roughStart, roughStart),
    source.replace("**Somatosensory System.**", "**==Somatosensory System.==**")
  );

  assert.equal(
    highlightSnippet(
      plugin,
      source,
      "Somatosensory System. The somatosensory system,",
      roughStart,
      roughStart
    ),
    source.replace(
      "**Somatosensory System.** The *somatosensory system,*",
      "==**Somatosensory System.** The *somatosensory system,*=="
    )
  );
});
