const fs = require("fs");
const path = require("path");
const vm = require("vm");

function loadPluginClass() {
  const pluginPath = path.join(__dirname, "..", "main.js");
  const code = fs.readFileSync(pluginPath, "utf8");
  const sandbox = {
    module: { exports: {} },
    exports: {},
    require(name) {
      if (name === "obsidian") {
        return {
          Plugin: class {},
          MarkdownView: class {},
          Notice: class {},
          Platform: { isMobile: false },
          setIcon() {},
        };
      }

      return require(name);
    },
    console,
    Node: { TEXT_NODE: 3 },
    document: {
      getSelection() {
        return null;
      },
    },
    requestAnimationFrame(callback) {
      callback();
    },
    setTimeout,
    clearTimeout,
  };

  vm.runInNewContext(code, sandbox, { filename: pluginPath });
  return sandbox.module.exports.default || sandbox.module.exports;
}

function createPlugin() {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  plugin.app = {
    workspace: {
      getActiveViewOfType() {
        return null;
      },
    },
  };
  return plugin;
}

function highlightSnippet(plugin, source, snippet, roughStart = 0, roughEnd = roughStart) {
  const range = plugin.resolveSelectionRange(source, snippet, null, null, roughStart, roughEnd);
  if (!range) {
    throw new Error(`Failed to resolve snippet: ${snippet}`);
  }

  const adjusted = plugin.adjustHighlightRange(source, range[0], range[1]);
  if (!adjusted) {
    throw new Error(`Failed to adjust range for snippet: ${snippet}`);
  }

  return plugin.applyHighlightToSource(source, adjusted[0], adjusted[1]);
}

module.exports = {
  createPlugin,
  highlightSnippet,
};
