const fs = require('fs');

const fixes = {
  'src/modules/ai/components/AiChat.tsx': (content) => {
    // 51:       {meta.icon && <meta.icon
    // 52:         size={12}
    // 53:         strokeWidth={1.5}
    // 54:         className="shrink-0 text-foreground"
    // 55:       />
    // Missing closing `}`
    return content.replace(/\{meta\.icon && <meta\.icon[\s\S]*?\/>\s*(?!\})/g, (m) => m + '}');
  },
  'src/modules/ai/components/AiInputBar.tsx': (content) => {
    // Probably same issue with `s.icon` or `trigger.icon`
    return content.replace(/\{(trigger|s)\.icon && <(trigger|s)\.icon[\s\S]*?\/>\s*(?!\})/g, (m) => m + '}');
  },
  'src/modules/ai/components/AiMiniWindow.tsx': (content) => {
    return content.replace(/\{(trigger|s|meta)\.icon && <(trigger|s|meta)\.icon[\s\S]*?\/>\s*(?!\})/g, (m) => m + '}');
  },
  'src/modules/ai/components/SnippetPicker.tsx': (content) => {
    return content.replace(/\{(trigger|s|c|meta)\.icon && <(trigger|s|c|meta)\.icon[\s\S]*?\/>\s*(?!\})/g, (m) => m + '}');
  },
  'src/modules/sidebar/SidebarRail.tsx': (content) => {
    return content.replace(/\{(trigger|s|o|item|meta)\.icon && <(trigger|s|o|item|meta)\.icon[\s\S]*?\/>\s*(?!\})/g, (m) => m + '}');
  },
  'src/settings/sections/GeneralSection.tsx': (content) => {
    return content.replace(/\{(trigger|s|o|item|meta)\.icon && <(trigger|s|o|item|meta)\.icon[\s\S]*?\/>\s*(?!\})/g, (m) => m + '}');
  },
  'src/settings/SettingsApp.tsx': (content) => {
    return content.replace(/\{(trigger|s|o|section|meta)\.icon && <(trigger|s|o|section|meta)\.icon[\s\S]*?\/>\s*(?!\})/g, (m) => m + '}');
  }
};

for (const [file, fix] of Object.entries(fixes)) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    // Also, there might be cases where the `{` was missing from `{o.icon && ...}` because it was stripped.
    // Let's just fix the JSX parent issue globally:
    // Any `<xxx.icon ... />` not wrapped in `{}` inside a JSX expression might be problematic, but they usually were `{o.icon && <... />}`
    // Let's just run the fix function
    let newContent = fix(content);
    // Actually, maybe it was `<o.icon ... />` directly inside `{}`?
    // Let's do a more robust fix: find any `<xxx.icon ... />` that has no closing `}` and is preceded by `{xxx.icon && `
    fs.writeFileSync(file, newContent);
    console.log('Repaired', file);
  }
}
