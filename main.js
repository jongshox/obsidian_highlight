/* eslint-disable no-undef */
const { Plugin, MarkdownView, Notice, Platform, setIcon } = require("obsidian");

class ReadingHighlighterPlugin extends Plugin {
  floatingButtonEl = null;
  boundHandleSelectionChange = null;
  floatingButtonMode = "highlight";
  pendingRemoveMarkEl = null;

  onload() {
    /*── 명령어 팔레트에 명령 추가 ──*/
    this.addCommand({
      id: "highlight-selection-reading",
      name: "읽기 모드에서 선택 영역 하이라이트",
      hotkeys: [{ modifiers: ["Shift"], key: "H" }],
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view || view.getMode() !== "preview") return false;
        if (checking) return true;
        this.highlightSelection(view);
        return true;
      },
    });

    /*── 리본 아이콘 (모바일 전용) ──*/
    if (Platform.isMobile) {
      const btn = this.addRibbonIcon("highlighter", "선택 영역 하이라이트", () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view && view.getMode() === "preview") this.highlightSelection(view);
        else new Notice("먼저 노트를 읽기 모드로 열어주세요.");
      });
      this.register(() => btn.remove());
    }

    /*── 플로팅 버튼 초기화 ──*/
    this.createFloatingButton();
    this.boundHandleSelectionChange = this.handleSelectionChange.bind(this);
    this.registerDomEvent(document, "selectionchange", this.boundHandleSelectionChange);
    this.registerDomEvent(document, "click", this.handleDocumentClick.bind(this));

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        // 활성 탭이 변경될 때 버튼 상태 업데이트
        this.pendingRemoveMarkEl = null;
        this.handleSelectionChange();
      })
    );
    // 플러그인 로드 시 기존 선택 영역 확인
    this.handleSelectionChange();
  }

  onunload() {
    // Obsidian이 registerDomEvent 및 registerEvent로 등록된 이벤트를 자동으로 해제함
    if (this.floatingButtonEl) {
      this.floatingButtonEl.remove();
      this.floatingButtonEl = null;
    }
  }

  createFloatingButton() {
    if (this.floatingButtonEl) return;

    this.floatingButtonEl = document.createElement("button");
    setIcon(this.floatingButtonEl, "highlighter");
    this.floatingButtonEl.setAttribute("aria-label", "선택 영역 하이라이트");
    this.floatingButtonEl.addClass("reading-highlighter-float-btn");
    this.setFloatingButtonMode("highlight");

    // 버튼 클릭 시 텍스트 선택이 해제되지 않도록 mousedown 기본 동작 차단
    this.registerDomEvent(this.floatingButtonEl, "mousedown", (evt) => {
      evt.preventDefault();
    });

    this.registerDomEvent(this.floatingButtonEl, "click", async () => {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (view && view.getMode() === "preview") {
        if (this.floatingButtonMode === "remove") {
          await this.removeClickedHighlight(view);
        } else {
          await this.highlightSelection(view);
        }
      }
      this.hideFloatingButton(); // 클릭 후 버튼 숨김
    });

    document.body.appendChild(this.floatingButtonEl);
  }

  handleSelectionChange() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || view.getMode() !== "preview") {
      this.pendingRemoveMarkEl = null;
      this.hideFloatingButton();
      return;
    }

    const sel = document.getSelection();
    if (this.isSelectionInActiveView(sel, view)) {
      this.pendingRemoveMarkEl = null;
      this.setFloatingButtonMode("highlight");
      this.showFloatingButton();
      return;
    }

    if (this.hasValidRemoveTarget(view)) {
      this.setFloatingButtonMode("remove");
      this.showFloatingButton();
      return;
    }

    this.hideFloatingButton();
  }

  handleDocumentClick(evt) {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || view.getMode() !== "preview") {
      this.pendingRemoveMarkEl = null;
      this.hideFloatingButton();
      return;
    }

    const target =
      evt.target instanceof Element ? evt.target : evt.target?.parentElement ?? null;
    if (!target) return;
    if (this.floatingButtonEl?.contains(target)) return;

    const markEl = target.closest("mark");
    if (markEl && view.containerEl.contains(markEl)) {
      const snippet = this.normalizeSpaces(markEl.textContent ?? "");
      if (!snippet) return;
      this.pendingRemoveMarkEl = markEl;
      const sel = document.getSelection();
      if (sel && !sel.isCollapsed) sel.removeAllRanges();
      this.setFloatingButtonMode("remove");
      this.showFloatingButton();
      return;
    }

    this.pendingRemoveMarkEl = null;
    this.handleSelectionChange();
  }

  isSelectionInActiveView(sel, view) {
    if (!sel || sel.isCollapsed) return false;

    const snippet = this.normalizeSpaces(sel.toString());
    if (!snippet) return false;

    const anchorNode = sel.anchorNode;
    const focusNode = sel.focusNode;
    if (!anchorNode || !focusNode) return false;

    return view.containerEl.contains(anchorNode) && view.containerEl.contains(focusNode);
  }

  hasValidRemoveTarget(view) {
    if (!this.pendingRemoveMarkEl) return false;
    if (!this.pendingRemoveMarkEl.isConnected) {
      this.pendingRemoveMarkEl = null;
      return false;
    }
    if (!view.containerEl.contains(this.pendingRemoveMarkEl)) {
      this.pendingRemoveMarkEl = null;
      return false;
    }
    if (!this.normalizeSpaces(this.pendingRemoveMarkEl.textContent ?? "")) {
      this.pendingRemoveMarkEl = null;
      return false;
    }
    return true;
  }

  setFloatingButtonMode(mode) {
    if (!this.floatingButtonEl) return;

    this.floatingButtonMode = mode;
    this.floatingButtonEl.classList.toggle("is-remove", mode === "remove");
    this.floatingButtonEl.innerHTML = "";

    if (mode === "remove") {
      setIcon(this.floatingButtonEl, "trash-2");
      this.floatingButtonEl.setAttribute("aria-label", "선택한 하이라이트 지우기");
      this.floatingButtonEl.setAttribute("title", "하이라이트 지우기");
    } else {
      setIcon(this.floatingButtonEl, "highlighter");
      this.floatingButtonEl.setAttribute("aria-label", "선택 영역 하이라이트");
      this.floatingButtonEl.setAttribute("title", "선택 영역 하이라이트");
    }
  }

  showFloatingButton() {
    if (this.floatingButtonEl) {
      this.floatingButtonEl.classList.add("is-visible");
    }
  }

  hideFloatingButton() {
    if (this.floatingButtonEl) {
      this.floatingButtonEl.classList.remove("is-visible");
    }
  }

  /*───────────────── 핵심 하이라이트 로직 ─────────────────*/
  async highlightSelection(view) {
    const sel = document.getSelection();
    const snippet = sel?.toString() ?? "";
    if (!snippet.trim()) {
      new Notice("먼저 텍스트를 선택하세요 — 선택된 내용이 없습니다.");
      return;
    }

    /* 1. 현재 스크롤 위치 저장 */
    const scrollBefore = this.getScroll(view);

    /* 2. 파일 원본 텍스트 읽기 */
    const file = view.file;
    const raw = await this.app.vault.read(file);

    /* 3. 선택 영역의 소스 위치 찾기 */
    const sourceRange = this.resolveSelectionRange(raw, snippet, sel);
    if (!sourceRange) {
      new Notice("파일에서 선택 영역의 위치를 찾을 수 없습니다.");
      return;
    }
    let [a_orig, b_orig] = sourceRange;

    let currentA = a_orig;
    let currentB = b_orig;
    let textToHighlight = raw.slice(currentA, currentB);
    const textBeforeSelection = raw.slice(0, currentA);

    // 가장 긴 것부터 순서대로 확인할 마크다운 인라인 서식 접두사 목록
    // (선택 시작 바로 앞에 서식 기호가 있는 경우 처리)
    const markdownPrefixes = [
        { md: "***" },
        { md: "___" },
        { md: "**" },
        { md: "__" },
        { md: "*" },
        { md: "_" },
        { md: "`" }
    ];

    for (const prefixDef of markdownPrefixes) {
        if (textBeforeSelection.endsWith(prefixDef.md)) {
            // 하이라이트할 텍스트 앞에 서식 기호를 포함하고
            // 시작 위치 currentA를 앞으로 조정
            textToHighlight = prefixDef.md + textToHighlight;
            currentA = Math.max(0, currentA - prefixDef.md.length);
            // 해당 접두사를 찾았으면 중단 (더 짧은 패턴이 중복 적용되지 않도록)
            break;
        }
    }

    if (this.overlapsProtectedRange(raw, currentA, currentB)) {
      new Notice("코드 블록 또는 frontmatter 내부는 하이라이트할 수 없습니다.");
      return;
    }

    /* 4. 선택된 텍스트를 단락별로 처리하여 하이라이트 추가 */
    const updatedText = this.addHighlightsByParagraph(textToHighlight);

    /* 5. 파일에서 해당 범위를 교체하여 저장 */
    const updated = raw.slice(0, currentA) + updatedText + raw.slice(currentB);
    await this.app.vault.modify(file, updated);

    /* 6. 스크롤 위치 복원 (두 번 적용하여 안정적으로 복원) */
    const restore = () => this.applyScroll(view, scrollBefore);
    requestAnimationFrame(() => {
      restore();
      setTimeout(restore, 50);
    });

    sel?.removeAllRanges();
  }

  async removeClickedHighlight(view) {
    if (!this.hasValidRemoveTarget(view)) {
      new Notice("지울 하이라이트를 다시 클릭해주세요.");
      return;
    }

    const markEl = this.pendingRemoveMarkEl;
    const snippet = this.normalizeSpaces(markEl?.textContent ?? "");
    if (!snippet) {
      new Notice("지울 하이라이트 텍스트를 찾을 수 없습니다.");
      return;
    }

    const scrollBefore = this.getScroll(view);
    const file = view.file;
    const raw = await this.app.vault.read(file);

    const wrapperRange = this.resolveHighlightWrapperRange(raw, markEl, snippet);
    if (!wrapperRange) {
      new Notice("원본에서 하이라이트 위치를 찾을 수 없습니다.");
      return;
    }

    const [wrapperStart, wrapperEnd] = wrapperRange;
    if (
      wrapperEnd - wrapperStart < 4 ||
      raw.slice(wrapperStart, wrapperStart + 2) !== "==" ||
      raw.slice(wrapperEnd - 2, wrapperEnd) !== "=="
    ) {
      new Notice("하이라이트 형식이 예상과 달라 삭제할 수 없습니다.");
      return;
    }

    const unwrapped = raw.slice(wrapperStart + 2, wrapperEnd - 2);
    const updated = raw.slice(0, wrapperStart) + unwrapped + raw.slice(wrapperEnd);
    await this.app.vault.modify(file, updated);

    const restore = () => this.applyScroll(view, scrollBefore);
    requestAnimationFrame(() => {
      restore();
      setTimeout(restore, 50);
    });

    this.pendingRemoveMarkEl = null;
    document.getSelection()?.removeAllRanges();
  }

  resolveHighlightWrapperRange(source, markEl, snippet) {
    const scopedRange = this.sourceRangeViaSourcePos(markEl, source);
    if (scopedRange) {
      const scopedMatch = this.findUniqueHighlightWrapper(
        source,
        snippet,
        scopedRange[0],
        scopedRange[1]
      );
      if (scopedMatch) return scopedMatch;
    }

    return this.findUniqueHighlightWrapper(source, snippet, 0, source.length);
  }

  findUniqueHighlightWrapper(source, snippet, from, to) {
    const normalizedSnippet = this.normalizeSpaces(snippet);
    if (!normalizedSnippet || from < 0 || to > source.length || from >= to) return null;

    const segment = source.slice(from, to);
    const regex = /==([\s\S]*?)==/g;
    const candidates = [];

    let match;
    while ((match = regex.exec(segment)) !== null) {
      const rendered = this.createPositionMap(match[1]).renderedText;
      if (this.normalizeSpaces(rendered) !== normalizedSnippet) continue;

      const start = from + match.index;
      candidates.push([start, start + match[0].length]);
    }

    return candidates.length === 1 ? candidates[0] : null;
  }

  sourceRangeViaSourcePos(node, source) {
    if (!node) return null;

    let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    let depth = 0;
    while (el && !el.getAttribute("data-sourcepos") && depth < 8) {
      el = el.parentElement;
      depth++;
    }

    const attr = el?.getAttribute("data-sourcepos");
    if (!attr) return null;

    const parsed = attr.match(/^(\d+):(\d+)-(\d+):(\d+)$/);
    if (!parsed) return null;

    const startLine = Number(parsed[1]);
    const startCol = Number(parsed[2]);
    const endLine = Number(parsed[3]);
    const endCol = Number(parsed[4]);

    const start = this.offsetFromLineCol(source, startLine, startCol);
    const endInclusive = this.offsetFromLineCol(source, endLine, endCol);
    if (start == null || endInclusive == null || endInclusive < start) return null;

    return [start, Math.min(source.length, endInclusive + 1)];
  }

  offsetFromLineCol(source, line, col) {
    if (!Number.isInteger(line) || !Number.isInteger(col) || line < 1 || col < 1) return null;

    const lines = source.split("\n");
    if (line > lines.length) return null;

    let offset = 0;
    for (let i = 0; i < line - 1; i++) {
      offset += lines[i].length + 1;
    }

    const lineText = lines[line - 1] ?? "";
    const clampedCol = Math.min(col - 1, lineText.length);
    return offset + clampedCol;
  }

  /*────────── 선택 범위 결정/검증 ──────────*/
  resolveSelectionRange(raw, snippet, sel) {
    const a1 = this.posViaSourcePos(sel?.anchorNode);
    const b1 = this.posViaSourcePos(sel?.focusNode);

    if (a1 != null && b1 != null) {
      const roughStart = Math.min(a1, b1);
      const roughEnd = Math.max(a1, b1);
      const refined = this.refineRangeWithinBounds(raw, snippet, roughStart, roughEnd);
      if (refined) return refined;

      // 엄격 매칭 실패 시, sourcepos 기반 범위를 완화 조건으로 허용
      const roughText = raw.slice(roughStart, roughEnd);
      if (this.selectionCouldMapToRange(roughText, snippet)) {
        return [roughStart, roughEnd];
      }
    }

    const fallback = this.findMatchWithLinks(raw, snippet);
    if (fallback[0] == null || fallback[1] == null) return null;
    return fallback;
  }

  refineRangeWithinBounds(raw, snippet, start, end) {
    if (start < 0 || end > raw.length || start >= end) return null;

    const fragment = raw.slice(start, end);
    const localMatch = this.findMatchWithLinks(fragment, snippet);
    if (localMatch[0] == null || localMatch[1] == null) return null;

    const candidateStart = start + localMatch[0];
    const candidateEnd = start + localMatch[1];
    const candidateText = raw.slice(candidateStart, candidateEnd);
    if (!this.selectionMatchesRange(candidateText, snippet)) return null;

    return [candidateStart, candidateEnd];
  }

  selectionMatchesRange(sourceRangeText, snippet) {
    const normalizedSnippet = this.normalizeSpaces(snippet);
    if (!normalizedSnippet) return false;

    const renderedText = this.createPositionMap(sourceRangeText).renderedText;
    const normalizedRendered = this.normalizeSpaces(renderedText);
    return normalizedRendered === normalizedSnippet;
  }

  selectionCouldMapToRange(sourceRangeText, snippet) {
    const normalizedSnippet = this.normalizeSpaces(snippet);
    if (!normalizedSnippet) return false;

    const renderedText = this.createPositionMap(sourceRangeText).renderedText;
    const normalizedRendered = this.normalizeSpaces(renderedText);
    if (!normalizedRendered) return false;

    if (normalizedRendered === normalizedSnippet) return true;
    if (normalizedRendered.includes(normalizedSnippet)) return true;
    if (normalizedSnippet.includes(normalizedRendered)) return true;
    return false;
  }

  normalizeSpaces(text) {
    return (text ?? "").replace(/\s+/g, " ").trim();
  }

  /*────────── 보호 구간(frontmatter/code fence) 검사 ──────────*/
  overlapsProtectedRange(source, start, end) {
    const protectedRanges = this.findProtectedRanges(source);
    return protectedRanges.some(
      ([rangeStart, rangeEnd]) => start < rangeEnd && end > rangeStart
    );
  }

  findProtectedRanges(source) {
    return [
      ...this.findFrontmatterRange(source),
      ...this.findFencedCodeRanges(source),
    ];
  }

  findFrontmatterRange(source) {
    const lines = source.split("\n");
    if (lines.length === 0 || lines[0].trim() !== "---") return [];

    let offset = lines[0].length + (lines.length > 1 ? 1 : 0);
    for (let i = 1; i < lines.length; i++) {
      const hasNewline = i < lines.length - 1;
      const lineLength = lines[i].length + (hasNewline ? 1 : 0);
      const trimmed = lines[i].trim();

      if (trimmed === "---" || trimmed === "...") {
        return [[0, offset + lineLength]];
      }

      offset += lineLength;
    }

    return [];
  }

  findFencedCodeRanges(source) {
    const lines = source.split("\n");
    const ranges = [];
    let offset = 0;
    let openFence = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const hasNewline = i < lines.length - 1;
      const lineStart = offset;
      const lineEnd = lineStart + line.length + (hasNewline ? 1 : 0);
      const trimmed = line.trimStart();

      if (!openFence) {
        const openMatch = trimmed.match(/^(`{3,}|~{3,})/);
        if (openMatch) {
          openFence = {
            marker: openMatch[1][0],
            length: openMatch[1].length,
            start: lineStart,
          };
        }
      } else {
        const closeMatch = trimmed.match(/^(`{3,}|~{3,})\s*$/);
        if (
          closeMatch &&
          closeMatch[1][0] === openFence.marker &&
          closeMatch[1].length >= openFence.length
        ) {
          ranges.push([openFence.start, lineEnd]);
          openFence = null;
        }
      }

      offset = lineEnd;
    }

    if (openFence) {
      ranges.push([openFence.start, source.length]);
    }

    return ranges;
  }

  /*────────── 단락별 하이라이트 추가 ──────────*/
  addHighlightsByParagraph(text) {
    // 빈 줄(단락 구분)로 텍스트 분리
    const paragraphs = text.split(/\n\s*\n/);

    if (paragraphs.length === 1) {
      // 단일 단락인 경우, 단순 줄바꿈으로 분리
      const lines = text.split('\n');
      if (lines.length === 1) {
        // 단일 줄: 단순 하이라이트 처리
        return this.addHighlightToLine(text);
      } else {
        // 같은 단락 내 여러 줄
        return lines.map(line => {
          // 공백만 있는 줄은 건너뜀
          return line.trim() ? this.addHighlightToLine(line) : line;
        }).join('\n');
      }
    } else {
      // 여러 단락
      return paragraphs.map(paragraph => {
        if (!paragraph.trim()) return paragraph;

        // 각 단락을 줄 단위로 처리
        const lines = paragraph.split('\n');
        return lines.map(line => {
          return line.trim() ? this.addHighlightToLine(line) : line;
        }).join('\n');
      }).join('\n\n');
    }
  }

  /*────────── 개별 줄에 하이라이트 추가 ──────────*/
  addHighlightToLine(line) {
    // 앞쪽 공백(들여쓰기) 보존
    const leadingSpaces = line.match(/^(\s*)/)[1];
    const trimmedLine = line.trim();

    if (!trimmedLine) return line;

    // ── 하이라이트하면 안 되는 줄 ──────────────────────

    // 이미지 줄: ![alt](url)
    if (/^!\[/.test(trimmedLine)) return line;

    // HTML 태그 줄: <tag>, <!-- comment -->, <a id="..."> 등
    if (/^</.test(trimmedLine)) return line;

    // 수평선: ---, ***, ___ (3개 이상 반복, 다른 내용 없음)
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(trimmedLine)) return line;

    // 테이블 행: | cell | cell | 또는 |---|---|
    if (/^\|/.test(trimmedLine)) return line;

    // 이미 하이라이트된 줄: ==...==
    if (/^==[\s\S]*==$/.test(trimmedLine)) return line;

    // ── 마크다운 접두사를 보존해야 하는 줄 ─────────────

    // 인용문(blockquote): > 또는 >> 등
    // 재귀적으로 처리하여 중첩 인용문도 지원
    const blockquoteMatch = trimmedLine.match(/^(>+\s*)([\s\S]*)/);
    if (blockquoteMatch) {
      const prefix = blockquoteMatch[1];
      const content = blockquoteMatch[2];
      if (!content.trim()) return line; // 내용 없는 인용문 줄은 그대로
      // 인용문 내용에 재귀적으로 하이라이트 적용
      const highlightedContent = this.addHighlightToLine(content);
      return leadingSpaces + prefix + highlightedContent;
    }

    // 순서 없는 목록: - item, * item, + item
    // (* 뒤에 공백이 있어야 목록으로 인식, 이탤릭 *text*와 구분)
    const unorderedListMatch = trimmedLine.match(/^([-*+]\s+)([\s\S]*)/);
    if (unorderedListMatch) {
      const marker = unorderedListMatch[1];
      const content = unorderedListMatch[2];
      if (!content.trim()) return line; // 내용 없는 목록 항목은 그대로
      if (/^==[\s\S]*==$/.test(content.trim())) return line; // 이미 하이라이트됨
      return leadingSpaces + marker + '==' + content + '==';
    }

    // 순서 있는 목록: 1. item, 2. item 등
    const orderedListMatch = trimmedLine.match(/^(\d+\.\s+)([\s\S]*)/);
    if (orderedListMatch) {
      const marker = orderedListMatch[1];
      const content = orderedListMatch[2];
      if (!content.trim()) return line; // 내용 없는 목록 항목은 그대로
      if (/^==[\s\S]*==$/.test(content.trim())) return line; // 이미 하이라이트됨
      return leadingSpaces + marker + '==' + content + '==';
    }

    // 헤더: # ## ### #### ##### ######
    const headerMatch = trimmedLine.match(/^(#{1,6}\s+)([\s\S]*)/);
    if (headerMatch) {
      const prefix = headerMatch[1];
      const content = headerMatch[2];
      if (!content.trim()) return line; // 내용 없는 헤더는 그대로
      if (/^==[\s\S]*==$/.test(content.trim())) return line; // 이미 하이라이트됨
      return leadingSpaces + prefix + '==' + content + '==';
    }

    // ── 일반 줄 또는 인라인 마크다운(**굵게**, *이탤릭*, `코드` 등) ──
    return leadingSpaces + '==' + trimmedLine + '==';
  }

  /*────────── 스크롤 관련 헬퍼 함수 ──────────*/
  getScroll(view) {
    return typeof view.previewMode?.getScroll === "function"
      ? view.previewMode.getScroll()
      : this.getFallbackScroll(view);
  }
  applyScroll(view, pos) {
    if (typeof view.previewMode?.applyScroll === "function")
      view.previewMode.applyScroll(pos);
    else this.setFallbackScroll(view, pos);
  }
  getFallbackScroll(view) {
    const el =
      view.containerEl.querySelector(".markdown-reading-view") ??
      view.containerEl.querySelector(".markdown-preview-view");
    return { x: 0, y: el?.scrollTop ?? 0 };
  }
  setFallbackScroll(view, { y }) {
    const el =
      view.containerEl.querySelector(".markdown-reading-view") ??
      view.containerEl.querySelector(".markdown-preview-view");
    if (el) el.scrollTop = y;
  }

  /*────────── 소스 위치 헬퍼 함수 ──────────*/
  posViaSourcePos(node) {
    if (!node) return null;
    let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    // 최대 5단계까지 부모 탐색 (무한 루프 방지)
    let count = 0;
    while (el && !el.getAttribute("data-sourcepos") && count < 5) {
        el = el.parentElement;
        count++;
    }
    if (!el || !el.getAttribute("data-sourcepos")) return null;
    const sourcePosAttr = el.getAttribute("data-sourcepos");
    if (!sourcePosAttr) return null;

    const [start] = sourcePosAttr.split("-");
    const [lStr, cStr] = start.split(":");

    // lStr, cStr이 유효한 숫자인지 확인
    const l = parseInt(lStr, 10);
    const c = parseInt(cStr, 10);

    if (isNaN(l) || isNaN(c)) return null; // 유효하지 않은 위치 데이터

    const viewData = this.app.workspace
      .getActiveViewOfType(MarkdownView)
      ?.getViewData();

    if (!viewData) return null;

    const lines = viewData.split("\n");
    let off = 0;
    // sourcepos는 1-indexed이므로 l-1까지 반복
    for (let i = 0; i < l - 1; i++) {
        if (lines[i] === undefined) return null; // 범위 초과 안전 처리
        off += lines[i].length + 1; // 줄바꿈 문자(\n) 포함하여 +1
    }
    // sourcepos는 1-indexed이므로 c-1
    return off + (c - 1);
  }


  /*────────── 링크 포함 텍스트 매칭 (폴백 탐색) ──────────*/
  findMatchWithLinks(source, snippet) {
    /* A. 고유한 직접 매칭 시도 */
    const direct = this.uniqueDirectMatch(source, snippet);
    if (direct[0] != null) return direct;

    /* B. 위치 맵 생성 후 렌더링된 텍스트에서 검색 */
    const positionMap = this.createPositionMap(source);
    const rendered = positionMap.renderedText;

    // 렌더링된 텍스트에서 매칭 탐색
    const renderedMatch = this.findBestMatch(rendered, snippet);
    if (renderedMatch[0] != null) {
      // 렌더링 텍스트의 위치를 마크다운 소스 위치로 변환
      return this.mapRenderedPositionsToSource(positionMap, renderedMatch);
    }

    /* C. 유연한 매칭 (마지막 폴백) */
    return this.findFlexibleMatch(source, snippet);
  }

  /*────────── 위치 맵 생성 (마크다운 → 렌더링 텍스트) ──────────*/
  createPositionMap(source, baseOffset = 0) {
    const map = [];
    let renderedText = '';
    let sourcePos = 0;

    while (sourcePos < source.length) {
      const char = source[sourcePos];
      const prevChar = sourcePos > 0 ? source[sourcePos - 1] : "";

      // 인라인 HTML 태그는 렌더링 텍스트에서 제거됨 (예: <a id="..."></a>)
      if (char === "<" && prevChar !== "\\") {
        const htmlTag = this.detectInlineHtmlTag(source, sourcePos);
        if (htmlTag) {
          sourcePos += htmlTag.length;
          continue;
        }
      }

      // 마크다운 링크 감지: [텍스트](url)
      if (char === '[' && prevChar !== "\\") {
        const mdLinkMatch = source.slice(sourcePos).match(/^\[([^\]]+)\]\([^)]*\)/);
        if (mdLinkMatch) {
          const fullMatch = mdLinkMatch[0];
          const linkText = mdLinkMatch[1];

          // 링크 텍스트의 각 문자 위치 맵핑
          for (let i = 0; i < linkText.length; i++) {
            map.push({
              sourceStart: baseOffset + sourcePos,
              sourceEnd: baseOffset + sourcePos + fullMatch.length,
              renderedPos: renderedText.length + i,
              isInLink: true,
              linkType: 'markdown'
            });
          }

          renderedText += linkText;
          sourcePos += fullMatch.length;
          continue;
        }

        // 위키링크 감지: [[링크|표시텍스트]] 또는 [[링크]]
        const wikiLinkMatch = source.slice(sourcePos).match(/^\[\[([^\]|]*?)(?:\|([^\]]*?))?\]\]/);
        if (wikiLinkMatch) {
          const fullMatch = wikiLinkMatch[0];
          const displayText = wikiLinkMatch[2] || wikiLinkMatch[1];

          // 표시 텍스트의 각 문자 위치 맵핑
          for (let i = 0; i < displayText.length; i++) {
            map.push({
              sourceStart: baseOffset + sourcePos,
              sourceEnd: baseOffset + sourcePos + fullMatch.length,
              renderedPos: renderedText.length + i,
              isInLink: true,
              linkType: 'wiki'
            });
          }

          renderedText += displayText;
          sourcePos += fullMatch.length;
          continue;
        }
      }

      // 기타 마크다운 인라인 서식 감지: *, _, ~, =, `
      if (
        prevChar !== "\\" &&
        (char === '*' || char === '_' || char === '~' || char === '=' || char === '`')
      ) {
        const formatting = this.detectFormatting(source, sourcePos);
        if (formatting) {
          if (formatting.isCode) {
            for (let i = 0; i < formatting.content.length; i++) {
              const start = baseOffset + sourcePos + formatting.startOffset + i;
              map.push({
                sourceStart: start,
                sourceEnd: start + 1,
                renderedPos: renderedText.length + i,
                isInLink: false,
                linkType: null
              });
            }
            renderedText += formatting.content;
          } else {
            const nested = this.createPositionMap(
              formatting.content,
              baseOffset + sourcePos + formatting.startOffset
            );
            const renderedBase = renderedText.length;
            for (const entry of nested.map) {
              map.push({
                ...entry,
                renderedPos: entry.renderedPos + renderedBase,
              });
            }
            renderedText += nested.renderedText;
          }

          sourcePos += formatting.fullLength;
          continue;
        }
      }

      // 일반 문자
      map.push({
        sourceStart: baseOffset + sourcePos,
        sourceEnd: baseOffset + sourcePos + 1,
        renderedPos: renderedText.length,
        isInLink: false,
        linkType: null
      });

      renderedText += char;
      sourcePos++;
    }

    return { renderedText, map };
  }

  /*────────── 마크다운 인라인 서식 감지 ──────────*/
  detectFormatting(source, pos) {
    const remaining = source.slice(pos);

    const codeSpan = this.detectCodeSpan(remaining);
    if (codeSpan) return codeSpan;

    // 긴 delimiter를 먼저 처리해 중첩/복합 서식 우선 인식
    const delimiters = ["***", "___", "**", "__", "~~", "==", "*", "_"];
    for (const delimiter of delimiters) {
      if (!remaining.startsWith(delimiter)) continue;
      if (delimiter.includes("_") && !this.isUnderscoreOpeningValid(source, pos, delimiter.length)) {
        continue;
      }

      const closeIndex = this.findClosingDelimiter(remaining, delimiter);
      if (closeIndex <= delimiter.length) continue;

      return {
        content: remaining.slice(delimiter.length, closeIndex),
        startOffset: delimiter.length,
        fullLength: closeIndex + delimiter.length,
        isCode: false,
      };
    }

    return null;
  }

  detectCodeSpan(text) {
    if (!text.startsWith("`")) return null;
    const closeIndex = text.indexOf("`", 1);
    if (closeIndex <= 1) return null;

    return {
      content: text.slice(1, closeIndex),
      startOffset: 1,
      fullLength: closeIndex + 1,
      isCode: true,
    };
  }

  detectInlineHtmlTag(source, pos) {
    const remaining = source.slice(pos);

    const commentMatch = remaining.match(/^<!--[\s\S]*?-->/);
    if (commentMatch) return commentMatch[0];

    const tagMatch = remaining.match(/^<\/?[A-Za-z][^>\n]*>/);
    if (tagMatch) return tagMatch[0];

    return null;
  }

  findClosingDelimiter(text, delimiter) {
    let searchFrom = delimiter.length;
    while (searchFrom <= text.length - delimiter.length) {
      const index = text.indexOf(delimiter, searchFrom);
      if (index === -1) return -1;

      // 이스케이프된 delimiter는 닫힘으로 보지 않음
      if (text[index - 1] === "\\") {
        searchFrom = index + delimiter.length;
        continue;
      }

      if (
        delimiter.includes("_") &&
        !this.isUnderscoreClosingValid(text, index, delimiter.length)
      ) {
        searchFrom = index + delimiter.length;
        continue;
      }

      return index;
    }

    return -1;
  }

  isUnderscoreOpeningValid(source, pos, delimiterLength) {
    const before = pos > 0 ? source[pos - 1] : "";
    const after = source[pos + delimiterLength] ?? "";
    if (!after || /\s/.test(after)) return false;
    if (this.isWordLike(before) && this.isWordLike(after)) return false;
    return true;
  }

  isUnderscoreClosingValid(text, index, delimiterLength) {
    const before = index > 0 ? text[index - 1] : "";
    const after = text[index + delimiterLength] ?? "";
    if (!before || /\s/.test(before)) return false;
    if (this.isWordLike(before) && this.isWordLike(after)) return false;
    return true;
  }

  isWordLike(char) {
    return !!char && /[\p{L}\p{N}]/u.test(char);
  }

  /*────────── 최적 매칭 탐색 ──────────*/
  findBestMatch(text, snippet) {
    const normalizedSnippet = snippet.trim();

    // 정확한 매칭 시도
    const exactMatch = this.uniqueDirectMatch(text, normalizedSnippet);
    if (exactMatch[0] != null) return exactMatch;

    // 공백 정규화 후 매칭 시도
    const normalizedText = text.replace(/\s+/g, ' ');
    const normalizedSnippetSpaces = normalizedSnippet.replace(/\s+/g, ' ');

    let pos = 0;
    const matches = [];

    while ((pos = normalizedText.indexOf(normalizedSnippetSpaces, pos)) !== -1) {
      matches.push([pos, pos + normalizedSnippetSpaces.length]);
      pos++;
    }

    if (matches.length === 1) {
      // 원본 텍스트의 실제 위치로 다시 맵핑
      return this.mapNormalizedToOriginal(text, normalizedText, matches[0]);
    }

    return [null, null];
  }

  /*────────── 정규화된 텍스트 위치를 원본 텍스트 위치로 변환 ──────────*/
  mapNormalizedToOriginal(originalText, normalizedText, [normalizedStart, normalizedEnd]) {
    let originalPos = 0;
    let normalizedPos = 0;
    let originalStart = null;
    let originalEnd = null;

    while (originalPos < originalText.length && normalizedPos <= normalizedEnd) {
      if (normalizedPos === normalizedStart) {
        originalStart = originalPos;
      }

      const originalChar = originalText[originalPos];
      const normalizedChar = normalizedText[normalizedPos];

      if (originalChar === normalizedChar) {
        originalPos++;
        normalizedPos++;
      } else if (/\s/.test(originalChar)) {
        // 원본의 연속 공백 = 정규화 텍스트의 공백 1개
        originalPos++;
        while (originalPos < originalText.length && /\s/.test(originalText[originalPos])) {
          originalPos++;
        }
        normalizedPos++;
      } else {
        originalPos++;
      }

      if (normalizedPos === normalizedEnd) {
        originalEnd = originalPos;
      }
    }

    return [originalStart, originalEnd];
  }

  /*────────── 렌더링된 위치를 소스 위치로 변환 ──────────*/
  mapRenderedPositionsToSource(positionMap, [renderedStart, renderedEnd]) {
    const { map } = positionMap;

    // 시작 위치와 끝 위치에 해당하는 맵 엔트리 탐색
    let startEntry = null;
    let endEntry = null;

    for (const entry of map) {
      if (entry.renderedPos === renderedStart && startEntry === null) {
        startEntry = entry;
      }
      if (entry.renderedPos === renderedEnd - 1) {
        endEntry = entry;
      }
    }

    if (!startEntry || !endEntry) {
      return [null, null];
    }

    // 시작과 끝이 같은 링크 안에 있으면 링크 전체를 소스 범위로 사용
    if (startEntry.isInLink && endEntry.isInLink &&
        startEntry.sourceStart === endEntry.sourceStart) {
      return [startEntry.sourceStart, startEntry.sourceEnd];
    }

    const sourceStart = startEntry.sourceStart;
    const sourceEnd = endEntry.sourceEnd;

    return [sourceStart, sourceEnd];
  }

  /*────────── 유연한 매칭 (첫 단어~마지막 단어 사이 정규식) ──────────*/
  findFlexibleMatch(source, snippet) {
    const words = snippet.trim().split(/\s+/);
    if (words.length < 2) return [null, null];

    const firstWord = this.escapeForRegex(words[0]);
    const lastWord = this.escapeForRegex(words[words.length - 1]);

    try {
      const regex = new RegExp(`${firstWord}[\\s\\S]*?${lastWord}`, 'gi');
      const matches = [...source.matchAll(regex)];

      // 원래 snippet 길이의 3배 이내인 매칭만 유효한 것으로 처리
      const validMatches = matches.filter(match =>
        match[0].length <= snippet.length * 3
      );

      if (validMatches.length === 1) {
        const match = validMatches[0];
        return [match.index, match.index + match[0].length];
      }
    } catch (e) {
      // 정규식 오류 무시 (특수문자 등으로 인한 오류 방지)
    }

    return [null, null];
  }

  /*────────── 유틸리티 함수 ──────────*/
  uniqueDirectMatch(src, text) {
    const idx = src.indexOf(text);
    if (idx === -1) return [null, null];
    // 같은 텍스트가 두 번 이상 나타나면 위치를 특정할 수 없으므로 null 반환
    if (src.indexOf(text, idx + text.length) !== -1) return [null, null];
    return [idx, idx + text.length];
  }

  escapeForRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}

module.exports = ReadingHighlighterPlugin;
module.exports.default = ReadingHighlighterPlugin;
